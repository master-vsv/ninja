import { describe, it, expect } from 'vitest';
import { sliceConvex } from '../slice/PolyKSlicer';
import type { Polygon, Vec2 } from '../slice/Geometry';

/**
 * Тесты обёртки над PolyK.Slice (фаза 3).
 *
 * PolyKSlicer конвертирует между нашим форматом Polygon (массив {x,y}) и flat-форматом
 * PolyK ([x1,y1,x2,y2,...]), вызывает PolyK.Slice, нормализует результат.
 *
 * Контракт sliceConvex:
 *   - Выпуклый полигон, разрезанный через 2 ребра → 2 валидных полигона.
 *   - Нет пересечения (линия не задевает полигон) → null.
 *   - Линия касается вершины → корректный edge-case (2 полигона или null).
 *   - Каждый выходной полигон имеет ≥ 3 вершин.
 */

// Квадрат 10×10 с центром в (0,0).
const SQUARE: Polygon = [
  { x: -5, y: -5 },
  { x: 5, y: -5 },
  { x: 5, y: 5 },
  { x: -5, y: 5 },
];

// Прямоугольник 100×20.
const RECT: Polygon = [
  { x: -50, y: -10 },
  { x: 50, y: -10 },
  { x: 50, y: 10 },
  { x: -50, y: 10 },
];

function line(from: Vec2, to: Vec2) {
  return { from, to };
}

describe('PolyKSlicer / sliceConvex', () => {
  it('разрезает квадрат горизонтальным резом на 2 полигона', () => {
    const result = sliceConvex(SQUARE, line({ x: -20, y: 0 }, { x: 20, y: 0 }));
    expect(result).not.toBeNull();
    expect(result!.length).toBe(2);
    for (const poly of result!) {
      expect(poly.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('разрезает квадрат вертикальным резом на 2 полигона', () => {
    const result = sliceConvex(SQUARE, line({ x: 0, y: -20 }, { x: 0, y: 20 }));
    expect(result).not.toBeNull();
    expect(result!.length).toBe(2);
  });

  it('разрезает квадрат диагональным резом на 2 полигона', () => {
    const result = sliceConvex(SQUARE, line({ x: -20, y: -20 }, { x: 20, y: 20 }));
    expect(result).not.toBeNull();
    expect(result!.length).toBe(2);
  });

  it('разрезает длинный прямоугольник поперёк', () => {
    const result = sliceConvex(RECT, line({ x: 0, y: -100 }, { x: 0, y: 100 }));
    expect(result).not.toBeNull();
    expect(result!.length).toBe(2);
    // Каждый фрагмент должен быть «половиной» прямоугольника.
    const areas = result!.map(polygonArea);
    const totalArea = areas.reduce((a, b) => a + b, 0);
    // Площадь исходного прямоугольника = 100 * 20 = 2000.
    expect(totalArea).toBeCloseTo(2000, -1);
  });

  it('разрезает прямоугольник вдоль', () => {
    const result = sliceConvex(RECT, line({ x: -100, y: 0 }, { x: 100, y: 0 }));
    expect(result).not.toBeNull();
    expect(result!.length).toBe(2);
    const areas = result!.map(polygonArea);
    const totalArea = areas.reduce((a, b) => a + b, 0);
    expect(totalArea).toBeCloseTo(2000, -1);
  });

  it('возвращает null если линия не пересекает полигон', () => {
    const result = sliceConvex(SQUARE, line({ x: 100, y: 0 }, { x: 200, y: 0 }));
    expect(result).toBeNull();
  });

  it('возвращает null если линия касается полигона только снаружи', () => {
    // Линия в 1px от верхней грани, не пересекает.
    const result = sliceConvex(SQUARE, line({ x: -20, y: -6 }, { x: 20, y: -6 }));
    expect(result).toBeNull();
  });

  it('каждый результирующий полигон имеет ≥ 3 вершин', () => {
    const result = sliceConvex(SQUARE, line({ x: -20, y: 0 }, { x: 20, y: 0 }));
    expect(result).not.toBeNull();
    for (const poly of result!) {
      expect(poly.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('сумма площадей фрагментов ≈ площади исходного полигона', () => {
    const result = sliceConvex(SQUARE, line({ x: -20, y: 0 }, { x: 20, y: 0 }));
    expect(result).not.toBeNull();
    const totalArea = result!.map(polygonArea).reduce((a, b) => a + b, 0);
    // Площадь квадрата 10×10 = 100.
    expect(totalArea).toBeCloseTo(100, -1);
  });

  it('разрезает шестиугольник (Bolt из OBJECT_REGISTRY)', () => {
    const hexPoints: Vec2[] = [];
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i;
      hexPoints.push({ x: Math.cos(a) * 28, y: Math.sin(a) * 28 });
    }
    const hex: Polygon = hexPoints;
    const result = sliceConvex(hex, line({ x: -100, y: 0 }, { x: 100, y: 0 }));
    expect(result).not.toBeNull();
    expect(result!.length).toBe(2);
  });

  it('вырожденный полигон (<3 вершин) → null', () => {
    expect(sliceConvex([], line({ x: 0, y: 0 }, { x: 10, y: 0 }))).toBeNull();
    expect(
      sliceConvex(
        [{ x: 0, y: 0 }],
        line({ x: 0, y: 0 }, { x: 10, y: 0 }),
      ),
    ).toBeNull();
    expect(
      sliceConvex(
        [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ],
        line({ x: 0, y: 0 }, { x: 10, y: 0 }),
      ),
    ).toBeNull();
  });

  it('рез по ребру (коллинеарно ребру) → null или один полигон', () => {
    // Рез ровно по верхней грани квадрата — должен вернуть null (не режет).
    const result = sliceConvex(SQUARE, line({ x: -3, y: -5 }, { x: 3, y: -5 }));
    expect(result).toBeNull();
  });

  it('если линия заканчивается внутри полигона → null (нет второго пересечения)', () => {
    // Линия с одним концом внутри квадрата. PolyK.Slice возвращает [original].
    // По нашему контракту sliceConvex → null (нет полноценного разреза).
    const result = sliceConvex(SQUARE, line({ x: 0, y: 0 }, { x: 100, y: 0 }));
    // Один конец внутри (0,0), другой снаружи → PolyK.Slice вернёт [original].
    // Наша обёртка это детектит и возвращает null.
    expect(result).toBeNull();
  });

  it('фрагменты не содержат NaN-координат', () => {
    const result = sliceConvex(SQUARE, line({ x: -20, y: 3 }, { x: 20, y: -3 }));
    expect(result).not.toBeNull();
    for (const poly of result!) {
      for (const v of poly) {
        expect(Number.isFinite(v.x)).toBe(true);
        expect(Number.isFinite(v.y)).toBe(true);
      }
    }
  });
});

/**
 * Площадь полигона через формулу Гаусса (shoelace).
 * Используется только в тестах для проверки корректности разреза.
 */
function polygonArea(poly: ReadonlyArray<Vec2>): number {
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    area += a.x * b.y - b.x * a.y;
  }
  return Math.abs(area) / 2;
}
