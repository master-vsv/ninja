import { describe, it, expect } from 'vitest';
import {
  segmentIntersectsPolygon,
  segmentIntersectionPoints,
  sliceNormal,
  computeAABB,
  segmentIntersectsAABB,
  type Vec2,
  type Segment,
} from '../slice/Geometry';

/**
 * Тесты чистой геометрии слайсинга (фаза 3).
 *
 * Geometry.ts — pure-logic без Phaser. Базовые примитивы для детекции и разреза:
 *   - segmentIntersectsPolygon: быстрый AABB-reject + точная проверка пересечения
 *     отрезка с рёбрами полигона + проверка концов отрезка внутри полигона.
 *   - segmentIntersectionPoints: точные точки входа/выхода (для линии реза).
 *   - sliceNormal: единичная нормаль к линии реза (для импульса разлёта осколков).
 *
 * Все функции работают на интерфейсе { x, y } — Phaser.Math.Vector2 структурно
 * совместим (имеет x, y), но Phaser не требуется.
 */

// Квадрат 10×10 с центром в (0,0): вершины (−5,−5), (5,−5), (5,5), (−5,5).
const SQUARE: ReadonlyArray<Vec2> = [
  { x: -5, y: -5 },
  { x: 5, y: -5 },
  { x: 5, y: 5 },
  { x: -5, y: 5 },
];

// Прямоугольник 100×20: длинный горизонтальный полигон.
const RECT: ReadonlyArray<Vec2> = [
  { x: -50, y: -10 },
  { x: 50, y: -10 },
  { x: 50, y: 10 },
  { x: -50, y: 10 },
];

function seg(from: Vec2, to: Vec2): Segment {
  return { from, to };
}

// ---------------------------------------------------------------------------
// segmentIntersectsPolygon
// ---------------------------------------------------------------------------

describe('segmentIntersectsPolygon', () => {
  it('возвращает true для отрезка, пересекающего полигон (диагональ через центр)', () => {
    const s = seg({ x: -20, y: 0 }, { x: 20, y: 0 });
    expect(segmentIntersectsPolygon(s, SQUARE)).toBe(true);
  });

  it('возвращает true для вертикального реза', () => {
    const s = seg({ x: 0, y: -20 }, { x: 0, y: 20 });
    expect(segmentIntersectsPolygon(s, SQUARE)).toBe(true);
  });

  it('возвращает true для горизонтального реза', () => {
    const s = seg({ x: -20, y: 0 }, { x: 20, y: 0 });
    expect(segmentIntersectsPolygon(s, RECT)).toBe(true);
  });

  it('возвращает false для отрезка, не пересекающего полигон', () => {
    const s = seg({ x: -100, y: 0 }, { x: -50, y: 0 });
    expect(segmentIntersectsPolygon(s, SQUARE)).toBe(false);
  });

  it('возвращает false для отрезка далеко сбоку от полигона', () => {
    const s = seg({ x: 100, y: 100 }, { x: 200, y: 200 });
    expect(segmentIntersectsPolygon(s, SQUARE)).toBe(false);
  });

  it('возвращает true, если отрезок начинается внутри полигона', () => {
    const s = seg({ x: 0, y: 0 }, { x: 20, y: 0 });
    expect(segmentIntersectsPolygon(s, SQUARE)).toBe(true);
  });

  it('возвращает true, если отрезок заканчивается внутри полигона', () => {
    const s = seg({ x: -20, y: 0 }, { x: 0, y: 0 });
    expect(segmentIntersectsPolygon(s, SQUARE)).toBe(true);
  });

  it('возвращает true для отрезка полностью внутри полигона (оба конца внутри, рёбер не касается)', () => {
    // Контракт: пересечение = прохождение через ребро ИЛИ хотя бы один конец внутри.
    // Отрезок целиком внутри тоже считается «пересекает» (есть общие точки).
    const s = seg({ x: -1, y: -1 }, { x: 1, y: 1 });
    expect(segmentIntersectsPolygon(s, SQUARE)).toBe(true);
  });

  it('возвращает true для касания ребра (отрезок лежит на ребре)', () => {
    // Коллинеарный отрезок на верхней грани.
    const s = seg({ x: -3, y: -5 }, { x: 3, y: -5 });
    expect(segmentIntersectsPolygon(s, SQUARE)).toBe(true);
  });

  it('возвращает true для касания вершины полигона', () => {
    // Отрезок проходит через вершину (5,5).
    const s = seg({ x: 0, y: 10 }, { x: 10, y: 0 });
    expect(segmentIntersectsPolygon(s, SQUARE)).toBe(true);
  });

  it('AABB-reject: отрезок далеко за пределами bbox не проходит точную проверку', () => {
    const s = seg({ x: 1000, y: 1000 }, { x: 2000, y: 2000 });
    expect(segmentIntersectsPolygon(s, SQUARE)).toBe(false);
  });

  it('обрабатывает треугольник (3 вершины)', () => {
    const tri: ReadonlyArray<Vec2> = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 5, y: 10 },
    ];
    expect(segmentIntersectsPolygon(seg({ x: -5, y: 5 }, { x: 15, y: 5 }), tri)).toBe(true);
    expect(segmentIntersectsPolygon(seg({ x: -5, y: 20 }, { x: 15, y: 20 }), tri)).toBe(false);
  });

  it('вырожденный полигон (<3 точек) → false', () => {
    expect(segmentIntersectsPolygon(seg({ x: 0, y: 0 }, { x: 10, y: 0 }), [])).toBe(false);
    expect(
      segmentIntersectsPolygon(seg({ x: 0, y: 0 }, { x: 10, y: 0 }), [{ x: 0, y: 0 }]),
    ).toBe(false);
    expect(
      segmentIntersectsPolygon(seg({ x: 0, y: 0 }, { x: 10, y: 0 }), [
        { x: 0, y: 0 },
        { x: 5, y: 0 },
      ]),
    ).toBe(false);
  });

  it('вырожденный отрезок (from === to) вне полигона → false', () => {
    expect(segmentIntersectsPolygon(seg({ x: 100, y: 100 }, { x: 100, y: 100 }), SQUARE)).toBe(
      false,
    );
  });

  it('вырожденный отрезок (from === to) внутри полигона → true', () => {
    expect(segmentIntersectsPolygon(seg({ x: 0, y: 0 }, { x: 0, y: 0 }), SQUARE)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// segmentIntersectionPoints
// ---------------------------------------------------------------------------

describe('segmentIntersectionPoints', () => {
  it('возвращает 2 точки для отрезка, пересекающего полигон', () => {
    const points = segmentIntersectionPoints(seg({ x: -20, y: 0 }, { x: 20, y: 0 }), SQUARE);
    expect(points).toHaveLength(2);
    // Точки должны быть на левой и правой гранях: (−5,0) и (5,0).
    const xs = points.map((p) => p.x).sort((a, b) => a - b);
    expect(xs[0]).toBeCloseTo(-5, 5);
    expect(xs[1]).toBeCloseTo(5, 5);
    expect(points[0].y).toBeCloseTo(0, 5);
    expect(points[1].y).toBeCloseTo(0, 5);
  });

  it('возвращает точки в порядке вдоль отрезка (от from к to)', () => {
    const s = seg({ x: -20, y: 0 }, { x: 20, y: 0 });
    const points = segmentIntersectionPoints(s, SQUARE);
    expect(points).toHaveLength(2);
    // Первая точка ближе к from, вторая ближе к to.
    const d0 = distance(points[0], s.from);
    const d1 = distance(points[1], s.from);
    expect(d0).toBeLessThan(d1);
  });

  it('возвращает [] для отрезка, не пересекающего полигон', () => {
    const points = segmentIntersectionPoints(seg({ x: -100, y: 0 }, { x: -50, y: 0 }), SQUARE);
    expect(points).toEqual([]);
  });

  it('возвращает [] для отрезка полностью внутри полигона', () => {
    const points = segmentIntersectionPoints(seg({ x: -1, y: 0 }, { x: 1, y: 0 }), SQUARE);
    expect(points).toEqual([]);
  });

  it('точный вход/выход для диагонального реза', () => {
    // Диагональ 45° через квадрат 10×10: вход (−5,−5), выход (5,5).
    const points = segmentIntersectionPoints(
      seg({ x: -20, y: -20 }, { x: 20, y: 20 }),
      SQUARE,
    );
    expect(points).toHaveLength(2);
    // Одна точка около (−5,−5), другая около (5,5).
    const hasTopLeft = points.some(
      (p) => Math.abs(p.x - -5) < 0.01 && Math.abs(p.y - -5) < 0.01,
    );
    const hasBottomRight = points.some(
      (p) => Math.abs(p.x - 5) < 0.01 && Math.abs(p.y - 5) < 0.01,
    );
    expect(hasTopLeft).toBe(true);
    expect(hasBottomRight).toBe(true);
  });

  it('вертикальный рез прямоугольника', () => {
    const points = segmentIntersectionPoints(seg({ x: 0, y: -100 }, { x: 0, y: 100 }), RECT);
    expect(points).toHaveLength(2);
    const ys = points.map((p) => p.y).sort((a, b) => a - b);
    expect(ys[0]).toBeCloseTo(-10, 5);
    expect(ys[1]).toBeCloseTo(10, 5);
  });

  it('вырожденный полигон → пустой массив', () => {
    expect(segmentIntersectionPoints(seg({ x: 0, y: 0 }, { x: 10, y: 0 }), [])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// sliceNormal
// ---------------------------------------------------------------------------

describe('sliceNormal', () => {
  it('возвращает единичный вектор для горизонтального реза', () => {
    const n = sliceNormal({ x: 0, y: 0 }, { x: 10, y: 0 });
    // Нормаль к (1,0) — это (0,1) или (0,−1). Конвенцию выбрали: перпендикуляр по часовой
    // (−dy, dx) → для (1,0) это (0,1).
    expect(n.x).toBeCloseTo(0, 5);
    expect(n.y).toBeCloseTo(1, 5);
    // Должна быть единичной длины.
    expect(Math.hypot(n.x, n.y)).toBeCloseTo(1, 5);
  });

  it('возвращает единичный вектор для вертикального реза', () => {
    const n = sliceNormal({ x: 0, y: 0 }, { x: 0, y: 10 });
    // (−dy, dx) для (0,10) → (−10, 0) / 10 = (−1, 0).
    expect(n.x).toBeCloseTo(-1, 5);
    expect(n.y).toBeCloseTo(0, 5);
    expect(Math.hypot(n.x, n.y)).toBeCloseTo(1, 5);
  });

  it('возвращает единичный вектор для диагонали 45°', () => {
    const n = sliceNormal({ x: 0, y: 0 }, { x: 1, y: 1 });
    // (−dy, dx) для (1,1) → (−1, 1) / √2.
    expect(n.x).toBeCloseTo(-Math.SQRT1_2, 5);
    expect(n.y).toBeCloseTo(Math.SQRT1_2, 5);
    expect(Math.hypot(n.x, n.y)).toBeCloseTo(1, 5);
  });

  it('перпендикулярен к линии реза (dot product = 0)', () => {
    const from = { x: 3, y: 7 };
    const to = { x: 10, y: 2 };
    const n = sliceNormal(from, to);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    // dot(normal, line_direction) должен быть 0.
    expect(n.x * dx + n.y * dy).toBeCloseTo(0, 5);
  });

  it('нулевая линия реза → (0,0)', () => {
    const n = sliceNormal({ x: 5, y: 5 }, { x: 5, y: 5 });
    expect(n.x).toBe(0);
    expect(n.y).toBe(0);
  });

  it('масштаб линии реза не влияет на результат', () => {
    const short = sliceNormal({ x: 0, y: 0 }, { x: 1, y: 0 });
    const long = sliceNormal({ x: 0, y: 0 }, { x: 1000, y: 0 });
    expect(short.x).toBeCloseTo(long.x, 5);
    expect(short.y).toBeCloseTo(long.y, 5);
  });
});

// ---------------------------------------------------------------------------
// computeAABB
// ---------------------------------------------------------------------------

describe('computeAABB', () => {
  it('вычисляет AABB квадрата', () => {
    const aabb = computeAABB(SQUARE);
    expect(aabb.minX).toBe(-5);
    expect(aabb.minY).toBe(-5);
    expect(aabb.maxX).toBe(5);
    expect(aabb.maxY).toBe(5);
  });

  it('вычисляет AABB прямоугольника', () => {
    const aabb = computeAABB(RECT);
    expect(aabb.minX).toBe(-50);
    expect(aabb.minY).toBe(-10);
    expect(aabb.maxX).toBe(50);
    expect(aabb.maxY).toBe(10);
  });

  it('пустой полигон → вырожденный AABB', () => {
    const aabb = computeAABB([]);
    expect(aabb.minX).toBe(Infinity);
    expect(aabb.maxX).toBe(-Infinity);
  });
});

// ---------------------------------------------------------------------------
// segmentIntersectsAABB
// ---------------------------------------------------------------------------

describe('segmentIntersectsAABB', () => {
  it('true для отрезка внутри AABB', () => {
    expect(
      segmentIntersectsAABB(
        seg({ x: 0, y: 0 }, { x: 1, y: 1 }),
        { minX: -5, minY: -5, maxX: 5, maxY: 5 },
      ),
    ).toBe(true);
  });

  it('true для отрезка, пересекающего AABB', () => {
    expect(
      segmentIntersectsAABB(
        seg({ x: -10, y: 0 }, { x: 10, y: 0 }),
        { minX: -5, minY: -5, maxX: 5, maxY: 5 },
      ),
    ).toBe(true);
  });

  it('false для отрезка далеко вне AABB', () => {
    expect(
      segmentIntersectsAABB(
        seg({ x: 100, y: 100 }, { x: 200, y: 200 }),
        { minX: -5, minY: -5, maxX: 5, maxY: 5 },
      ),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Вспомогательные
// ---------------------------------------------------------------------------

function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
