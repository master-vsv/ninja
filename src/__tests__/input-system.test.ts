import { describe, it, expect } from 'vitest';
import { InputSystem } from '../systems/InputSystem';

/**
 * Тесты InputSystem (фаза 1) с mock Phaser.Scene.
 *
 * Цель: проверить wiring — что тонкая Phaser-обёртка корректно связывает
 * pointer events с чистыми модулями (TrailBuffer, CoalescedResolver,
 * AudioUnlockState). Чистая логика этих модулей покрыта отдельными тестами.
 *
 * Без реального Phaser.Game (правило фазы 0: не запускать рендер в тестах),
 * поэтому scene/input/graphics/sound/scale подделываются минимально.
 */

/** Типизированный псевдоним для mock-сцены (любой объект с нужными полями). */
type MockScene = Record<string, unknown>;

/**
 * Минимальный stub Phaser.Scene: input.on/off с поддержкой context,
 * add.graphics() возвращает stub, sound.unlock() считает вызовы,
 * scale.transformX/Y — identity (DOM-координаты совпадают с игровыми).
 */
function createMockScene(): MockScene & {
  fire(event: string, pointer: unknown): void;
  handlerCount(event: string): number;
  readonly state: {
    soundUnlockCount: number;
    graphicsClearCount: number;
    graphicsDestroyed: boolean;
    drawCalls: number;
  };
} {
  const handlers = new Map<string, Array<{ cb: (...args: unknown[]) => void; ctx: unknown }>>();
  const graphicsState = {
    clearCount: 0,
    destroyed: false,
    drawCalls: 0,
  };
  const graphics = {
    clear: () => {
      graphicsState.clearCount++;
    },
    destroy: () => {
      graphicsState.destroyed = true;
    },
    lineStyle: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    strokePath: () => {
      graphicsState.drawCalls++;
    },
  };
  const soundState = { unlockCount: 0 };

  const scene: MockScene = {
    input: {
      on(event: string, cb: (...args: unknown[]) => void, ctx: unknown) {
        const list = handlers.get(event) ?? [];
        list.push({ cb, ctx });
        handlers.set(event, list);
      },
      off(event: string, cb: (...args: unknown[]) => void, ctx: unknown) {
        const list = handlers.get(event) ?? [];
        handlers.set(
          event,
          list.filter((h) => h.cb !== cb || h.ctx !== ctx),
        );
      },
    },
    add: {
      graphics: () => graphics,
    },
    sound: {
      unlock: () => {
        soundState.unlockCount++;
      },
    },
    // FIT-scale: для простоты теста — identity (координаты совпадают).
    scale: {
      transformX: (x: number) => x,
      transformY: (y: number) => y,
    },
  };

  return {
    ...scene,
    fire(event: string, pointer: unknown) {
      const list = handlers.get(event) ?? [];
      for (const { cb, ctx } of list) {
        cb.call(ctx, pointer);
      }
    },
    handlerCount(event: string) {
      return (handlers.get(event) ?? []).length;
    },
    state: {
      get soundUnlockCount() {
        return soundState.unlockCount;
      },
      get graphicsClearCount() {
        return graphicsState.clearCount;
      },
      get graphicsDestroyed() {
        return graphicsState.destroyed;
      },
      get drawCalls() {
        return graphicsState.drawCalls;
      },
    },
  };
}

/**
 * Упрощённый Phaser.Input.Pointer для тестов.
 *
 * isDown=true по умолчанию: в реальном Phaser pointermove во время зажатой
 * кнопки/пальца всегда имеет pointer.isDown === true. Все тестовые сценарии
 * делают pointerdown перед pointermove (активный свайп), поэтому pointer
 * находится в зажатом состоянии. Guard `if (!pointer.isDown) return;` в
 * InputSystem.handlePointerMove (см. bugfix #13 «след меча») требует этого поля
 * — без него pointermove-тесты видят trail.size=1 (только точка pointerdown).
 */
function makePointer(
  x: number,
  y: number,
  coalesced?: Array<{ clientX: number; clientY: number; timeStamp: number }>,
  timeStamp: number = performance.now(),
): { x: number; y: number; isDown: boolean; event: unknown } {
  const event: Record<string, unknown> = { timeStamp };
  if (coalesced !== undefined) {
    event.getCoalescedEvents = () => coalesced;
  } else {
    // Имитируем браузер БЕЗ getCoalescedEvents (Safari iOS < 14.5).
    event.getCoalescedEvents = undefined;
  }
  return { x, y, isDown: true, event };
}

describe('InputSystem', () => {
  it('в конструкторе подписывается на 4 pointer events', () => {
    const scene = createMockScene();
    // eslint-disable-next-line no-new
    new InputSystem(scene as never);
    expect(scene.handlerCount('pointerdown')).toBe(1);
    expect(scene.handlerCount('pointermove')).toBe(1);
    expect(scene.handlerCount('pointerup')).toBe(1);
    expect(scene.handlerCount('pointercancel')).toBe(1);
  });

  it('audioUnlocked=false в начальном состоянии', () => {
    const scene = createMockScene();
    const sys = new InputSystem(scene as never);
    expect(sys.audioUnlocked).toBe(false);
  });

  it('первый pointerdown → вызывает sound.unlock() один раз и переводит в audioUnlocked=true', () => {
    const scene = createMockScene();
    const sys = new InputSystem(scene as never);
    scene.fire('pointerdown', makePointer(100, 100));
    expect(scene.state.soundUnlockCount).toBe(1);
    expect(sys.audioUnlocked).toBe(true);
  });

  it('повторные pointerdown НЕ вызывают sound.unlock() повторно', () => {
    const scene = createMockScene();
    const sys = new InputSystem(scene as never);
    scene.fire('pointerdown', makePointer(10, 10));
    scene.fire('pointerdown', makePointer(20, 20));
    scene.fire('pointerdown', makePointer(30, 30));
    expect(scene.state.soundUnlockCount).toBe(1);
    expect(sys.audioUnlocked).toBe(true);
  });

  it('pointerdown добавляет первую точку в trail buffer', () => {
    const scene = createMockScene();
    const sys = new InputSystem(scene as never);
    scene.fire('pointerdown', makePointer(42, 24));
    expect(sys.trail.size).toBe(1);
    const points = sys.trail.getPoints();
    expect(points[0].x).toBe(42);
    expect(points[0].y).toBe(24);
  });

  it('pointerdown очищает trail buffer от прошлого свайпа', () => {
    const scene = createMockScene();
    const sys = new InputSystem(scene as never);
    scene.fire('pointerdown', makePointer(0, 0));
    scene.fire('pointermove', makePointer(10, 0));
    scene.fire('pointermove', makePointer(20, 0));
    expect(sys.trail.size).toBe(3);
    // Новый свайп — буфер сброшен, осталась только первая точка.
    scene.fire('pointerdown', makePointer(100, 100));
    expect(sys.trail.size).toBe(1);
    expect(sys.trail.getPoints()[0].x).toBe(100);
  });

  it('pointermove без coalesced добавляет ровно одну точку (fallback)', () => {
    const scene = createMockScene();
    const sys = new InputSystem(scene as never);
    scene.fire('pointerdown', makePointer(0, 0));
    scene.fire('pointermove', makePointer(10, 0));
    expect(sys.trail.size).toBe(2); // 1 из pointerdown + 1 из pointermove
  });

  it('pointermove с coalesced добавляет все промежуточные точки', () => {
    const scene = createMockScene();
    const sys = new InputSystem(scene as never);
    scene.fire('pointerdown', makePointer(0, 0));
    const coalesced = [
      { clientX: 5, clientY: 0, timeStamp: 1 },
      { clientX: 10, clientY: 0, timeStamp: 2 },
      { clientX: 15, clientY: 0, timeStamp: 3 },
    ];
    scene.fire('pointermove', makePointer(20, 0, coalesced));
    // 1 (pointerdown) + 3 (coalesced) = 4.
    expect(sys.trail.size).toBe(4);
    const xs = sys.trail.getPoints().map((p) => p.x);
    expect(xs).toEqual([0, 5, 10, 15]);
  });

  it('coalesced координаты транслируются через scale.transformX/Y', () => {
    // scale в mock — identity, но проверяем что путь проходит без ошибок
    // и координаты попадают в buffer как есть.
    const scene = createMockScene();
    const sys = new InputSystem(scene as never);
    scene.fire('pointerdown', makePointer(0, 0));
    const coalesced = [
      { clientX: 100, clientY: 200, timeStamp: 1 },
    ];
    scene.fire('pointermove', makePointer(200, 300, coalesced));
    const points = sys.trail.getPoints();
    expect(points[1]).toEqual({ x: 100, y: 200, t: 1 });
  });

  it('pointermove инициирует отрисовку следа (strokePath)', () => {
    const scene = createMockScene();
    const sys = new InputSystem(scene as never);
    scene.fire('pointerdown', makePointer(0, 0));
    // pointermove с двумя точками → ≥1 сегмент → отрисовка.
    scene.fire('pointermove', makePointer(10, 0));
    expect(sys.trail.size).toBe(2); // 1 (down) + 1 (move) — обе точки в буфере
    expect(scene.state.drawCalls).toBe(1);
  });

  it('pointerup очищает trail buffer', () => {
    const scene = createMockScene();
    const sys = new InputSystem(scene as never);
    scene.fire('pointerdown', makePointer(0, 0));
    scene.fire('pointermove', makePointer(10, 0));
    expect(sys.trail.size).toBe(2);
    scene.fire('pointerup', makePointer(20, 0));
    expect(sys.trail.size).toBe(0);
  });

  it('pointercancel также очищает trail buffer (тот же handler)', () => {
    const scene = createMockScene();
    const sys = new InputSystem(scene as never);
    scene.fire('pointerdown', makePointer(0, 0));
    scene.fire('pointermove', makePointer(10, 0));
    scene.fire('pointercancel', makePointer(15, 0));
    expect(sys.trail.size).toBe(0);
  });

  it('ring buffer ограничивает число точек (maxTrailPoints)', () => {
    const scene = createMockScene();
    const sys = new InputSystem(scene as never, { maxTrailPoints: 3 });
    scene.fire('pointerdown', makePointer(0, 0));
    scene.fire('pointermove', makePointer(10, 0));
    scene.fire('pointermove', makePointer(20, 0));
    scene.fire('pointermove', makePointer(30, 0));
    scene.fire('pointermove', makePointer(40, 0));
    // maxSize=3 → только последние 3 точки.
    expect(sys.trail.size).toBe(3);
    expect(sys.trail.getPoints().map((p) => p.x)).toEqual([20, 30, 40]);
  });

  it('reset() сбрасывает audioUnlocked в false и очищает trail/graphics', () => {
    const scene = createMockScene();
    const sys = new InputSystem(scene as never);
    scene.fire('pointerdown', makePointer(0, 0));
    scene.fire('pointermove', makePointer(10, 0));
    expect(sys.audioUnlocked).toBe(true);
    expect(sys.trail.size).toBe(2);

    sys.reset();

    expect(sys.audioUnlocked).toBe(false);
    expect(sys.trail.size).toBe(0);
  });

  it('после reset первый pointerdown снова вызывает sound.unlock()', () => {
    const scene = createMockScene();
    const sys = new InputSystem(scene as never);
    scene.fire('pointerdown', makePointer(0, 0));
    expect(scene.state.soundUnlockCount).toBe(1);
    sys.reset();
    scene.fire('pointerdown', makePointer(0, 0));
    expect(scene.state.soundUnlockCount).toBe(2);
  });

  it('destroy() отписывается от всех pointer events и уничтожает graphics', () => {
    const scene = createMockScene();
    const sys = new InputSystem(scene as never);
    sys.destroy();
    expect(scene.handlerCount('pointerdown')).toBe(0);
    expect(scene.handlerCount('pointermove')).toBe(0);
    expect(scene.handlerCount('pointerup')).toBe(0);
    expect(scene.handlerCount('pointercancel')).toBe(0);
    expect(scene.state.graphicsDestroyed).toBe(true);
  });

  it('destroy() идемпотентен (повторный вызов не падает)', () => {
    const scene = createMockScene();
    const sys = new InputSystem(scene as never);
    sys.destroy();
    expect(() => sys.destroy()).not.toThrow();
  });

  it('после destroy события больше не меняют состояние', () => {
    const scene = createMockScene();
    const sys = new InputSystem(scene as never);
    sys.destroy();
    // handler'ов нет → fire ничего не вызовет.
    expect(() => scene.fire('pointerdown', makePointer(0, 0))).not.toThrow();
    expect(sys.trail.size).toBe(0);
    expect(sys.audioUnlocked).toBe(false);
  });

  it('CoalescedSource из pointer корректно работает с резолвером (интеграция)', () => {
    // Проверяем связку InputSystem → CoalescedResolver на «реальном» сценарии.
    const scene = createMockScene();
    const sys = new InputSystem(scene as never);
    scene.fire('pointerdown', makePointer(0, 0));
    // Имитируем 3 coalesced events между кадрами.
    scene.fire(
      'pointermove',
      makePointer(30, 0, [
        { clientX: 10, clientY: 0, timeStamp: 10 },
        { clientX: 20, clientY: 0, timeStamp: 20 },
        { clientX: 30, clientY: 0, timeStamp: 30 },
      ]),
    );
    const points = sys.trail.getPoints();
    expect(points.map((p) => ({ x: p.x, t: p.t }))).toEqual([
      { x: 0, t: expect.any(Number) },
      { x: 10, t: 10 },
      { x: 20, t: 20 },
      { x: 30, t: 30 },
    ]);
  });

  it('lastSegment доступен другим системам через trail (подготовка к фазе 3)', () => {
    const scene = createMockScene();
    const sys = new InputSystem(scene as never);
    scene.fire('pointerdown', makePointer(0, 0));
    scene.fire('pointermove', makePointer(10, 5));
    const last = sys.trail.getLastSegment();
    expect(last).not.toBeNull();
    expect(last!.from.x).toBe(0);
    expect(last!.to.x).toBe(10);
  });
});
