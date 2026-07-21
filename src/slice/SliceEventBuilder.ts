import type { SliceEvent } from '../events/SliceEvent';
import type { NDTObjectKind, SwordType } from '../events/types';
import { sliceNormal, computeCentroid, sideOfLine, type Vec2 } from './Geometry';

/**
 * SliceEventBuilder (фаза 3) — сборка SliceEvent из данных разреза.
 *
 * Назначение: из «сырых» данных (id тела, тип, линия реза, вершины фрагментов)
 * собрать иммутабельный SliceEvent с вычисленными полями:
 *   - slice.angle = atan2(dy, dx) — угол линии реза;
 *   - fragments[*].velocity — вектор разлёта вдоль нормали реза (импульс).
 *
 * Импульс разлёта: каждый фрагмент получает скорость = sliceNormal * speed,
 * знак зависит от того, с какой стороны линии реза лежит центроид фрагмента
 * (положительная полулиния идёт в сторону поворота нормали по часовой стрелке).
 *
 * Pure-logic: НЕ импортирует Phaser. SliceEvent по контракту использует Phaser.Math.Vector2,
 * но Phaser.Math.Vector2 имеет только поля x, y — и структурно совместим с Vec2.
 * Возвращаемый объект использует plain {x, y} — консамеры в фазе 3 (stubs + FXSystem)
 * только читают .x/.y, методы Vector2 не вызывают.
 *
 * Внимание: контракт SliceEvent требует Phaser.Math.Vector2 (с методами). Возвращаемый
 * BuiltSliceEvent структурно совместим на уровне полей. SliceSystem при эмите может
 * обернуть значения в new Phaser.Math.Vector2() при необходимости.
 */

/** Данные одного фрагмента в строгой форме. */
export interface FragmentData {
  readonly vertices: ReadonlyArray<Vec2>;
  readonly velocity: Vec2;
}

/**
 * Входные данные для сборки SliceEvent.
 * fragmentVertices — только вершины, velocity вычисляется внутри (по нормали).
 */
export interface BuildSliceEventInput {
  readonly bodyId: number;
  readonly kind: NDTObjectKind;
  readonly isBomb: boolean;
  readonly slice: { readonly from: Vec2; readonly to: Vec2 };
  /** Вершины фрагментов (velocity вычисляется автоматически по нормали реза). */
  readonly fragmentVertices: ReadonlyArray<ReadonlyArray<Vec2>>;
  /** Активный меч. null в MVP. */
  readonly swordType?: SwordType | null;
  /**
   * Модуль скорости разлёта фрагментов, px/frame (Matter position-Verlet).
   * По умолчанию подобран под «ощущение» аркады.
   */
  readonly fragmentSpeed?: number;
  /** Уникальный id. Если не передан — генерируется. */
  readonly id?: string;
  /** Timestamp (performance.now). Если не передан — берётся текущий. */
  readonly timestamp?: number;
}

/**
 * Скорость разлёта осколков по умолчанию, px/frame.
 * Подобрана эмпирически: видимый «взрыв» в две стороны без улёта за экран.
 */
const DEFAULT_FRAGMENT_SPEED = 3.5;

/**
 * Собирает иммутабельный SliceEvent.
 *
 * Импульс каждого фрагмента:
 *   1. Вычисляется нормаль к линии реза sliceNormal(from, to) — единичный вектор,
 *      повёрнутый на +90° от направления реза.
 *   2. Для каждого фрагмента определяется сторона относительно линии реза
 *      (через sign cross product нормали и вектора from→centroid).
 *   3. velocity = normal * speed * sideSign (фрагменты летят в разные стороны).
 */
export function buildSliceEvent(input: BuildSliceEventInput): SliceEvent {
  const { from, to } = input.slice;
  const normal = sliceNormal(from, to);
  const speed = input.fragmentSpeed ?? DEFAULT_FRAGMENT_SPEED;

  const fragments: FragmentData[] = input.fragmentVertices.map((vertices) => {
    const centroid = computeCentroid(vertices);
    const side = sideOfLine(from, to, centroid);
    // side > 0 — с «положительной» стороны, скорость +normal.
    // side < 0 — с «отрицательной», скорость −normal.
    // side === 0 — центроид на линии (редкий edge-case), берём +normal.
    const dir = side >= 0 ? 1 : -1;
    return {
      vertices,
      velocity: { x: normal.x * speed * dir, y: normal.y * speed * dir },
    };
  });

  const angle = computeAngle(from, to);
  const id = input.id ?? generateSliceId();
  const timestamp = input.timestamp ?? performance.now();

  // SliceEvent по контракту требует Phaser.Math.Vector2 (с методами), но мы работаем
  // в pure-logic окружении (без Phaser). Возвращаем объект с plain {x, y}: на уровне
  // полей он структурно совместим. SliceSystem при эмите может обернуть значения в
  // new Phaser.Math.Vector2() — но в фазе 3 все консамеры только читают .x/.y.
  return {
    id,
    timestamp,
    bodyId: input.bodyId,
    kind: input.kind,
    isBomb: input.isBomb,
    slice: { from, to, angle },
    swordType: input.swordType ?? null,
    fragments,
  } as unknown as SliceEvent;
}

// ---------------------------------------------------------------------------
// Внутренние
// ---------------------------------------------------------------------------

/** Угол направленного отрезка from→to, радианы. atan2(dy, dx). */
function computeAngle(from: Vec2, to: Vec2): number {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

/**
 * Генератор id события без зависимости от crypto.
 * Формат: slice-<base36 timestamp>-<base36 random>.
 * Достаточно уникален для одного игрового сеанса.
 */
function generateSliceId(): string {
  return `slice-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
