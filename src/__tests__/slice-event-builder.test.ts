import { describe, it, expect } from 'vitest';
import { buildSliceEvent, type BuildSliceEventInput } from '../slice/SliceEventBuilder';
import type { Vec2 } from '../slice/Geometry';

/**
 * Тесты сборщика SliceEvent (фаза 3).
 *
 * SliceEventBuilder собирает финальное событие разреза из входных данных:
 *   - id: генерируется автоматически (если не передан);
 *   - timestamp: performance.now() на момент сборки (если не передан);
 *   - slice.angle: вычисляется как atan2(dy, dx) линии реза;
 *   - swordType: null в фазе 3 (до фазы 5);
 *   - fragments[*].velocity: вдоль нормали реза, направление зависит от стороны
 *     фрагмента относительно линии реза (разлет в разные стороны).
 *
 * Pure-logic: не запускает Phaser.
 */

// Квадрат 10×10.
const SQUARE_VERTICES: ReadonlyArray<Vec2> = [
  { x: -5, y: -5 },
  { x: 5, y: -5 },
  { x: 5, y: 5 },
  { x: -5, y: 5 },
];

describe('SliceEventBuilder / buildSliceEvent', () => {
  it('собирает событие со всеми полями', () => {
    const input: BuildSliceEventInput = {
      bodyId: 42,
      kind: 'bolt',
      isBomb: false,
      slice: { from: { x: -10, y: 0 }, to: { x: 10, y: 0 } },
      fragmentVertices: [
        [
          { x: -5, y: -5 },
          { x: 5, y: -5 },
          { x: 5, y: 0 },
          { x: -5, y: 0 },
        ],
        [
          { x: -5, y: 0 },
          { x: 5, y: 0 },
          { x: 5, y: 5 },
          { x: -5, y: 5 },
        ],
      ],
    };
    const ev = buildSliceEvent(input);

    expect(ev.bodyId).toBe(42);
    expect(ev.kind).toBe('bolt');
    expect(ev.isBomb).toBe(false);
    expect(ev.swordType).toBeNull();
    expect(ev.id).toBeTruthy();
    expect(ev.timestamp).toBeGreaterThan(0);
    expect(ev.fragments.length).toBe(2);
  });

  it('вычисляет slice.angle как atan2(dy, dx)', () => {
    const ev = buildSliceEvent({
      bodyId: 1,
      kind: 'nut',
      isBomb: false,
      slice: { from: { x: 0, y: 0 }, to: { x: 10, y: 0 } },
      fragmentVertices: [SQUARE_VERTICES, SQUARE_VERTICES],
    });
    // Горизонтальный рез вправо: atan2(0, 10) = 0.
    expect(ev.slice.angle).toBeCloseTo(0, 5);
  });

  it('slice.angle для вертикального реза (вниз)', () => {
    const ev = buildSliceEvent({
      bodyId: 1,
      kind: 'nut',
      isBomb: false,
      slice: { from: { x: 0, y: 0 }, to: { x: 0, y: 10 } },
      fragmentVertices: [SQUARE_VERTICES, SQUARE_VERTICES],
    });
    // atan2(10, 0) = π/2.
    expect(ev.slice.angle).toBeCloseTo(Math.PI / 2, 5);
  });

  it('swordType по умолчанию null (фаза 3, до мечей)', () => {
    const ev = buildSliceEvent({
      bodyId: 1,
      kind: 'ruler',
      isBomb: false,
      slice: { from: { x: 0, y: 0 }, to: { x: 10, y: 0 } },
      fragmentVertices: [SQUARE_VERTICES, SQUARE_VERTICES],
    });
    expect(ev.swordType).toBeNull();
  });

  it('isBomb=true для трубы (контракт сохраняется)', () => {
    const ev = buildSliceEvent({
      bodyId: 99,
      kind: 'pipe',
      isBomb: true,
      slice: { from: { x: 0, y: 0 }, to: { x: 10, y: 0 } },
      fragmentVertices: [SQUARE_VERTICES, SQUARE_VERTICES],
    });
    expect(ev.isBomb).toBe(true);
    expect(ev.kind).toBe('pipe');
  });

  it('скорость фрагмента коллинеарна нормали реза', () => {
    // Горизонтальный рез: нормаль = (0, 1) (перпендикуляр по часовой).
    // Скорости фрагментов должны быть (0, ±speed).
    const ev = buildSliceEvent({
      bodyId: 1,
      kind: 'bolt',
      isBomb: false,
      slice: { from: { x: -10, y: 0 }, to: { x: 10, y: 0 } },
      fragmentVertices: [
        // Верхний фрагмент (y > 0 относительно линии реза).
        [
          { x: -5, y: 0 },
          { x: 5, y: 0 },
          { x: 5, y: 5 },
          { x: -5, y: 5 },
        ],
        // Нижний фрагмент (y < 0).
        [
          { x: -5, y: -5 },
          { x: 5, y: -5 },
          { x: 5, y: 0 },
          { x: -5, y: 0 },
        ],
      ],
      fragmentSpeed: 5,
    });

    // Один фрагмент идёт вверх (+y), другой вниз (−y). Скорость ненулевая.
    const velocities = ev.fragments.map((f) => f.velocity);
    const hasUp = velocities.some((v) => v.y > 0.1);
    const hasDown = velocities.some((v) => v.y < -0.1);
    expect(hasUp).toBe(true);
    expect(hasDown).toBe(true);

    // x-компонента скорости ≈ 0 для горизонтального реза.
    for (const v of velocities) {
      expect(Math.abs(v.x)).toBeLessThan(0.01);
    }
  });

  it('импульсы фрагментов противоположны (разлёт в разные стороны)', () => {
    const ev = buildSliceEvent({
      bodyId: 1,
      kind: 'bolt',
      isBomb: false,
      slice: { from: { x: -10, y: 0 }, to: { x: 10, y: 0 } },
      fragmentVertices: [
        [
          { x: -5, y: 0 },
          { x: 5, y: 0 },
          { x: 5, y: 5 },
          { x: -5, y: 5 },
        ],
        [
          { x: -5, y: -5 },
          { x: 5, y: -5 },
          { x: 5, y: 0 },
          { x: -5, y: 0 },
        ],
      ],
      fragmentSpeed: 3,
    });
    const v0 = ev.fragments[0].velocity;
    const v1 = ev.fragments[1].velocity;
    // v0 + v1 ≈ 0 (противоположные направления для симметричного разреза).
    expect(v0.x + v1.x).toBeCloseTo(0, 5);
    expect(v0.y + v1.y).toBeCloseTo(0, 5);
  });

  it('fragmentSpeed влияет на модуль velocity', () => {
    const baseInput = {
      bodyId: 1,
      kind: 'bolt' as const,
      isBomb: false,
      slice: { from: { x: -10, y: 0 } as Vec2, to: { x: 10, y: 0 } as Vec2 },
      fragmentVertices: [
        [
          { x: -5, y: 0 },
          { x: 5, y: 0 },
          { x: 5, y: 5 },
          { x: -5, y: 5 },
        ],
      ],
    };
    const slow = buildSliceEvent({ ...baseInput, fragmentSpeed: 1 });
    const fast = buildSliceEvent({ ...baseInput, fragmentSpeed: 10 });
    const speedSlow = Math.hypot(slow.fragments[0].velocity.x, slow.fragments[0].velocity.y);
    const speedFast = Math.hypot(fast.fragments[0].velocity.x, fast.fragments[0].velocity.y);
    expect(speedFast).toBeGreaterThan(speedSlow);
    expect(speedFast).toBeCloseTo(10, 5);
    expect(speedSlow).toBeCloseTo(1, 5);
  });

  it('переданные id и timestamp сохраняются', () => {
    const ev = buildSliceEvent({
      bodyId: 1,
      kind: 'nut',
      isBomb: false,
      slice: { from: { x: 0, y: 0 }, to: { x: 10, y: 0 } },
      fragmentVertices: [SQUARE_VERTICES, SQUARE_VERTICES],
      id: 'fixed-id',
      timestamp: 12345,
    });
    expect(ev.id).toBe('fixed-id');
    expect(ev.timestamp).toBe(12345);
  });

  it('возвращаемый объект соответствует контракту SliceEvent (структурно)', () => {
    const ev = buildSliceEvent({
      bodyId: 1,
      kind: 'standard',
      isBomb: false,
      slice: { from: { x: 0, y: 0 }, to: { x: 10, y: 0 } },
      fragmentVertices: [SQUARE_VERTICES, SQUARE_VERTICES],
    });
    // Структурная проверка: все поля, заявленные в SliceEvent, присутствуют.
    expect(typeof ev.id).toBe('string');
    expect(typeof ev.timestamp).toBe('number');
    expect(typeof ev.bodyId).toBe('number');
    expect(['bolt', 'nut', 'ruler', 'standard', 'pipe']).toContain(ev.kind);
    expect(typeof ev.isBomb).toBe('boolean');
    expect(ev.slice).toBeDefined();
    expect(typeof ev.slice.from.x).toBe('number');
    expect(typeof ev.slice.from.y).toBe('number');
    expect(typeof ev.slice.to.x).toBe('number');
    expect(typeof ev.slice.to.y).toBe('number');
    expect(typeof ev.slice.angle).toBe('number');
    expect(ev.swordType === null || typeof ev.swordType === 'string').toBe(true);
    expect(Array.isArray(ev.fragments)).toBe(true);
    for (const f of ev.fragments) {
      expect(Array.isArray(f.vertices)).toBe(true);
      expect(typeof f.velocity.x).toBe('number');
      expect(typeof f.velocity.y).toBe('number');
    }
  });

  it('вырожденный случай: fragmentVertices пустой → fragments пустой', () => {
    const ev = buildSliceEvent({
      bodyId: 1,
      kind: 'nut',
      isBomb: false,
      slice: { from: { x: 0, y: 0 }, to: { x: 10, y: 0 } },
      fragmentVertices: [],
    });
    expect(ev.fragments).toEqual([]);
  });

  it('нулевая линия реза → angle = 0 (вырожденный случай)', () => {
    const ev = buildSliceEvent({
      bodyId: 1,
      kind: 'nut',
      isBomb: false,
      slice: { from: { x: 5, y: 5 }, to: { x: 5, y: 5 } },
      fragmentVertices: [SQUARE_VERTICES],
    });
    // atan2(0, 0) = 0.
    expect(ev.slice.angle).toBe(0);
  });

  it('id уникальны при множественных вызовах', () => {
    const baseInput = {
      bodyId: 1,
      kind: 'nut' as const,
      isBomb: false,
      slice: { from: { x: 0, y: 0 } as Vec2, to: { x: 10, y: 0 } as Vec2 },
      fragmentVertices: [SQUARE_VERTICES],
    };
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(buildSliceEvent(baseInput).id);
    }
    expect(ids.size).toBe(100);
  });
});
