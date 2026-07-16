import { describe, it, expect, vi } from 'vitest';
import { HapticsSystem } from '../systems/HapticsSystem';
import { EventBus } from '../events/EventBus';
import { EVENT } from '../events/types';
import { HAPTIC_PATTERNS } from '../perf/HapticsState';
import type { SliceEvent } from '../events/SliceEvent';

/**
 * Wiring-тесты HapticsSystem (фаза 7).
 *
 * Цель: проверить тонкую Phaser-обёртку без реального Phaser.Game:
 *   - подписка на 'slice' через EventBus → vibeBomb если isBomb, иначе vibeSlice;
 *   - подписка на 'game-over' → vibeGameover;
 *   - делегирование в HapticsState (feature-detect vibeFn);
 *   - destroy() отписывается от событий.
 *
 * scene не используется системой напрямую (только в типах) — передаём unknown-каст.
 */

/** Создаёт spy vibe-функцию. */
function makeVibeSpy() {
  return vi.fn((_pattern: number | number[]) => true);
}

/** Создаёт SliceEvent с минимумом нужных полей. */
function makeSliceEvent(
  bodyId: number,
  isBomb: boolean,
): SliceEvent {
  return {
    id: `test-${bodyId}`,
    timestamp: performance.now(),
    bodyId,
    kind: isBomb ? 'pipe' : 'bolt',
    isBomb,
    slice: {
      // Минимальная фигура — HapticsSystem геометрию не использует.
      from: { x: 0, y: 0 } as never,
      to: { x: 1, y: 0 } as never,
      angle: 0,
    },
    swordType: null,
    fragments: [],
  };
}

describe('HapticsSystem / wiring slice', () => {
  it('slice обычного объекта → вызывает vibeSlice (паттерн slice)', () => {
    const spy = makeVibeSpy();
    const bus = new EventBus();
    const sys = new HapticsSystem({} as never, {
      eventBus: bus,
      hapticsOptions: { vibeFn: spy },
    });

    bus.emit(EVENT.slice, makeSliceEvent(1, false));

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(HAPTIC_PATTERNS.slice);
    sys.destroy();
  });

  it('slice трубы-бомбы → вызывает vibeBomb (длинный паттерн)', () => {
    const spy = makeVibeSpy();
    const bus = new EventBus();
    const sys = new HapticsSystem({} as never, {
      eventBus: bus,
      hapticsOptions: { vibeFn: spy },
    });

    bus.emit(EVENT.slice, makeSliceEvent(2, true));

    expect(spy).toHaveBeenCalledWith(HAPTIC_PATTERNS.bomb);
    expect(spy).not.toHaveBeenCalledWith(HAPTIC_PATTERNS.slice);
    sys.destroy();
  });

  it('несколько slice → столько же вызовов vibe', () => {
    const spy = makeVibeSpy();
    const bus = new EventBus();
    const sys = new HapticsSystem({} as never, {
      eventBus: bus,
      hapticsOptions: { vibeFn: spy },
    });

    bus.emit(EVENT.slice, makeSliceEvent(1, false));
    bus.emit(EVENT.slice, makeSliceEvent(2, false));
    bus.emit(EVENT.slice, makeSliceEvent(3, true));

    expect(spy).toHaveBeenCalledTimes(3);
    sys.destroy();
  });
});

describe('HapticsSystem / wiring game-over', () => {
  it('game-over → вызывает vibeGameover (длинный паттерн)', () => {
    const spy = makeVibeSpy();
    const bus = new EventBus();
    const sys = new HapticsSystem({} as never, {
      eventBus: bus,
      hapticsOptions: { vibeFn: spy },
    });

    bus.emit(EVENT.gameOver, { reason: 'bomb' });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(HAPTIC_PATTERNS.gameover);
    sys.destroy();
  });

  it('game-over no-lives → тоже vibeGameover', () => {
    const spy = makeVibeSpy();
    const bus = new EventBus();
    const sys = new HapticsSystem({} as never, {
      eventBus: bus,
      hapticsOptions: { vibeFn: spy },
    });

    bus.emit(EVENT.gameOver, { reason: 'no-lives' });

    expect(spy).toHaveBeenCalledWith(HAPTIC_PATTERNS.gameover);
    sys.destroy();
  });
});

describe('HapticsSystem / canVibrate (feature-detect)', () => {
  it('canVibrate=true когда vibeFn передан', () => {
    const spy = makeVibeSpy();
    const sys = new HapticsSystem({} as never, {
      eventBus: new EventBus(),
      hapticsOptions: { vibeFn: spy },
    });
    expect(sys.canVibrate).toBe(true);
    sys.destroy();
  });

  it('canVibrate=false без vibeFn → slice/gameover не вызывают vibe', () => {
    const bus = new EventBus();
    const sys = new HapticsSystem({} as never, {
      eventBus: bus,
      hapticsOptions: { vibeFn: null },
    });
    expect(sys.canVibrate).toBe(false);

    bus.emit(EVENT.slice, makeSliceEvent(1, false));
    bus.emit(EVENT.gameOver, { reason: 'bomb' });

    expect(sys.state.callCount).toBe(0);
    sys.destroy();
  });
});

describe('HapticsSystem / destroy', () => {
  it('после destroy slice-событие больше не вызывает vibe', () => {
    const spy = makeVibeSpy();
    const bus = new EventBus();
    const sys = new HapticsSystem({} as never, {
      eventBus: bus,
      hapticsOptions: { vibeFn: spy },
    });

    sys.destroy();
    bus.emit(EVENT.slice, makeSliceEvent(1, false));

    expect(spy).not.toHaveBeenCalled();
  });

  it('после destroy game-over-событие больше не вызывает vibe', () => {
    const spy = makeVibeSpy();
    const bus = new EventBus();
    const sys = new HapticsSystem({} as never, {
      eventBus: bus,
      hapticsOptions: { vibeFn: spy },
    });

    sys.destroy();
    bus.emit(EVENT.gameOver, { reason: 'bomb' });

    expect(spy).not.toHaveBeenCalled();
  });

  it('destroy идемпотентен (двойной вызов не падает)', () => {
    const sys = new HapticsSystem({} as never, {
      eventBus: new EventBus(),
      hapticsOptions: { vibeFn: makeVibeSpy() },
    });
    expect(() => {
      sys.destroy();
      sys.destroy();
    }).not.toThrow();
  });
});
