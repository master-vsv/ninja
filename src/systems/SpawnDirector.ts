import Phaser from 'phaser';
import { EventBus } from '../events/EventBus';
import { eventBus as defaultEventBus } from '../events/EventBus';
import { EVENT, type NDTObjectKind } from '../events/types';
import type { MissEvent } from '../events/MissEvent';
import { OBJECT_REGISTRY } from '../config/objects';
import { POWERUP_COLORS, POWERUP_KINDS } from '../game/PowerUpType';
import type { PowerUpType } from '../game/PowerUpType';
import type { PowerUpState } from '../game/PowerUpState';
import { computeLaunchVelocity } from '../spawn/Ballistics';
import {
  isBelowBounds,
  createMissEvent,
  type DespawnInput,
} from '../spawn/DespawnChecker';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/game';
import { CYBER } from '../scenes/CyberpunkBackground';
import type { WaveConfig } from '../wave/WaveConfig';
import {
  compose,
  projectOrthographic,
  rotateX,
  rotateY,
  type Mesh3D,
} from '../threed';

/**
 * SpawnDirector (фаза 2) — Phaser-обёртка над спавном NDT-объектов.
 *
 * Архитектурный принцип (как в InputSystem): чистая логика вынесена в
 * тестируемые модули (Ballistics, DespawnChecker, OBJECT_REGISTRY, threed/),
 * здесь — только тонкая Phaser-зависимая часть:
 *   - создание Matter-тела (scene.matter.add.fromVertices) из 2D-вершин OBJECT_REGISTRY;
 *   - создание wireframe-спрайта (Graphics с 3D-проекцией mesh3D);
 *   - установка стартовой скорости и angular velocity через Matter position-Verlet
 *     (positionPrev = position - velocity, anglePrev = angle - angularVelocity);
 *   - в update(): синхронизация позиции спрайта с телом + перерисовка wireframe
 *     (вращение через 3D-матрицу из body.angle + scene.time.now) + проверка деспавна;
 *   - при деспавне: удалить тело+спрайт (без утечки в Matter world) + эмит 'miss'.
 *
 * В фазе 2 спавн по таймеру — простой интервал (волны — фаза 6).
 *
 * НЕ трогает SliceSystem/BodySplitter/Bomb/Life/Score — это фаза 3+.
 * 2D-vertices в OBJECT_REGISTRY по-прежнему используются slice-детекцией; mesh3D —
 * только визуал (Tron/голо-стиль).
 */

/** Опции конструктора SpawnDirector. */
export interface SpawnDirectorOptions {
  /**
   * EventBus для эмита 'miss'. По умолчанию — глобальный синглтон.
   * GameScene передаёт сюда инстанс для явной DI.
   */
  readonly eventBus?: EventBus;
  /** Запас по нижней границе экрана для деспавна, px. */
  readonly despawnMargin?: number;
  /** Целевая пиковая высота (Y-координата вершины дуги). */
  readonly peakHeight?: number;
  /**
   * Фаза 6: провайдер текущей WaveConfig (pull-модель из WaveState).
   * Если задан — spawnRandom использует wave.bombPercent, spawn —
   * wave.speedMultiplier (умножается на SPEED_MULTIPLIER).
   * Если не задан — fallback на BOMB_PERCENT_FALLBACK (20%) и speedMul=1
   * (обратная совместимость, чистая логика без волн).
   */
  readonly getWaveConfig?: () => WaveConfig | undefined;
  /**
   * Провайдер PowerUpState (pull-модель). Если задан — spawn() применяет
   * getSpeedMultiplier() к стартовой скорости (slow эффект), а update()
   * применяет getScaleMultiplier() к sprite.scale всех активных объектов
   * (shrink/grow эффекты). Если не задан — power-up эффекты не действуют
   * (обратная совместимость со старыми тестами без PowerUpState).
   */
  readonly getPowerUpState?: () => PowerUpState | undefined;
}

/** Активный (живой) объект: связка Matter-тела + спрайта + метаданных. */
export interface ActiveBody {
  readonly bodyId: number;
  readonly kind: NDTObjectKind;
  readonly isBomb: boolean;
  readonly body: MatterJS.BodyType;
  readonly sprite: Phaser.GameObjects.Graphics;
  /**
   * Power-up тип объекта, если это спец-фигура (shrink/grow/slow).
   * undefined для обычных объектов. Используется update() для spawn-а
   * блёсток вокруг power-up и removeWithoutEmit для cleanup ауры.
   */
  readonly powerUp?: PowerUpType;
  /**
   * Аура power-up (полупрозрачный круг в цвете эффекта за wireframe).
   * Только для power-up объектов. Создаётся в spawn(), уничтожается в
   * removeWithoutEmit(). Позиция синхронизируется с телом в update().
   */
  aura?: Phaser.GameObjects.Graphics;
  /** Timestamp последнего spawn-а блёсток (scene.time.now), power-up only. */
  lastSparkleMs?: number;
}

/** Префикс лейбла Matter-тела для NDT-объектов. Использует SliceSystem для фильтрации. */
export const NDT_BODY_LABEL_PREFIX = 'ndt-';

/** Дефолты — подобраны под разрешение 1280×720 и feeling аркады. */
const DEFAULT_DESPAWN_MARGIN = 100;
const DEFAULT_PEAK_HEIGHT = 120;
/**
 * Множитель стартовой скорости объектов. < 1 = медленнее (легче попасть свайпом),
 * но объект поднимается ниже пика (пропорц. квадрату множителя). 0.7 — баланс:
 * заметно медленнее исходного, дуга держится в playable-зоне экрана.
 * НЕ использовать gravityY или scene.time.timeScale для замедления — они ломают
 * синхронизацию Ballistics (px/frame²) ↔ Matter (internal units / Verlet).
 */
const SPEED_MULTIPLIER = 0.55;
const SPAWN_BOTTOM_OFFSET = 60; // старт ниже видимой области (y = HEIGHT + offset)

/**
 * Множитель скорости вращения по X (для 3D-depth анимации wireframe).
 * rotateX(timeMs * TIME_ROTATION_X) — лёгкий наклон, не зависящий от физики.
 */
const TIME_ROTATION_X = 0.002;

/**
 * Режимые виды объектов для spawnRandom (pipe отдельно с вероятностью).
 * Включая новые NDT-методы: probe (UT), magnet (MT), penetrant (PT) —
 * спавнятся наравне с базовыми видами.
 */
const SLICABLE_KINDS: ReadonlyArray<NDTObjectKind> = [
  'bolt',
  'nut',
  'ruler',
  'standard',
  'probe',
  'magnet',
  'penetrant',
];

/**
 * Fallback-доля труб-бомб в spawnRandom, если WaveConfig не задан.
 * Историческое значение до фазы 6 (= 20%) — сохранено для обратной
 * совместимости и тестов без волн.
 */
const BOMB_PERCENT_FALLBACK = 0.2;

/**
 * Доля power-up фигур в spawnRandom (поверх bombPercent). Зависит от уровня:
 * высокая на старте (15%), уменьшается на 1.5% за уровень, минимум 3%.
 * На высоких уровнях power-up реже → больше challenge.
 *
 * L1=15%, L2=13.5%, L5=9%, L8=4.5%, L9+=3% (floor).
 */
function computePowerUpPercent(level: number): number {
  return Math.max(0.03, 0.15 - (level - 1) * 0.015);
}

/**
 * Интервал спавна блёсток вокруг power-up объекта, мс (ТЗ: ~300мс).
 * Маленькие квадратики (Graphics fillRect) разлетаются + fade —
 * Canvas-совместимо (без particle emitter).
 */
const POWERUP_SPARKLE_INTERVAL_MS = 300;

/** Радиус ауры power-up (fillCircle в цвете эффекта), px. */
const POWERUP_AURA_RADIUS = 36;

/** Альфа ауры power-up (полупрозрачный круг за wireframe). */
const POWERUP_AURA_ALPHA = 0.2;

/**
 * Gold-цвет для каски (shield-эффект). Согласован с POWERUP_COLORS.shield,
 * дублируется здесь для читаемости KIND_COLORS (как NEON_GREEN для magnet).
 */
const HELMET_GOLD = 0xffd700;
/**
 * Orange-цвет для очков (grow-эффект экипировки). Дублирует POWERUP_COLORS.grow,
 * но в KIND_COLORS задаётся явно для однородности записей экипировки.
 */
const GOGGLES_ORANGE = 0xff8a00;
/**
 * Ice-blue-цвет для маски сварщика (slow-эффект экипировки). Дублирует
 * POWERUP_COLORS.slow — записан явно для согласованности KIND_COLORS.
 */
const WELDING_MASK_ICE = 0x00d4ff;
/** Neon-green для магнита (MT). */
const NEON_GREEN = 0x39ff14;
/**
 * Цвет wireframe по виду объекта — визуальное различие фигур.
 * bolt/nut/ruler/standard/probe — cyan; magnet — green (MT); penetrant — yellow (PT);
 * pipe (бомба) — magenta (alert).
 * Power-up фигуры — насыщенные неон-цвета, отличающие их от обычных:
 *   shrink — purple, grow — orange, slow — ice-blue (см. POWERUP_COLORS).
 * NDT-экипировка (тоже power-up): helmet — gold, goggles — orange,
 * weldingMask — ice-blue (значения дублируют POWERUP_COLORS соответствующих
 * эффектов, заданы локально для читаемости KIND_COLORS).
 */
const KIND_COLORS: Record<NDTObjectKind, number> = {
  bolt: CYBER.cyan,
  nut: CYBER.cyan,
  ruler: CYBER.cyan,
  standard: CYBER.cyan,
  probe: CYBER.cyan,
  magnet: NEON_GREEN,
  penetrant: CYBER.yellow,
  pipe: CYBER.magenta,
  shrink: POWERUP_COLORS.shrink,
  grow: POWERUP_COLORS.grow,
  slow: POWERUP_COLORS.slow,
  helmet: HELMET_GOLD,
  goggles: GOGGLES_ORANGE,
  weldingMask: WELDING_MASK_ICE,
};

export class SpawnDirector {
  /** Активные тела. Set — O(1) add/delete, итерация в порядке вставки. */
  private readonly active = new Set<ActiveBody>();
  private readonly eventBus: EventBus;
  private readonly despawnMargin: number;
  private readonly peakHeight: number;
  private readonly getWaveConfig?: () => WaveConfig | undefined;
  private readonly getPowerUpState?: () => PowerUpState | undefined;
  private destroyed = false;

  constructor(
    protected readonly scene: Phaser.Scene,
    options: SpawnDirectorOptions = {},
  ) {
    this.eventBus = options.eventBus ?? defaultEventBus;
    this.despawnMargin = options.despawnMargin ?? DEFAULT_DESPAWN_MARGIN;
    this.peakHeight = options.peakHeight ?? DEFAULT_PEAK_HEIGHT;
    this.getWaveConfig = options.getWaveConfig;
    this.getPowerUpState = options.getPowerUpState;
  }

  /** Число активных (живых) объектов. */
  get activeCount(): number {
    return this.active.size;
  }

  /**
   * Снимок активных NDT-объектов. SliceSystem итерирует этот список для поиска
   * пересечений со свайпом. Возвращается копия — безопасно итерировать с удалением.
   */
  getActiveBodies(): readonly ActiveBody[] {
    return Array.from(this.active);
  }

  /**
   * Удаляет NDT-объект из трекинга после того, как он был разрезан SliceSystem.
   * Уничтожает спрайт и удаляет тело из Matter world. НЕ эмитит 'miss' (объект
   * разрезан, не упущен). Возвращает true, если объект был найден и удалён.
   */
  removeSlicedBody(bodyId: number): boolean {
    const ab = this.findActiveBody(bodyId);
    if (!ab) return false;
    this.removeWithoutEmit(ab);
    this.active.delete(ab);
    return true;
  }

  /**
   * Спавн NDT-объекта заданного вида. Старт — снизу экрана (ниже видимой
   * области) со случайной X-координатой и горизонтальным смещением к моменту
   * пика (получается «арка»).
   *
   * Power-up объекты (shrink/grow/slow) дополнительно получают:
   *   - ауру (полупрозрачный круг в цвете эффекта за wireframe, alpha-pulse);
   *   - мерцание wireframe (alpha tween 0.5↔1.0, yoyo);
   *   - спавн блёсток вокруг объекта каждые ~300мс (в update()).
   */
  spawn(kind: NDTObjectKind, x?: number): void {
    if (this.destroyed) return;
    const config = OBJECT_REGISTRY[kind];
    const startX = x ?? Phaser.Math.Between(150, GAME_WIDTH - 150);
    const startY = GAME_HEIGHT + SPAWN_BOTTOM_OFFSET;
    // Горизонталь в пике — небольшое смещение от старта (±200px), чтобы дуга
    // была «вертикальнее» и объект не улетал далеко вбок (раньше targetX был
    // случайным по всему экрану → большой vx → дуга «размазывалась» вбок).
    const targetX = Phaser.Math.Clamp(
      startX + Phaser.Math.Between(-200, 200),
      150,
      GAME_WIDTH - 150,
    );

    // 1. Matter-тело из вершин OBJECT_REGISTRY.
    // Лейбл 'ndt-${kind}' позволяет SliceSystem отличать NDT-объекты от стен/фрагментов.
    const body = this.scene.matter.add.fromVertices(
      startX,
      startY,
      config.vertices as unknown as Phaser.Types.Math.Vector2Like[],
      {
        label: `${NDT_BODY_LABEL_PREFIX}${kind}`,
        restitution: 0.1,
        friction: 0.05,
        frictionAir: 0.005,
      },
    );

    // 2. Wireframe-спрайт: Graphics с 3D-проекцией mesh3D. Содержимое рисуется
    // в drawWireframe каждый кадр (вращение меняет проекцию); здесь — первичная
    // отрисовка, чтобы спрайт не был пустым до первого update().
    const sprite = this.scene.add.graphics();
    this.drawWireframe(
      sprite,
      config.mesh3D,
      0,
      this.scene.time.now,
      kind,
    );
    sprite.setDepth(10);
    sprite.x = startX;
    sprite.y = startY;

    // Power-up визуал: аура (полупрозрачный круг в цвете эффекта за wireframe)
    // + мерцание wireframe (alpha tween yoyo). Блёстки спавнятся в update()
    // по таймеру lastSparkleMs. Аура и мерцание — Graphics + tweens, без
    // particle emitter (Canvas-совместимо).
    let aura: Phaser.GameObjects.Graphics | undefined;
    const powerUpType = config.powerUp;
    if (powerUpType) {
      aura = this.scene.add.graphics();
      aura.fillStyle(POWERUP_COLORS[powerUpType], POWERUP_AURA_ALPHA);
      aura.fillCircle(0, 0, POWERUP_AURA_RADIUS);
      aura.x = startX;
      aura.y = startY;
      aura.setDepth(9); // за wireframe (depth 10)
      // Pulse alpha (НЕ scale — scale управляется globalScale shrink/grow).
      this.scene.tweens.add({
        targets: aura,
        alpha: { from: POWERUP_AURA_ALPHA, to: POWERUP_AURA_ALPHA * 2 },
        duration: 600,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      // Мерцание wireframe: alpha 1.0 ↔ 0.5 (ТЗ: ~400мс yoyo).
      this.scene.tweens.add({
        targets: sprite,
        alpha: { from: 1, to: 0.5 },
        duration: 400,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    // Применяем глобальный множитель размера (shrink/grow) к первичной отрисовке.
    const initialScale = this.getPowerUpState?.()?.getScaleMultiplier() ?? 1;
    sprite.setScale(initialScale);
    aura?.setScale(initialScale);

    // 3. Стартовая скорость из Ballistics + position-Verlet инициализация.
    // Фаза 6: SPEED_MULTIPLIER × wave.speedMultiplier (если волна задана).
    // НЕ заменяет SPEED_MULTIPLIER — умножается НА него, чтобы сохранить
    // калибровку Ballistics (px/frame²) ↔ Matter (Verlet).
    // Power-up slow: × getSpeedMultiplier() (0.5 при активном slow) —
    // применяется ТОЛЬКО к новым объектам (как wave.speedMultiplier),
    // не меняя скорость уже летающих (риск №9: position-Verlet).
    const waveSpeedMul = this.getWaveConfig?.()?.speedMultiplier ?? 1;
    const powerUpSpeedMul = this.getPowerUpState?.()?.getSpeedMultiplier() ?? 1;
    const speedMul = SPEED_MULTIPLIER * waveSpeedMul * powerUpSpeedMul;
    const v = computeLaunchVelocity({
      startX,
      startY,
      peakHeight: this.peakHeight,
      targetX,
    });
    body.positionPrev.x = body.position.x - v.vx * speedMul;
    // Гарантируем минимальный подброс: при slow power-up (speedMul×0.5) или
    // низкой волне vy может стать слишком малым → объект едва отрывается от
    // нижней кромки. Clamp к MIN_ABS_VY обеспечивает заметную дугу всегда.
    const MIN_ABS_VY = 16;
    let vyEff = v.vy * speedMul;
    if (Math.abs(vyEff) < MIN_ABS_VY) vyEff = -MIN_ABS_VY;
    body.positionPrev.y = body.position.y - vyEff;
    // 4. Случайное вращение в полёте (rad/frame).
    const angularVel = (Math.random() - 0.5) * 0.1;
    body.anglePrev = body.angle - angularVel;

    this.active.add({
      bodyId: body.id,
      kind,
      isBomb: config.isBomb,
      body,
      sprite,
      powerUp: powerUpType,
      aura,
    });
  }

  /**
   * Случайный спавн: с вероятностью bombPercent — труба-бомба, иначе один из
   * режимых объектов. Power-up фигуры спавнятся с малой вероятностью
   * (POWERUP_SPAWN_PERCENT поверх bombPercent) — редкие спец-объекты с
   * временным эффектом при разрезе.
   *
   * Фаза 6: bombPercent берётся из текущей WaveConfig (если задан getWaveConfig).
   * Если WaveConfig не задан — fallback на BOMB_PERCENT_FALLBACK (20%,
   * обратная совместимость).
   */
  spawnRandom(): void {
    const bombPercent = this.getWaveConfig?.()?.bombPercent ?? BOMB_PERCENT_FALLBACK;
    // Динамический power-up процент: выше на старте, падает с уровнем.
    const level = (this.scene.registry.get('ndt:levelState') as { level?: number } | undefined)?.level ?? 1;
    const powerUpPercent = computePowerUpPercent(level);
    const r = Math.random();
    if (r < bombPercent) {
      this.spawn('pipe');
    } else if (r < bombPercent + powerUpPercent) {
      // Power-up: равновероятно один из экипировки (helmet/goggles/weldingMask).
      const idx = Math.floor(Math.random() * POWERUP_KINDS.length);
      this.spawn(POWERUP_KINDS[idx]);
    } else {
      const idx = Math.floor(Math.random() * SLICABLE_KINDS.length);
      this.spawn(SLICABLE_KINDS[idx]);
    }
  }

  /**
   * Per-frame апдейт: синхронизация позиции спрайтов с телами + перерисовка
   * 3D-wireframe (вращение через body.angle + scene.time.now) + проверка деспавна.
   * GameScene вызывает из своего update().
   *
   * ВАЖНО: sprite.rotation НЕ устанавливается (всегда 0) — вращение реализовано
   * через 3D-матрицу в drawWireframe, чтобы wireframe корректно проецировался.
   * Позиция (x,y) синхронизируется с body.position как обычно.
   *
   * Power-up: применяется глобальный множитель размера (shrink/grow) ко всем
   * активным объектам через sprite.setScale(). Это ВИЗУАЛЬНЫЙ эффект — Matter
   * хитбокс НЕ меняется (физика остаётся стабильной, только рендер). Аура
   * power-up синхронизируется по позиции + получает тот же scale.
   * Блёстки спавнятся вокруг power-up объекта раз в POWERUP_SPARKLE_INTERVAL_MS.
   */
  update(): void {
    if (this.destroyed) return;
    const bounds = { bottom: GAME_HEIGHT };
    const now = this.scene.time.now;
    // Глобальный множитель размера (pull-модель из PowerUpState).
    const scaleMul = this.getPowerUpState?.()?.getScaleMultiplier() ?? 1;
    // Копируем список, чтобы безопасно удалять во время итерации.
    const snapshot = Array.from(this.active);
    for (const ab of snapshot) {
      // Синхронизация позиции Graphics с Matter-телом.
      ab.sprite.x = ab.body.position.x;
      ab.sprite.y = ab.body.position.y;
      // Глобальный scale (shrink/grow) — применяется каждый кадр идемпотентно.
      ab.sprite.setScale(scaleMul);
      // Перерисовка wireframe с учётом вращения тела + времени (3D-depth).
      this.drawWireframe(ab.sprite, OBJECT_REGISTRY[ab.kind].mesh3D, ab.body.angle, now, ab.kind);

      // Аура power-up: синхронизация позиции и scale (поверх alpha-pulse tween).
      if (ab.aura) {
        ab.aura.x = ab.body.position.x;
        ab.aura.y = ab.body.position.y;
        ab.aura.setScale(scaleMul);
      }

      // Блёстки вокруг power-up объекта каждые ~300мс (ТЗ: разлёт + fade).
      if (ab.powerUp) {
        if (
          ab.lastSparkleMs === undefined ||
          now - ab.lastSparkleMs >= POWERUP_SPARKLE_INTERVAL_MS
        ) {
          ab.lastSparkleMs = now;
          this.spawnSparkles(ab.body.position.x, ab.body.position.y, ab.powerUp);
        }
      }

      // Проверка деспавна.
      if (isBelowBounds(ab.body.position.y, bounds, this.despawnMargin)) {
        this.despawn(ab);
      }
    }
  }

  /**
   * Уничтожение всех активных тел/спрайтов (без эмитов 'miss').
   * Используется при shutdown сцены.
   */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const ab of Array.from(this.active)) {
      this.removeWithoutEmit(ab);
    }
    this.active.clear();
  }

  // --- Внутренние ---

  /** Деспавн: удаляет тело+спрайт и эмитит MissEvent. */
  private despawn(ab: ActiveBody): void {
    this.removeWithoutEmit(ab);
    this.active.delete(ab);
    const input: DespawnInput = {
      bodyId: ab.bodyId,
      kind: ab.kind,
      isBomb: ab.isBomb,
      y: ab.body.position.y,
    };
    const event: MissEvent = createMissEvent(input);
    this.eventBus.emit(EVENT.miss, event);
  }

  /** Удаляет тело из Matter world и уничтожает спрайт (без эмита). Идемпотентен. */
  private removeWithoutEmit(ab: ActiveBody): void {
    // При shutdown сцены matter.world уже может быть уничтожен (null) — guard.
    const world = this.scene?.matter?.world;
    // BodySplitter мог уже удалить тело из Matter world при разрезе — проверяем,
    // чтобы не дублировать вызов (Matter выбрасывает предупреждение на повторный remove).
    const bodyStillInWorld = world && ab.body ? world.has(ab.body).length > 0 : false;
    if (bodyStillInWorld) {
      world!.remove(ab.body);
    }
    // Power-up: cleanup ауры + kill tween'ов (мерцание sprite, alpha-pulse aura).
    // Иначе tween'ы продолжили бы работать на уничтоженном объекте → утечка.
    try {
      if (ab.sprite?.active) {
        this.scene.tweens.killTweensOf(ab.sprite);
      }
      if (ab.aura?.active) {
        this.scene.tweens.killTweensOf(ab.aura);
      }
    } catch {
      // При shutdown сцены tweens-менеджер мог быть уже уничтожен — игнорируем.
    }
    // sprite.active становится false после destroy() — используем как guard.
    if (ab.sprite?.active) {
      ab.sprite.destroy();
    }
    if (ab.aura?.active) {
      ab.aura.destroy();
    }
    ab.aura = undefined;
  }

  /**
   * Спавнит блёстки вокруг power-up объекта: 5 маленьких квадратиков (Graphics
   * fillRect) разлетаются в случайных направлениях с fade-out за ~450мс.
   * Canvas-совместимо (без particle emitter). Блёстки независимы от объекта —
   * после создания живут своей жизнью и уничтожаются по onComplete tween'а.
   *
   * @param x X центра объекта (body.position.x).
   * @param y Y центра объекта (body.position.y).
   * @param powerUp тип power-up для выбора цвета (POWERUP_COLORS).
   */
  private spawnSparkles(x: number, y: number, powerUp: PowerUpType): void {
    const color = POWERUP_COLORS[powerUp];
    const count = 5;
    for (let i = 0; i < count; i++) {
      const p = this.scene.add.graphics();
      p.fillStyle(color, 1);
      p.fillRect(-2, -2, 4, 4);
      // Начальная позиция — небольшое смещение от центра объекта.
      const ox = (Math.random() - 0.5) * 20;
      const oy = (Math.random() - 0.5) * 20;
      p.x = x + ox;
      p.y = y + oy;
      p.setDepth(11); // над wireframe (depth 10)
      // Случайный разлёт + fade.
      const dx = (Math.random() - 0.5) * 50;
      const dy = (Math.random() - 0.5) * 50;
      this.scene.tweens.add({
        targets: p,
        x: p.x + dx,
        y: p.y + dy,
        alpha: { from: 1, to: 0 },
        duration: 450,
        ease: 'Sine.easeOut',
        onComplete: () => {
          if (p.active) p.destroy();
        },
      });
    }
  }

  /** Находит активный объект по id тела. */
  private findActiveBody(bodyId: number): ActiveBody | undefined {
    for (const ab of this.active) {
      if (ab.bodyId === bodyId) return ab;
    }
    return undefined;
  }

  /**
   * Рисует неоновый 3D-wireframe на Graphics: проецирует mesh3D с учётом вращения
   * (bodyAngle вокруг Y + timeMs вокруг X для 3D-depth), отбрасывает Z и штрихует
   * рёбра в cyberpunk-стиле (cyan для обычных, magenta для бомбы).
   *
   * Glow-эффект: каждое ребро рисуется в 3 прохода (halo → middle → core).
   * Depth-cueing: ближние рёбра (depth → maxZ) ярче в core-проходе (depth-cue).
   *
   * Вызывается каждый кадр в update() (после clear) — содержимое Graphics
   * обновляется под текущую проекцию. sprite.x/y уже выставлены, тут рисуем
   * в локальных координатах относительно центра спрайта.
   */
  private drawWireframe(
    g: Phaser.GameObjects.Graphics,
    mesh: Mesh3D,
    bodyAngle: number,
    timeMs: number,
    kind: NDTObjectKind,
  ): void {
    // Вращение: rotateY синхронно с Matter body.angle + rotateX по времени.
    const transform = compose(
      rotateX(timeMs * TIME_ROTATION_X),
      rotateY(bodyAngle),
    );
    const edges = projectOrthographic(mesh, transform);
    g.clear();

    const color = KIND_COLORS[kind] ?? CYBER.cyan;

    // Depth-cueing: нормируем depth текущего кадра в [0..1].
    let minD = Infinity;
    let maxD = -Infinity;
    for (const e of edges) {
      if (e.depth < minD) minD = e.depth;
      if (e.depth > maxD) maxD = e.depth;
    }
    const span = maxD - minD || 1;

    // 1. Halo: широкое полупрозрачное свечение (внешний glow).
    g.lineStyle(7, color, 0.12);
    g.beginPath();
    for (const e of edges) {
      g.moveTo(e.ax, e.ay);
      g.lineTo(e.bx, e.by);
    }
    g.strokePath();

    // 2. Middle: средний слой, основная яркость неона.
    g.lineStyle(3.5, color, 0.55);
    g.beginPath();
    for (const e of edges) {
      g.moveTo(e.ax, e.ay);
      g.lineTo(e.bx, e.by);
    }
    g.strokePath();

    // 3. Core: тонкая ярко-белая сердцевина с depth-cueing (per-edge alpha).
    // Ближние рёбра (depth → maxZ, t → 1) — ярче; дальние (t → 0) — тусклее.
    for (const e of edges) {
      const t = (e.depth - minD) / span;
      const alpha = 0.45 + 0.5 * t;
      g.lineStyle(1.5, 0xffffff, alpha);
      g.beginPath();
      g.moveTo(e.ax, e.ay);
      g.lineTo(e.bx, e.by);
      g.strokePath();
    }
  }
}
