/**
 * Базовые геометрические примитивы слайсинга (фаза 3).
 *
 * Pure-logic модуль: НЕ импортирует Phaser, тестируется unit-тестами без рендера.
 * Phaser.Math.Vector2 структурно совместим с интерфейсом Vec2 (имеет поля x, y),
 * поэтому функции принимают как plain-объекты, так и Vector2.
 *
 * Инварианты:
 *   - Все функции иммутабельны (не мутируют аргументы).
 *   - Полигон — массив вершин {x, y}; порядок CCW или CW не важен для пересечений.
 *   - Полигон считается простым (без самопересечений); slice-функция (PolyK) сама
 *     валидирует простоту, тут мы её не проверяем (это дешёвая арифметика).
 */

/** 2D-вектор / точка. Phaser.Math.Vector2 удовлетворяет структурно. */
export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

/** Отрезок линии (например, сегмент свайпа). */
export interface Segment {
  readonly from: Vec2;
  readonly to: Vec2;
}

/** Полигон как массив вершин. */
export type Polygon = ReadonlyArray<Vec2>;

/** AABB-прямоугольник (axis-aligned bounding box). */
export interface AABB {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/** Малый epsilon для сравнения чисел с плавающей точкой. */
const EPS = 1e-9;

/**
 * Вычисляет AABB полигона.
 * Empty-полигон → вырожденный AABB (Infinity / -Infinity).
 */
export function computeAABB(polygon: Polygon): AABB {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const v of polygon) {
    if (v.x < minX) minX = v.x;
    if (v.y < minY) minY = v.y;
    if (v.x > maxX) maxX = v.x;
    if (v.y > maxY) maxY = v.y;
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Быстрая проверка пересечения отрезка с AABB (Liang-Barsky / Cohen-Sutherland).
 * Используется как reject-этап перед точной проверкой с полигоном.
 */
export function segmentIntersectsAABB(seg: Segment, aabb: AABB): boolean {
  const { from, to } = seg;
  // Если оба конца внутри AABB — пересечение есть.
  const fromInside =
    from.x >= aabb.minX && from.x <= aabb.maxX && from.y >= aabb.minY && from.y <= aabb.maxY;
  const toInside =
    to.x >= aabb.minX && to.x <= aabb.maxX && to.y >= aabb.minY && to.y <= aabb.maxY;
  if (fromInside || toInside) return true;

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  let t0 = 0;
  let t1 = 1;
  const p = [-dx, dx, -dy, dy];
  const q = [from.x - aabb.minX, aabb.maxX - from.x, from.y - aabb.minY, aabb.maxY - from.y];

  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      // Отрезок параллелен этой паре сторон: если вне — нет пересечения.
      if (q[i] < 0) return false;
    } else {
      const r = q[i] / p[i];
      if (p[i] < 0) {
        if (r > t1) return false;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return false;
        if (r < t1) t1 = r;
      }
    }
  }
  return t0 <= t1;
}

/**
 * Проверяет, находится ли точка внутри полигона (ray-cast / even-odd rule).
 * Граничная точка (на ребре) считается внутри.
 */
export function pointInPolygon(point: Vec2, polygon: Polygon): boolean {
  const n = polygon.length;
  if (n < 3) return false;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersect =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi + EPS) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Пересекает ли отрезок полигон.
 *
 * Алгоритм:
 *   1. Быстрый AABB-reject (расширенный на tolerance).
 *   2. Если хотя бы один конец внутри полигона — пересечение есть.
 *   3. Точная проверка: пересечение отрезка с любым ребром полигона.
 *   4. Tolerance: если вершина полигона в пределах tolerance отрезка — есть.
 *
 * @param tolerance Допуск (px) для «толстого» отрезка — помогает при быстром
 *   свайпе/низком FPS, когда тело успевает сдвинуться между pointer-move и
 *   update. 0 = точная проверка (backward compat).
 * @returns true если отрезок проходит через полигон или касается его (с tolerance).
 */
export function segmentIntersectsPolygon(
  seg: Segment,
  polygon: Polygon,
  tolerance = 0,
): boolean {
  if (polygon.length < 3) return false;

  // 1. AABB-reject (расширяем на tolerance).
  const aabb = computeAABB(polygon);
  if (
    !segmentIntersectsAABB(seg, {
      minX: aabb.minX - tolerance,
      minY: aabb.minY - tolerance,
      maxX: aabb.maxX + tolerance,
      maxY: aabb.maxY + tolerance,
    })
  ) {
    return false;
  }

  // 2. Конец внутри полигона.
  if (pointInPolygon(seg.from, polygon) || pointInPolygon(seg.to, polygon)) {
    return true;
  }

  // 3. Точная проверка по рёбрам.
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % n];
    if (segmentsIntersect(seg.from, seg.to, a, b)) {
      return true;
    }
  }

  // 4. Tolerance: вершина полигона в пределах tolerance от segment (fat-segment).
  if (tolerance > 0) {
    for (let i = 0; i < n; i++) {
      if (distancePointToSegment(polygon[i], seg) <= tolerance) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Кратчайшее расстояние от точки до отрезка (вкл. концы).
 * Используется для tolerance-проверки пересечения (fat-segment).
 */
export function distancePointToSegment(p: Vec2, seg: Segment): number {
  const dx = seg.to.x - seg.from.x;
  const dy = seg.to.y - seg.from.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < EPS) {
    return Math.hypot(p.x - seg.from.x, p.y - seg.from.y);
  }
  let t = ((p.x - seg.from.x) * dx + (p.y - seg.from.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = seg.from.x + t * dx;
  const cy = seg.from.y + t * dy;
  return Math.hypot(p.x - cx, p.y - cy);
}

/**
 * Возвращает точки пересечения ОТРЕЗКА с полигоном (вход/выход из полигона).
 * 0 точек — нет пересечения; 2 точки — нормальный разрез; 1 точка — касательный случай.
 * Точки отсортированы вдоль отрезка от from к to.
 *
 * Важно: проверяется именно ОТРЕЗК-отрезок, не бесконечная линия. Отрезок полностью
 * внутри полигона не пересекает рёбер → 0 точек.
 */
export function segmentIntersectionPoints(seg: Segment, polygon: Polygon): Vec2[] {
  if (polygon.length < 3) return [];
  const points: Array<{ point: Vec2; t: number }> = [];
  const dx = seg.to.x - seg.from.x;
  const dy = seg.to.y - seg.from.y;
  const segLen2 = dx * dx + dy * dy;

  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % n];
    const ip = segmentSegmentPoint(seg.from, seg.to, a, b);
    if (ip) {
      const t = segLen2 > 0 ? ((ip.x - seg.from.x) * dx + (ip.y - seg.from.y) * dy) / segLen2 : 0;
      points.push({ point: ip, t });
    }
  }

  // Сортировка вдоль отрезка + удаление дубликатов (касание вершины даёт 2 точки).
  points.sort((p, q) => p.t - q.t);
  const unique: Vec2[] = [];
  for (const item of points) {
    const last = unique[unique.length - 1];
    if (
      !last ||
      Math.abs(last.x - item.point.x) > EPS ||
      Math.abs(last.y - item.point.y) > EPS
    ) {
      unique.push(item.point);
    }
  }
  return unique;
}

/**
 * Единичная нормаль к линии реза. Используется для импульса разлёта осколков.
 *
 * Конвенция: нормаль — поворот направления реза на +90° ( против часовой ),
 * нормализованная. То есть для направления (dx, dy) нормаль = (−dy, dx) / |d|.
 *
 * @returns {x, y} единичный вектор или (0,0) для вырожденной линии (from === to).
 */
export function sliceNormal(from: Vec2, to: Vec2): Vec2 {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len < EPS) return { x: 0, y: 0 };
  return { x: -dy / len, y: dx / len };
}

/**
 * Центроид массива точек (среднее арифметическое).
 * Используется для расчёта позиции нового тела-фрагмента и для определения
 * стороны от линии реза (импульс разлёта).
 *
 * Empty-массив → (0, 0).
 */
export function computeCentroid(points: ReadonlyArray<Vec2>): Vec2 {
  if (points.length === 0) return { x: 0, y: 0 };
  let sx = 0;
  let sy = 0;
  for (const p of points) {
    sx += p.x;
    sy += p.y;
  }
  return { x: sx / points.length, y: sy / points.length };
}

/**
 * Сторона точки относительно НАПРАВЛЕННОЙ линии from→to.
 * > 0 — слева от направления; < 0 — справа; 0 — на линии.
 * Сторона определяется через sign cross product (to-from) × (point-from).
 *
 * Используется для определения направления импульса разлёта фрагмента:
 * фрагменты с разных сторон линии реза получают противоложные скорости.
 */
export function sideOfLine(from: Vec2, to: Vec2, point: Vec2): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const cross = dx * (point.y - from.y) - dy * (point.x - from.x);
  if (cross > EPS) return 1;
  if (cross < -EPS) return -1;
  return 0;
}

// ---------------------------------------------------------------------------
// Внутренние low-level примитивы
// ---------------------------------------------------------------------------

/**
 * Пересечение двух отрезков A-B и C-D (включая коллинеарные/касательные случаи).
 * Возвращает true, если отрезки имеют хотя бы одну общую точку.
 */
function segmentsIntersect(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const d1 = crossProduct(c, d, a);
  const d2 = crossProduct(c, d, b);
  const d3 = crossProduct(a, b, c);
  const d4 = crossProduct(a, b, d);

  if (((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS)) &&
      ((d3 > EPS && d4 < -EPS) || (d3 < -EPS && d4 > EPS))) {
    return true;
  }
  // Коллинеарные / касательные случаи: точка на отрезке.
  if (Math.abs(d1) <= EPS && onSegment(c, d, a)) return true;
  if (Math.abs(d2) <= EPS && onSegment(c, d, b)) return true;
  if (Math.abs(d3) <= EPS && onSegment(a, b, c)) return true;
  if (Math.abs(d4) <= EPS && onSegment(a, b, d)) return true;
  return false;
}

/** Точка пересечения двух отрезков A-B и C-D, если она лежит на обоих. */
function segmentSegmentPoint(a: Vec2, b: Vec2, c: Vec2, d: Vec2): Vec2 | null {
  const r = { x: b.x - a.x, y: b.y - a.y };
  const s = { x: d.x - c.x, y: d.y - c.y };
  const rxs = r.x * s.y - r.y * s.x;
  if (Math.abs(rxs) <= EPS) return null; // параллельны или коллинеарны

  const qmp = { x: c.x - a.x, y: c.y - a.y };
  const t = (qmp.x * s.y - qmp.y * s.x) / rxs;
  const u = (qmp.x * r.y - qmp.y * r.x) / rxs;
  // Оба параметра должны быть в [0,1] для пересечения отрезков.
  if (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS) return null;
  return { x: a.x + r.x * t, y: a.y + r.y * t };
}

/** Z-компонента векторного произведения (AB × AC). */
function crossProduct(a: Vec2, b: Vec2, c: Vec2): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

/** Лежит ли точка c на отрезке a-b (при условии коллинеарности). */
function onSegment(a: Vec2, b: Vec2, c: Vec2): boolean {
  return (
    c.x >= Math.min(a.x, b.x) - EPS &&
    c.x <= Math.max(a.x, b.x) + EPS &&
    c.y >= Math.min(a.y, b.y) - EPS &&
    c.y <= Math.max(a.y, b.y) + EPS
  );
}
