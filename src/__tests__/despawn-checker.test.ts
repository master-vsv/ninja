import { describe, it, expect } from 'vitest';
import {
  isBelowBounds,
  createMissEvent,
  type DespawnInput,
} from '../spawn/DespawnChecker';

/**
 * Тесты DespawnChecker (фаза 2) — pure-logic детектор ухода объекта за нижний край.
 *
 * Покрываем:
 *   - объект с y внутри границ → нет miss;
 *   - y > bottom + margin → miss;
 *   - y < bottom (вверху экрана) → нет miss;
 *   - margin учитывается (пограничные значения);
 *   - createMissEvent сохраняет isBomb (для трубы-бомбы);
 *   - createMissEvent сохраняет bodyId и kind.
 */

const BOUNDS_BOTTOM = 720; // GAME_HEIGHT
const MARGIN = 80;

describe('despawn/isBelowBounds', () => {
  it('y внутри границ → нет miss', () => {
    expect(isBelowBounds(360, { bottom: BOUNDS_BOTTOM }, MARGIN)).toBe(false);
  });

  it('y > bottom + margin → miss', () => {
    expect(isBelowBounds(BOUNDS_BOTTOM + MARGIN + 1, { bottom: BOUNDS_BOTTOM }, MARGIN)).toBe(
      true,
    );
    expect(isBelowBounds(1000, { bottom: BOUNDS_BOTTOM }, MARGIN)).toBe(true);
  });

  it('y < bottom (вверху экрана) → нет miss', () => {
    expect(isBelowBounds(0, { bottom: BOUNDS_BOTTOM }, MARGIN)).toBe(false);
    expect(isBelowBounds(-100, { bottom: BOUNDS_BOTTOM }, MARGIN)).toBe(false);
  });

  it('y ровно на bottom → нет miss (строгое неравенство)', () => {
    expect(isBelowBounds(BOUNDS_BOTTOM, { bottom: BOUNDS_BOTTOM }, MARGIN)).toBe(false);
  });

  it('y = bottom + margin → нет miss (строгое неравенство >)', () => {
    expect(isBelowBounds(BOUNDS_BOTTOM + MARGIN, { bottom: BOUNDS_BOTTOM }, MARGIN)).toBe(
      false,
    );
  });

  it('y = bottom + margin + epsilon → miss', () => {
    expect(
      isBelowBounds(BOUNDS_BOTTOM + MARGIN + 0.01, { bottom: BOUNDS_BOTTOM }, MARGIN),
    ).toBe(true);
  });

  it('margin=0: y = bottom → нет miss, y = bottom + 1 → miss', () => {
    expect(isBelowBounds(BOUNDS_BOTTOM, { bottom: BOUNDS_BOTTOM }, 0)).toBe(false);
    expect(isBelowBounds(BOUNDS_BOTTOM + 1, { bottom: BOUNDS_BOTTOM }, 0)).toBe(true);
  });
});

describe('despawn/createMissEvent', () => {
  it('сохраняет bodyId и kind для режимого объекта', () => {
    const input: DespawnInput = {
      bodyId: 42,
      kind: 'bolt',
      isBomb: false,
      y: 1000,
    };
    const ev = createMissEvent(input);
    expect(ev.bodyId).toBe(42);
    expect(ev.kind).toBe('bolt');
    expect(ev.isBomb).toBe(false);
  });

  it('сохраняет isBomb=true для трубы-бомбы (штраф не накладывается, но факт эмитится)', () => {
    const input: DespawnInput = {
      bodyId: 7,
      kind: 'pipe',
      isBomb: true,
      y: 1500,
    };
    const ev = createMissEvent(input);
    expect(ev.kind).toBe('pipe');
    expect(ev.isBomb).toBe(true);
  });

  it('для всех режимых видов isBomb=false', () => {
    const kinds = ['bolt', 'nut', 'ruler', 'standard'] as const;
    for (const kind of kinds) {
      const ev = createMissEvent({
        bodyId: 1,
        kind,
        isBomb: false,
        y: 1000,
      });
      expect(ev.isBomb).toBe(false);
    }
  });

  it('возвращаемое событие имеет ровно 3 поля (контракт)', () => {
    const ev = createMissEvent({
      bodyId: 1,
      kind: 'bolt',
      isBomb: false,
      y: 1000,
    });
    expect(Object.keys(ev).sort()).toEqual(['bodyId', 'isBomb', 'kind']);
  });
});
