import Phaser from 'phaser';
import { sliceConvex } from '../slice/PolyKSlicer';
import { decomposeIfConcave } from '../slice/Decomposer';
import {
  computeCentroid,
  sideOfLine,
  sliceNormal,
  type Polygon,
  type Vec2,
} from '../slice/Geometry';
import { GAME_HEIGHT } from '../config/game';
import { FragmentPool } from '../perf/FragmentPool';

/**
 * BodySplitter (фаза 3) — разрезает Matter-тело на 2 физических фрагмента.
 *
 * Архитектурный принцип: чистая геометрия в src/slice/ (PolyKSlicer, Decomposer),
 * здесь — тонкая Phaser-обёртка:
 *   - получить world-space вершины тела из Matter (body.vertices);
 *   - вызвать PolyKSlicer.sliceConvex для разреза;
 *   - для каждого фрагмента: Decomposer.decomposeIfConcave (если вогнутый);
 *   - удалить старое Matter-тело из world;
 *   - создать новые Matter-тела (fromVertices) + Graphics-спрайты;
 *   - задать импульс разлёта через positionPrev (вдоль нормали реза);
 *   - отслеживать фрагменты в update() для синхронизации спрайта и деспавна.
 *
 * Фрагменты имеют label 'ndt-fragment' — SliceSystem их игнорирует (не режет).
 *
 * Фаза 7 (полировка): обёртки ActiveFragment переиспользуются через FragmentPool
 * (acquire при создании, release при деспавне). Сами Phaser-объекты (body/sprite)
 * создаются/уничтожаются каждый slice (геометрия различается), но JS-обёртка не
 * аллоцируется заново — снижается давление на GC. Пул НЕ владеет ресурсами Phaser.
 *
 * NOT pure-logic: импортирует Phaser.
 */

/** Лейбл Matter-тела для фрагмента. SliceSystem пропускает такие тела. */
export const FRAGMENT_BODY_LABEL = 'ndt-fragment';

/** Запас по нижней границе экрана для деспавна фрагментов, px. */
const FRAGMENT_DESPAWN_MARGIN = 100;
/**
 * Максимальный размер пула обёрток фрагментов (фаза 7).
 * Крышка аллокаций: при типичном геймплее одновременных фрагментов < 64.
 */
const FRAGMENT_POOL_MAX_SIZE = 64;

/** Опции конструктора BodySplitter. */
export interface BodySplitterOptions {
  /** Скорость разлёта фрагментов, px/frame (position-Verlet). */
  readonly fragmentSpeed?: number;
  /** Цвет спрайта фрагмента. */
  readonly fragmentColor?: number;
}

/** Данные созданного фрагмента (возвращаются из sliceBody для SliceEvent). */
export interface FragmentData {
  readonly vertices: ReadonlyArray<Vec2>;
  readonly velocity: Vec2;
}

/**
 * Активный фрагмент: связка Matter-тела + спрайта.
 * Поля НЕ readonly — обёртка переиспользуется через FragmentPool (фаза 7):
 * acquire возвращает пустую оболочку, body/sprite присваиваются перед использованием.
 */
interface ActiveFragment {
  body: MatterJS.BodyType;
  sprite: Phaser.GameObjects.Graphics;
}

export class BodySplitter {
  /** Активные фрагменты, ожидающие деспавна. */
  private readonly fragments = new Set<ActiveFragment>();
  private readonly fragmentSpeed: number;
  private readonly fragmentColor: number;
  /**
   * Пул обёрток фрагментов (фаза 7). Хранит освобождённые оболочки для переиспользования.
   * Сам Phaser-объект (body/sprite) после release уже уничтожен/удалён — пул держит
   * только ссылку на JS-объект-обёртку, которая будет переприсвоена при acquire.
   */
  private readonly pool = new FragmentPool<ActiveFragment>(
    () => ({
      // Оболочка создаётся пустой; body/sprite присваиваются в createFragment.
      // Cast: тип требует non-null, но до первого acquire+assign поля не читаются.
      body: null as unknown as MatterJS.BodyType,
      sprite: null as unknown as Phaser.GameObjects.Graphics,
    }),
    FRAGMENT_POOL_MAX_SIZE,
  );
  private destroyed = false;

  constructor(
    protected readonly scene: Phaser.Scene,
    options: BodySplitterOptions = {},
  ) {
    this.fragmentSpeed = options.fragmentSpeed ?? 3.5;
    this.fragmentColor = options.fragmentColor ?? 0xaad4ff;
  }

  /** Число активных фрагментов. */
  get fragmentCount(): number {
    return this.fragments.size;
  }

  /** Число свободных обёрток в пуле (фаза 7 — для аудита/тестов). */
  get poolSize(): number {
    return this.pool.size;
  }

  /**
   * Разрезает тело по линии реза. Удаляет исходное тело из Matter world, создаёт
   * новые фрагменты. Возвращает данные фрагментов (для SliceEvent) или null,
   * если разрез не удался (линия не пересекает / полигон вырожденный).
   *
   * @param body Matter-тело для разреза (будет удалён из world).
   * @param sliceLine Линия реза в world-координатах.
   */
  sliceBody(
    body: MatterJS.BodyType,
    sliceLine: { from: Vec2; to: Vec2 },
  ): FragmentData[] | null {
    if (this.destroyed) return null;

    // 1. World-space вершины тела (Matter обновляет их каждый шаг).
    const worldVertices = body.vertices;
    if (!worldVertices || worldVertices.length < 3) return null;
    const worldPolygon: Polygon = worldVertices.map((v) => ({ x: v.x, y: v.y }));

    // 2. Разрезаем полигон.
    const sliced = sliceConvex(worldPolygon, sliceLine);
    if (!sliced) return null;
    const [rawA, rawB] = sliced;

    // 3. Для каждого фрагмента: если вогнутый — разбиваем на выпуклые.
    // SliceSystem ожидает массив FragmentData (вершины + скорость). Если фрагмент
    // разложился на несколько выпуклых, они создаются как ОДНО compound-тело
    // (но в FragmentData перечислены все полигоны). Для простоты фазы 3 — берём
    // только первый выпуклый полигон из разложения; этого достаточно для аркады.
    const fragmentPolygons: Polygon[] = [];
    const aParts = decomposeIfConcave(rawA);
    const bParts = decomposeIfConcave(rawB);
    if (aParts.length > 0) fragmentPolygons.push(aParts[0]);
    if (bParts.length > 0) fragmentPolygons.push(bParts[0]);
    if (fragmentPolygons.length < 2) return null;

    // 4. Удаляем исходное тело из world.
    this.scene.matter.world.remove(body);

    // 5. Создаём новые фрагменты.
    const normal = sliceNormal(sliceLine.from, sliceLine.to);
    const fragmentsData: FragmentData[] = [];
    for (const poly of fragmentPolygons) {
      const centroid = computeCentroid(poly);
      const side = sideOfLine(sliceLine.from, sliceLine.to, centroid);
      const dir = side >= 0 ? 1 : -1;
      const velocity = {
        x: normal.x * this.fragmentSpeed * dir,
        y: normal.y * this.fragmentSpeed * dir,
      };

      const fragment = this.createFragment(poly, centroid, velocity);
      if (fragment) {
        fragmentsData.push({ vertices: poly, velocity });
      }
    }

    return fragmentsData.length > 0 ? fragmentsData : null;
  }

  /**
   * Per-frame апдейт: синхронизация спрайтов фрагментов с телами + деспавн.
   * GameScene вызывает из своего update().
   */
  update(): void {
    if (this.destroyed) return;
    const despawnY = GAME_HEIGHT + FRAGMENT_DESPAWN_MARGIN;
    for (const f of Array.from(this.fragments)) {
      f.sprite.x = f.body.position.x;
      f.sprite.y = f.body.position.y;
      f.sprite.rotation = f.body.angle;
      if (f.body.position.y > despawnY) {
        this.removeFragment(f);
      }
    }
  }

  /** Уничтожение всех фрагментов (для shutdown). Идемпотентен. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const f of Array.from(this.fragments)) {
      this.removeFragment(f);
    }
    this.fragments.clear();
    // Опустошаем пул: оболочки больше не нужны (сцена уничтожается).
    this.pool.clear();
  }

  // --- Внутренние ---

  /** Создаёт Matter-тело + спрайт для фрагмента. */
  private createFragment(
    polygon: Polygon,
    centroid: Vec2,
    velocity: Vec2,
  ): ActiveFragment | null {
    // fromVertices принимает вершины в world-space; Matter центрирует их
    // относительно переданной позиции (centroid).
    const vertexSets = [polygon.map((v) => ({ x: v.x, y: v.y }))];
    const body = this.scene.matter.add.fromVertices(
      centroid.x,
      centroid.y,
      vertexSets as unknown as Phaser.Types.Math.Vector2Like[],
      {
        label: FRAGMENT_BODY_LABEL,
        restitution: 0.2,
        friction: 0.05,
        frictionAir: 0.01,
      },
    );

    // Импульс разлёта через positionPrev (position-Verlet).
    body.positionPrev.x = body.position.x - velocity.x;
    body.positionPrev.y = body.position.y - velocity.y;

    // Placeholder-спрайт: Graphics с полигоном фрагмента (в LOCAL координатах,
    // т.е. центрированный в 0,0). Спрайт позиционируется в update() по body.position.
    const sprite = this.scene.add.graphics();
    this.drawFragmentSprite(sprite, polygon, centroid);
    sprite.setDepth(10);
    sprite.x = body.position.x;
    sprite.y = body.position.y;
    sprite.rotation = body.angle;

    // Фаза 7: переиспользуем оболочку ActiveFragment из пула (acquire),
    // присваивая body/sprite. Снижаем аллокации на каждый slice.
    const fragment = this.pool.acquire();
    fragment.body = body;
    fragment.sprite = sprite;
    this.fragments.add(fragment);
    return fragment;
  }

  /** Удаляет фрагмент: Matter-тело + спрайт. Освобождает оболочку в пул. */
  private removeFragment(f: ActiveFragment): void {
    // При shutdown сцены matter.world уже может быть уничтожен (null) —
    // guard от "Cannot read 'remove' of null". Phaser сам почистит тела.
    const world = this.scene?.matter?.world;
    if (world && f.body) {
      world.remove(f.body);
    }
    // sprite.active становится false после destroy() — используем как guard.
    if (f.sprite?.active) {
      f.sprite.destroy();
    }
    this.fragments.delete(f);
    // Фаза 7: возвращаем оболочку в пул для переиспользования.
    // При переполнении пула release вернёт false — оболочка уходит в GC.
    this.pool.release(f);
  }

  /** Рисует полигон фрагмента в LOCAL координатах (центрированный в 0,0). */
  private drawFragmentSprite(
    g: Phaser.GameObjects.Graphics,
    polygon: Polygon,
    centroid: Vec2,
  ): void {
    if (polygon.length < 3) return;
    g.fillStyle(this.fragmentColor, 1);
    g.lineStyle(2, 0xffffff, 1);
    g.beginPath();
    g.moveTo(polygon[0].x - centroid.x, polygon[0].y - centroid.y);
    for (let i = 1; i < polygon.length; i++) {
      g.lineTo(polygon[i].x - centroid.x, polygon[i].y - centroid.y);
    }
    g.closePath();
    g.fillPath();
    g.strokePath();
  }
}
