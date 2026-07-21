import { describe, it, expect } from 'vitest';
import {
  prepareBodies,
  type BenchBounds,
  type BenchBodySpawn,
} from '../benchmark/physics-bench';

/**
 * Проверка pure-logic части бенчмарка (фаза 0).
 * Утверждения:
 *   - prepareBodies(N, bounds) возвращает ровно N тел;
 *   - стартовые позиции детерминированы (одинаковый seed → одинаковый результат);
 *   - все тела внутри границ коробки с учётом размера;
 *   - случай N=50 (из плана) — конкретная проверка.
 */
const BOUNDS: BenchBounds = { width: 1280, height: 720 };

describe('benchmark/prepareBodies', () => {
  it('возвращает ровно N тел', () => {
    for (const n of [0, 1, 10, 50, 100]) {
      const spawns = prepareBodies(n, BOUNDS);
      expect(spawns.length).toBe(n);
    }
  });

  it('конкретно N=50 (из плана ступени A)', () => {
    const spawns = prepareBodies(50, BOUNDS);
    expect(spawns.length).toBe(50);
  });

  it('все тела внутри границ коробки с учётом размера', () => {
    const size = 20;
    const spawns = prepareBodies(50, BOUNDS, { bodySize: size });
    const half = size / 2;
    for (const s of spawns) {
      expect(s.x).toBeGreaterThanOrEqual(half);
      expect(s.x).toBeLessThanOrEqual(BOUNDS.width - half);
      expect(s.y).toBeGreaterThanOrEqual(half);
      expect(s.y).toBeLessThanOrEqual(BOUNDS.height - half);
    }
  });

  it('детерминирован: одинаковый seed → одинаковые позиции', () => {
    const a = prepareBodies(50, BOUNDS, { seed: 42 });
    const b = prepareBodies(50, BOUNDS, { seed: 42 });
    expect(a).toEqual(b);
  });

  it('разный seed → разные позиции', () => {
    const a = prepareBodies(50, BOUNDS, { seed: 1 });
    const b = prepareBodies(50, BOUNDS, { seed: 2 });
    expect(a).not.toEqual(b);
  });

  it('по умолчанию используется фиксированный seed', () => {
    const a = prepareBodies(50, BOUNDS);
    const b = prepareBodies(50, BOUNDS);
    expect(a).toEqual(b);
  });

  it('каждое тело имеет ненулевые размеры', () => {
    const spawns = prepareBodies(20, BOUNDS);
    for (const s of spawns) {
      expect(s.width).toBeGreaterThan(0);
      expect(s.height).toBeGreaterThan(0);
    }
  });

  it('бросает на слишком малые bounds', () => {
    expect(() => prepareBodies(10, { width: 5, height: 5 }, { bodySize: 20 })).toThrow();
  });

  it('стартовые скорости ограничены разумным диапазоном', () => {
    const spawns = prepareBodies(50, BOUNDS);
    for (const s of spawns) {
      expect(Math.abs(s.vx)).toBeLessThanOrEqual(2.0001);
      expect(Math.abs(s.vy)).toBeLessThanOrEqual(2.0001);
    }
  });

  it('возвращаемые объекты соответствуют типу BenchBodySpawn', () => {
    const spawns = prepareBodies(5, BOUNDS);
    for (const s of spawns) {
      const keys: Array<keyof BenchBodySpawn> = ['x', 'y', 'width', 'height', 'vx', 'vy'];
      for (const k of keys) {
        expect(typeof s[k]).toBe('number');
      }
    }
  });

  it('N=0 → пустой массив', () => {
    expect(prepareBodies(0, BOUNDS)).toEqual([]);
  });
});
