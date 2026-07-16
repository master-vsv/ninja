import { describe, it, expect } from 'vitest';
import { decomposeIfConcave, isConvexPolygon } from '../slice/Decomposer';
import type { Polygon, Vec2 } from '../slice/Geometry';

/**
 * Тесты обёртки над poly-decomp (фаза 3).
 *
 * Decomposer переводит полигон в массив выпуклых:
 *   - Выпуклый полигон → возвращается как есть (1 элемент).
 *   - Вогнутый полигон → разбивается на 2+ выпуклых.
 *
 * Контракт: Matter.Bodies.fromVertices работает ТОЛЬКО с выпуклыми телами
 * (либо с decomp для вогнутых). В BodySplitter мы прогоняем результат PolyKSlicer
 * через Decomposer — на случай если разрез дал вогнутый фрагмент.
 */

// Выпуклый квадрат 10×10.
const CONVEX_SQUARE: Polygon = [
  { x: -5, y: -5 },
  { x: 5, y: -5 },
  { x: 5, y: 5 },
  { x: -5, y: 5 },
];

// Выпуклый треугольник.
const CONVEX_TRIANGLE: Polygon = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 5, y: 10 },
];

// Вогнутый L-образный полигон (8 вершин): угол внутри на (0, 0).
// Вершины идут CCW: начинается с левого нижнего угла внешнего контура.
const CONCAVE_L: Polygon = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 5, y: 10 },
  { x: 5, y: 5 },
  { x: 0, y: 5 },
];

// Вогнутый "стрелка" (arrow) — 2 вогнутые вершины.
const CONCAVE_ARROW: Polygon = [
  { x: 0, y: 0 },
  { x: 10, y: 5 },
  { x: 0, y: 10 },
  { x: 3, y: 5 },
];

describe('Decomposer / isConvexPolygon', () => {
  it('квадрат — выпуклый', () => {
    expect(isConvexPolygon(CONVEX_SQUARE)).toBe(true);
  });

  it('треугольник — выпуклый', () => {
    expect(isConvexPolygon(CONVEX_TRIANGLE)).toBe(true);
  });

  it('L-образный полигон — вогнутый', () => {
    expect(isConvexPolygon(CONCAVE_L)).toBe(false);
  });

  it('стрелка — вогнутый', () => {
    expect(isConvexPolygon(CONCAVE_ARROW)).toBe(false);
  });

  it('полигон <3 вершин — не выпуклый', () => {
    expect(isConvexPolygon([])).toBe(false);
    expect(isConvexPolygon([{ x: 0, y: 0 }])).toBe(false);
    expect(isConvexPolygon([{ x: 0, y: 0 }, { x: 1, y: 0 }])).toBe(false);
  });
});

describe('Decomposer / decomposeIfConcave', () => {
  it('выпуклый квадрат → возвращается как есть (1 полигон)', () => {
    const result = decomposeIfConcave(CONVEX_SQUARE);
    expect(result.length).toBe(1);
    expect(result[0].length).toBeGreaterThanOrEqual(3);
  });

  it('выпуклый треугольник → возвращается как есть', () => {
    const result = decomposeIfConcave(CONVEX_TRIANGLE);
    expect(result.length).toBe(1);
    expect(result[0].length).toBe(3);
  });

  it('вогнутый L-образный → 2+ выпуклых фрагмента', () => {
    const result = decomposeIfConcave(CONCAVE_L);
    expect(result.length).toBeGreaterThanOrEqual(2);
    for (const poly of result) {
      expect(poly.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('все результирующие фрагменты — выпуклые', () => {
    const result = decomposeIfConcave(CONCAVE_L);
    for (const poly of result) {
      expect(isConvexPolygon(poly)).toBe(true);
    }
  });

  it('вогнутая стрелка → 2+ выпуклых фрагмента, все выпуклые', () => {
    const result = decomposeIfConcave(CONCAVE_ARROW);
    expect(result.length).toBeGreaterThanOrEqual(2);
    for (const poly of result) {
      expect(isConvexPolygon(poly)).toBe(true);
    }
  });

  it('вырожденный полигон (<3 вершин) → пустой массив', () => {
    expect(decomposeIfConcave([])).toEqual([]);
    expect(decomposeIfConcave([{ x: 0, y: 0 }])).toEqual([]);
    expect(decomposeIfConcave([{ x: 0, y: 0 }, { x: 1, y: 0 }])).toEqual([]);
  });

  it('фрагменты не содержат NaN-координаты', () => {
    const result = decomposeIfConcave(CONCAVE_L);
    for (const poly of result) {
      for (const v of poly) {
        expect(Number.isFinite(v.x)).toBe(true);
        expect(Number.isFinite(v.y)).toBe(true);
      }
    }
  });

  it('сумма площадей фрагментов ≈ площадь исходного', () => {
    const original = CONCAVE_L;
    const result = decomposeIfConcave(original);
    const totalFragmentArea = result.map(polygonArea).reduce((a, b) => a + b, 0);
    expect(totalFragmentArea).toBeCloseTo(polygonArea(original), -1);
  });

  it('идемпотентен: повторная декомпозиция выпуклого фрагмента → 1 полигон', () => {
    const result = decomposeIfConcave(CONCAVE_L);
    for (const poly of result) {
      const subResult = decomposeIfConcave(poly);
      expect(subResult.length).toBe(1);
    }
  });
});

function polygonArea(poly: ReadonlyArray<Vec2>): number {
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    area += a.x * b.y - b.x * a.y;
  }
  return Math.abs(area) / 2;
}
