import Phaser from 'phaser';
import type { EventBus } from '../events/EventBus';
import { eventBus as defaultEventBus } from '../events/EventBus';
import { EVENT, type NDTObjectKind, type SwordType } from '../events/types';
import type { SliceEvent } from '../events/SliceEvent';
import { segmentIntersectsPolygon, type Polygon } from '../slice/Geometry';
import { buildSliceEvent } from '../slice/SliceEventBuilder';
import { isPowerUpKind, kindToPowerUpType } from '../game/PowerUpType';
import type { TrailBuffer } from '../input/TrailBuffer';
import type { SpawnDirector } from './SpawnDirector';
import {
  BodySplitter,
  type FragmentData,
  FRAGMENT_BODY_LABEL,
} from './BodySplitter';

/**
 * Tolerance для slice-detection (fat-segment, px). Объекты в полёте двигаются —
 * между pointer-move и SliceSystem.update тело успевает сдвинуться, и точный
 * segment может не пересечь текущие vertices. Tolerance «расширяет» segment,
 * делая разрез более прощающим (мобильный touch, низкий FPS, быстрые объекты).
 * Сам разрез (PolyK) всё равно точный — tolerance только в detection.
 */
const SLICE_TOLERANCE = 14;

/**
 * SliceSystem (фаза 3 + расширение фазы 5) — детектор пересечения линии свайпа
 * с NDT-объектами.
 *
 * Назначение:
 *   - в update() берёт последний сегмент свайпа из InputSystem.trail.getLastSegment();
 *   - для каждого активного NDT-объекта (через SpawnDirector.getActiveBodies())
 *     проверяет быстрое пересечение segment ∩ полигон (с AABB-reject);
 *   - при попадании: вызывает BodySplitter.sliceBody, получает фрагменты;
 *   - собирает SliceEvent через SliceEventBuilder и эмитит в EventBus.
 *
 * Фаза 5 (расширение, БЕЗ ослабления контракта SliceEvent):
 *   - deps.getMaxTargets(): ограничение числа целей за один свайп. Если не
 *     передан — без лимита (обратная совместимость со старыми тестами). Меч
 *     forged → 1, plasma → 3.
 *   - deps.getSwordType(): активный меч для подстановки в SliceEvent.swordType
 *     (был null в фазе 3, теперь тип). Если не передан — null (MVP-режим).
 *
 * NOT pure-logic: зависит от Phaser, Matter, SpawnDirector, BodySplitter.
 *
 * Фильтрация тел: SliceSystem работает только с NDT-объектами из SpawnDirector
 * (label 'ndt-${kind}'). Фрагменты (label 'ndt-fragment') не режутся повторно —
 * они не попадают в getActiveBodies().
 *
 * Идемпотентность: если тело уже разрезано в этом кадре, оно не обрабатывается
 * повторно (защита через Set<bodyId> на время одного update()).
 */
export class SliceSystem {
  private readonly eventBus: EventBus;
  private readonly bodySplitter: BodySplitter;
  private readonly spawner: SpawnDirector;
  private readonly trail: TrailBuffer;
  /** Опциональный провайдер лимита целей за свайп (для plasma). */
  private readonly getMaxTargets?: () => number;
  /** Опциональный провайдер активного меча (для SliceEvent.swordType). */
  private readonly getSwordType?: () => SwordType | null;
  /** Тела, разрезанные в текущем кадре — защита от повторной обработки. */
  private readonly slicedThisFrame = new Set<number>();
  /** Отписка от 'slice' — не нужен (SliceSystem только эмитит). */
  destroyed = false;

  constructor(
    protected readonly scene: Phaser.Scene,
    deps: {
      readonly trail: TrailBuffer;
      readonly spawner: SpawnDirector;
      readonly bodySplitter: BodySplitter;
      readonly eventBus?: EventBus;
      /**
       * Возвращает максимальное число целей за один свайп. Если не задан —
       * без лимита (обратная совместимость). Для мечей: forged=1, plasma=3.
       * Возвращается ОДИН раз в начале update() и применяется ко всему кадру.
       */
      readonly getMaxTargets?: () => number;
      /**
       * Возвращает активный меч для подстановки в SliceEvent.swordType.
       * Если не задан — в событии остаётся null (MVP-режим фазы 3-4).
       */
      readonly getSwordType?: () => SwordType | null;
    },
  ) {
    this.trail = deps.trail;
    this.spawner = deps.spawner;
    this.bodySplitter = deps.bodySplitter;
    this.eventBus = deps.eventBus ?? defaultEventBus;
    this.getMaxTargets = deps.getMaxTargets;
    this.getSwordType = deps.getSwordType;
  }

  /**
   * Per-frame: проверяет пересечение ВСЕХ сегментов свайпа со всеми
   * активными NDT-объектами. При разрезе эмитит SliceEvent.
   *
   * ВАЖНО: проверяются все сегменты trail (не только последний). При быстром
   * свайпе или низком FPS за кадр в trail накапливается несколько сегментов —
   * если проверять только getLastSegment(), промежуточные сегменты (которые
   * реально пересекают тело) пропускаются → «меч не режет».
   *
   * Лимит целей (фаза 5): если задан getMaxTargets(), прекращает разрезы
   * после достижения maxSuccessfulSlices. slicedThisFrame защищает от двойного
   * разреза одного тела за кадр (даже если его пересекают несколько сегментов).
   */
  update(): void {
    if (this.destroyed) return;

    const segments = this.trail.getSegments();
    if (segments.length === 0) return;

    this.slicedThisFrame.clear();
    const maxTargets = this.resolveMaxTargets();
    const swordType = this.resolveSwordType();
    const activeBodies = this.spawner.getActiveBodies();

    for (const segment of segments) {
      if (this.slicedThisFrame.size >= maxTargets) break;

      // Нулевая длина сегмента (pointer не сдвинулся) — пропускаем.
      const dx = segment.to.x - segment.from.x;
      const dy = segment.to.y - segment.from.y;
      if (dx * dx + dy * dy < 1) continue;

      const sliceLine = {
        from: { x: segment.from.x, y: segment.from.y },
        to: { x: segment.to.x, y: segment.to.y },
      };

      for (const ab of activeBodies) {
        if (this.slicedThisFrame.size >= maxTargets) break;
        if (this.slicedThisFrame.has(ab.bodyId)) continue;

        // Пропускаем фрагменты и посторонние лейблы.
        const body = ab.body;
        if (!body.vertices || body.label === FRAGMENT_BODY_LABEL) continue;

        // Быстрая AABB + точная проверка пересечения (с tolerance — fat-segment).
        const polygon: Polygon = body.vertices.map((v) => ({ x: v.x, y: v.y }));
        if (!segmentIntersectsPolygon(sliceLine, polygon, SLICE_TOLERANCE)) continue;

        // Если точный segment не пересекает polygon (тело в tolerance, но сдвинуто
        // относительно свайпа — бывает при быстром полёте/низком FPS) — перестроить
        // segment через центр тела в направлении свайпа. PolyK тогда точно разрежет.
        let effectiveLine = sliceLine;
        if (!segmentIntersectsPolygon(sliceLine, polygon, 0)) {
          const cx = body.position.x;
          const cy = body.position.y;
          const dx = sliceLine.to.x - sliceLine.from.x;
          const dy = sliceLine.to.y - sliceLine.from.y;
          const len = Math.hypot(dx, dy) || 1;
          const ux = dx / len;
          const uy = dy / len;
          effectiveLine = {
            from: { x: cx - ux * 100, y: cy - uy * 100 },
            to: { x: cx + ux * 100, y: cy + uy * 100 },
          };
        }

        // Разрез через BodySplitter. Если null — разрез не удался.
        const fragments = this.bodySplitter.sliceBody(body, effectiveLine);
        if (!fragments || fragments.length === 0) continue;

        this.spawner.removeSlicedBody(ab.bodyId);
        this.slicedThisFrame.add(ab.bodyId);

        const ev = this.buildEvent(
          ab.kind,
          ab.isBomb,
          ab.bodyId,
          effectiveLine,
          fragments,
          swordType,
        );
        this.eventBus.emit(EVENT.slice, ev);
        // Power-up: вслед за 'slice' эмитим 'power-up' с типом эффекта.
        // GameScene консамит: активирует PowerUpState + камера-flash + звук.
        // isPowerUpKind стабильно возвращает true только для shrink/grow/slow.
        if (isPowerUpKind(ab.kind)) {
          const powerUpType = kindToPowerUpType(ab.kind);
          if (powerUpType) {
            this.eventBus.emit(EVENT.powerUp, { type: powerUpType });
          }
        }
      }
    }
  }

  /** Безопасное уничтожение системы. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.slicedThisFrame.clear();
  }

  // --- Внутренние ---

  /** Разрешает лимит целей. Если провайдер не задан — без лимита (Infinity). */
  private resolveMaxTargets(): number {
    if (!this.getMaxTargets) return Infinity;
    const v = this.getMaxTargets();
    return v > 0 ? Math.floor(v) : Infinity;
  }

  /** Разрешает активный меч. Если провайдер не задан — null (MVP-режим). */
  private resolveSwordType(): SwordType | null {
    return this.getSwordType ? this.getSwordType() : null;
  }

  /** Собирает SliceEvent из данных разреза. */
  private buildEvent(
    kind: NDTObjectKind,
    isBomb: boolean,
    bodyId: number,
    sliceLine: { from: { x: number; y: number }; to: { x: number; y: number } },
    fragments: ReadonlyArray<FragmentData>,
    swordType: SwordType | null,
  ): SliceEvent {
    return buildSliceEvent({
      bodyId,
      kind,
      isBomb,
      slice: sliceLine,
      fragmentVertices: fragments.map((f) => f.vertices),
      // fragmentSpeed внутри SliceEventBuilder определяет модуль velocity в
      // самом событии — BodySplitter использует свой fragmentSpeed для импульса.
      // В фазе 3 это расхождение допустимо: важно направление, не модуль.
      fragmentSpeed: 3.5,
      // Фаза 5: тип активного меча заполняет SliceEvent.swordType (раньше null).
      swordType,
    });
  }
}
