import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HapticsState, HAPTIC_PATTERNS } from '../perf/HapticsState';

/**
 * Тесты HapticsState (фаза 7) — pure-logic состояние вибро-откликов.
 *
 * Назначение (план, фаза 7): navigator.vibrate на мобайл для slice/bomb/gameover.
 * Haptics — ОПЦИОНАЛЬНЫЙ: не падать, если API нет (canVibrate=false → noop).
 *
 * Контракт:
 *   - canVibrate: feature-detect navigator.vibrate (или инжектируемого vibeFn);
 *   - vibe(pattern) → вызывает vibeFn если canVibrate, иначе noop (false);
 *   - именованные шаблоны: slice (короткий), bomb (длинный), gameover;
 *   - инжектируемый navigator/vibeFn для тестов (НЕ зависит от Phaser).
 *
 * Модуль НЕ зависит от Phaser — тестируется в чистом окружении.
 */

/** Создаёт spy vibe-функцию (совместимую с navigator.vibrate). */
function makeVibeSpy() {
  return vi.fn((_pattern: number | number[]) => true);
}

describe('HapticsState / canVibrate — feature-detect', () => {
  it('canVibrate=true если vibeFn передан', () => {
    const h = new HapticsState({ vibeFn: makeVibeSpy() });
    expect(h.canVibrate).toBe(true);
  });

  it('canVibrate=false если vibeFn=null', () => {
    const h = new HapticsState({ vibeFn: null });
    expect(h.canVibrate).toBe(false);
  });

  it('canVibrate=false если vibeFn=undefined и navigator без vibrate', () => {
    const h = new HapticsState({ navigator: {} });
    expect(h.canVibrate).toBe(false);
  });

  it('canVibrate=true если navigator.vibrate присутствует', () => {
    const spy = makeVibeSpy();
    const h = new HapticsState({ navigator: { vibrate: spy } });
    expect(h.canVibrate).toBe(true);
  });

  it('явный vibeFn приоритетнее navigator.vibrate', () => {
    const navSpy = makeVibeSpy();
    const fnSpy = makeVibeSpy();
    const h = new HapticsState({
      vibeFn: fnSpy,
      navigator: { vibrate: navSpy },
    });
    h.vibe(10);
    expect(fnSpy).toHaveBeenCalledWith(10);
    expect(navSpy).not.toHaveBeenCalled();
  });
});

describe('HapticsState / vibe — делегирование', () => {
  it('vibe вызывает vibeFn с переданным паттерном', () => {
    const spy = makeVibeSpy();
    const h = new HapticsState({ vibeFn: spy });
    h.vibe(25);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(25);
  });

  it('vibe с массивом-паттерном прокидывается как есть', () => {
    const spy = makeVibeSpy();
    const h = new HapticsState({ vibeFn: spy });
    h.vibe([100, 50, 100]);
    expect(spy).toHaveBeenCalledWith([100, 50, 100]);
  });

  it('vibe возвращает результат vibeFn', () => {
    const h = new HapticsState({ vibeFn: () => true });
    expect(h.vibe(10)).toBe(true);
  });

  it('vibe возвращает false если vibeFn вернул false', () => {
    const h = new HapticsState({ vibeFn: () => false });
    expect(h.vibe(10)).toBe(false);
  });
});

describe('HapticsState / vibe — no-vibrate noop', () => {
  it('без vibeFn vibe не падает и возвращает false', () => {
    const h = new HapticsState({ vibeFn: null });
    expect(() => h.vibe(10)).not.toThrow();
    expect(h.vibe(10)).toBe(false);
  });

  it('без vibeFn vibe([]) тоже noop', () => {
    const h = new HapticsState({ vibeFn: null });
    expect(h.vibe([100, 50])).toBe(false);
  });
});

describe('HapticsState / именованные паттерны', () => {
  it('vibeSlice использует короткий паттерн (число)', () => {
    expect(typeof HAPTIC_PATTERNS.slice).toBe('number');
    expect(HAPTIC_PATTERNS.slice).toBeLessThanOrEqual(30);
  });

  it('vibeBomb использует длинный паттерн (массив)', () => {
    expect(Array.isArray(HAPTIC_PATTERNS.bomb)).toBe(true);
    expect(HAPTIC_PATTERNS.bomb.length).toBeGreaterThan(0);
  });

  it('vibeGameover использует длинный паттерн (массив)', () => {
    expect(Array.isArray(HAPTIC_PATTERNS.gameover)).toBe(true);
    expect(HAPTIC_PATTERNS.gameover.length).toBeGreaterThan(0);
  });

  it('vibeSlice вызывает vibeFn с PATTERNS.slice', () => {
    const spy = makeVibeSpy();
    const h = new HapticsState({ vibeFn: spy });
    h.vibeSlice();
    expect(spy).toHaveBeenCalledWith(HAPTIC_PATTERNS.slice);
  });

  it('vibeBomb вызывает vibeFn с PATTERNS.bomb', () => {
    const spy = makeVibeSpy();
    const h = new HapticsState({ vibeFn: spy });
    h.vibeBomb();
    expect(spy).toHaveBeenCalledWith(HAPTIC_PATTERNS.bomb);
  });

  it('vibeGameover вызывает vibeFn с PATTERNS.gameover', () => {
    const spy = makeVibeSpy();
    const h = new HapticsState({ vibeFn: spy });
    h.vibeGameover();
    expect(spy).toHaveBeenCalledWith(HAPTIC_PATTERNS.gameover);
  });

  it('именованые методы noop при canVibrate=false', () => {
    const h = new HapticsState({ vibeFn: null });
    expect(h.vibeSlice()).toBe(false);
    expect(h.vibeBomb()).toBe(false);
    expect(h.vibeGameover()).toBe(false);
  });
});

describe('HapticsState / счётчик вызовов и reset', () => {
  it('callCount инкрементируется только при реальном вызове vibeFn', () => {
    const spy = makeVibeSpy();
    const h = new HapticsState({ vibeFn: spy });
    expect(h.callCount).toBe(0);
    h.vibe(10);
    h.vibeSlice();
    expect(h.callCount).toBe(2);
  });

  it('callCount не растёт при noop (canVibrate=false)', () => {
    const h = new HapticsState({ vibeFn: null });
    h.vibe(10);
    h.vibeSlice();
    expect(h.callCount).toBe(0);
  });

  it('reset обнуляет callCount', () => {
    const spy = makeVibeSpy();
    const h = new HapticsState({ vibeFn: spy });
    h.vibe(10);
    h.reset();
    expect(h.callCount).toBe(0);
  });

  it('reset не меняет canVibrate', () => {
    const spy = makeVibeSpy();
    const h = new HapticsState({ vibeFn: spy });
    expect(h.canVibrate).toBe(true);
    h.reset();
    expect(h.canVibrate).toBe(true);
  });
});

describe('HapticsState / feature-detect глобального navigator', () => {
  const original = (globalThis as { navigator?: Navigator }).navigator;
  beforeEach(() => {
    // Чистим navigator между тестами для детерминизма.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).navigator;
  });
  afterEach(() => {
    if (original !== undefined) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).navigator = original;
    }
  });

  it('canVibrate=true если у глобального navigator есть vibrate', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).navigator = { vibrate: makeVibeSpy() };
    const h = new HapticsState();
    expect(h.canVibrate).toBe(true);
  });

  it('canVibrate=false если глобального navigator нет', () => {
    const h = new HapticsState();
    expect(h.canVibrate).toBe(false);
  });
});
