import decomp from 'poly-decomp';
import type { Polygon, Vec2 } from './Geometry';

/**
 * Decomposer (фаза 3) — обёртка над poly-decomp.
 *
 * Назначение: разложить полигон на выпуклые части. Matter.Bodies.fromVertices
 * работает только с выпуклыми телами (или требует poly-decomp для вогнутых).
 * В BodySplitter мы прогоняем результат PolyKSlicer через Decomposer — на случай,
 * если разрез дал вогнутый фрагмент.
 *
 * poly-decomp работает с форматом [[x, y], ...], мы принимаем/возвращаем {x, y}.
 *
 * Регистрация для Matter.js: window.decomp = decomp в main.ts ИЛИ
 * Phaser.Physics.Matter.Matter.Common.setDecomp(decomp).
 *
 * Pure-logic: не импортирует Phaser.
 */

/** Минимальное число вершин в валидном полигоне. */
const MIN_VERTICES = 3;

/**
 * Разлагает полигон на массив выпуклых.
 *   - Выпуклый → возвращается как есть (массив из 1 элемента).
 *   - Вогнутый → разбивается через poly-decomp.quickDecomp.
 *   - Вырожденный (<3 вершин) → пустой массив.
 *
 * Возвращаемые фрагменты гарантированно выпуклые (если decomposer отработал корректно).
 * Если decomposer по какой-то причине не смог разбить — возвращается исходный полигон;
 * Matter при создании тела возьмёт выпуклую оболочку как fallback.
 */
export function decomposeIfConcave(polygon: Polygon): Polygon[] {
  if (polygon.length < MIN_VERTICES) return [];
  if (isConvexPolygon(polygon)) return [polygon];

  const input = toArray(polygon);
  // quickDecomp быстрее, чем decomp; Matter.js использует именно quickDecomp.
  // poly-decomp мутирует входной массив точек (makeCCW, removeDuplicatePoints),
  // поэтому конвертируем в свежий массив.
  const result = decomp.quickDecomp(input.map((p) => [p[0], p[1]] as [number, number]));

  if (!result || result.length === 0) {
    // Fallback: вернуть исходный полигон — Matter возьмёт выпуклую оболочку.
    return [polygon];
  }

  const polygons = result
    .map((arr) => fromArray(arr))
    .filter((p) => p.length >= MIN_VERTICES);

  if (polygons.length === 0) {
    return [polygon];
  }
  return polygons;
}

/**
 * Проверяет, является ли полигон выпуклым.
 * Алгоритм: для каждой тройки последовательных вершин считаем знак cross product.
 * Если все знаки одинаковы (с учётом CCW/CW) — полигон выпуклый.
 */
export function isConvexPolygon(polygon: Polygon): boolean {
  const n = polygon.length;
  if (n < MIN_VERTICES) return false;

  let sign = 0;
  for (let i = 0; i < n; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % n];
    const c = polygon[(i + 2) % n];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-9) continue; // коллинеарные
    const crossSign = cross > 0 ? 1 : -1;
    if (sign === 0) {
      sign = crossSign;
    } else if (sign !== crossSign) {
      return false;
    }
  }
  return true;
}

/** Конвертация Polygon → формат poly-decomp [[x, y], ...]. */
function toArray(poly: Polygon): Array<[number, number]> {
  return poly.map((v) => [v.x, v.y]);
}

/** Конвертация формата poly-decomp → Polygon (массив {x, y}). */
function fromArray(arr: Array<[number, number]>): Vec2[] {
  return arr.map((p) => ({ x: p[0], y: p[1] }));
}
