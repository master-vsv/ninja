import { describe, it, expect } from 'vitest';
import { BombSystem } from '../systems/BombSystem';
import { GameOverGate } from '../game/GameOverGate';
import { EventBus } from '../events/EventBus';
import { EVENT } from '../events/types';
import type { SliceEvent } from '../events/SliceEvent';
import { LifeState } from '../game/LifeState';

/**
 * Wiring-тесты BombSystem (фаза 4 — реальная логика).
 *
 * Контракт failstate трубы-бомбы (после изменения):
 *   - разрез трубы = взрыв FX (частицы + camera.shake) + lifeState.loseLife() (-1 жизнь);
 *   - game-over { reason: 'bomb' } эмитится ТОЛЬКО если после loseLife lives=0
 *     (через scene.time.delayedCall 850мс, чтобы дать проиграться взрыву);
 *   - GameOverGate.markGameOver идемпотентен — повторные эмитты подавляются.
 *
 * Цель: проверить тонкую Phaser-обёртку без реального Phaser.Game:
 *   - подписка на 'slice' через EventBus;
 *   - при SliceEvent(isBomb=true) с lifeState=1 → эмит 'game-over' { reason: 'bomb' };
 *   - при SliceEvent(isBomb=true) с lifeState>1 → жизнь отнимается, эвента НЕТ;
 *   - при SliceEvent(isBomb=false) → ничего не делает;
 *   - идемпотентность: повторный slice трубы НЕ порождает новый 'game-over'
 *     (gate блокирует);
 *   - FX (camera.shake / particles) вызывается, но не падает при их отсутствии;
 *   - destroy() отписывается;
 *   - reset() делегирует в GameOverGate.
 *
 * Тесты, проверяющие game-over эмит, передают lifeState: new LifeState(1),
 * чтобы один разрез трубы → lives 1→0 → gameOver → эмит. Тесты без game-over
 * проверки оставляют lifeState по умолчанию (3 жизни, loseLife → 2, эвента нет).
 *
 * Scene stub содержит минимальные cameras.main.shake / add.particles / make.graphics /
 * textures.exists / time.delayedCall — BombSystem вызывает их в try/catch.
 */

/** Состояние mock-сцены (счётчики вызовов FX). */
interface SceneState {
  shakeCount: number;
  particleEmitterCount: number;
}

/** Минимальный stub Phaser.Scene с camera/add/time/textures для BombSystem FX. */
function makeSceneStub(): { scene: unknown; state: SceneState } {
  const state: SceneState = { shakeCount: 0, particleEmitterCount: 0 };

  const emitter = {
    active: true,
    explode: () => {
      state.particleEmitterCount++;
    },
    destroy: () => {
      emitter.active = false;
    },
  };

  const graphicsStub = () => ({
    fillStyle: () => {},
    fillRect: () => {},
    fillCircle: () => {},
    lineStyle: () => {},
    strokeRect: () => {},
    strokeCircle: () => {},
    setDepth: () => {},
    destroy: () => {},
    x: 0,
    y: 0,
  });

  const scene = {
    cameras: {
      main: {
        shake: () => {
          state.shakeCount++;
        },
      },
    },
    add: {
      particles: () => emitter,
      graphics: graphicsStub,
    },
    make: {
      graphics: () => ({
        fillStyle: () => {},
        fillRect: () => {},
        generateTexture: () => {},
        destroy: () => {},
      }),
    },
    textures: {
      exists: () => false,
    },
    time: {
      delayedCall: (_ms: number, cb: () => void) => {
        // В тестах выполняем cb синхронно — BombSystem задерживает game-over emit
        // через delayedCall (850мс в проде), в тестах задержка не нужна.
        cb();
        return { remove: () => {} };
      },
    },
    tweens: {
      // Взрыв использует tweens для осколков/шара — в тестах сразу onComplete.
      add: (cfg: { onComplete?: () => void }) => {
        if (cfg.onComplete) cfg.onComplete();
      },
    },
  };

  return { scene, state };
}

/** Создаёт SliceEvent с минимумом нужных полей. */
function makeSliceEvent(
  bodyId: number,
  kind: SliceEvent['kind'],
  isBomb: boolean,
): SliceEvent {
  return {
    id: `test-${bodyId}`,
    timestamp: performance.now(),
    bodyId,
    kind,
    isBomb,
    slice: {
      from: { x: 50, y: 0 } as never,
      to: { x: 150, y: 0 } as never,
      angle: 0,
    },
    swordType: null,
    fragments: [],
  };
}

describe('BombSystem / конструктор', () => {
  it('по умолчанию bombHitCount=0', () => {
    const { scene } = makeSceneStub();
    const bus = new EventBus();
    const gate = new GameOverGate();
    const sys = new BombSystem(scene as never, {
      eventBus: bus,
      gameOverGate: gate,
    });
    expect(sys.bombHitCount).toBe(0);
  });

  it('пробрасывает getter gameOverGate', () => {
    const { scene } = makeSceneStub();
    const bus = new EventBus();
    const gate = new GameOverGate();
    const sys = new BombSystem(scene as never, {
      eventBus: bus,
      gameOverGate: gate,
    });
    expect(sys.gameOverGate).toBe(gate);
  });
});

describe('BombSystem / slice обычного объекта (isBomb=false)', () => {
  it('не делает ничего для isBomb=false', () => {
    const { scene, state } = makeSceneStub();
    const bus = new EventBus();
    const gate = new GameOverGate();
    const sys = new BombSystem(scene as never, {
      eventBus: bus,
      gameOverGate: gate,
    });

    bus.emit(EVENT.slice, makeSliceEvent(1, 'bolt', false));

    expect(sys.bombHitCount).toBe(0);
    expect(state.shakeCount).toBe(0);
    expect(state.particleEmitterCount).toBe(0);
  });
});

describe('BombSystem / slice трубы (isBomb=true)', () => {
  it('увеличивает bombHitCount', () => {
    const { scene } = makeSceneStub();
    const bus = new EventBus();
    const gate = new GameOverGate();
    const sys = new BombSystem(scene as never, {
      eventBus: bus,
      gameOverGate: gate,
    });

    bus.emit(EVENT.slice, makeSliceEvent(1, 'pipe', true));

    expect(sys.bombHitCount).toBe(1);
  });

  it('эмитит "game-over" { reason: "bomb" }', () => {
    const { scene } = makeSceneStub();
    const bus = new EventBus();
    const gate = new GameOverGate();
    // lifeState=1: разрез трубы → loseLife → lives=0 → gameOver → эмит.
    new BombSystem(scene as never, {
      eventBus: bus,
      gameOverGate: gate,
      lifeState: new LifeState(1),
    });

    const gameOvers: Array<{ reason: string }> = [];
    bus.on(EVENT.gameOver, (p) => gameOvers.push(p as { reason: string }));

    bus.emit(EVENT.slice, makeSliceEvent(1, 'pipe', true));

    expect(gameOvers.length).toBe(1);
    expect(gameOvers[0].reason).toBe('bomb');
  });

  it('bomb slice с lives>1 отнимает жизнь, но НЕ эмитит game-over', () => {
    const { scene } = makeSceneStub();
    const bus = new EventBus();
    const gate = new GameOverGate();
    // lifeState=3 (default): разрез трубы отнимает 1 жизнь (3→2),
    // но game-over НЕ наступает — игра продолжается.
    const lifeState = new LifeState(3);
    new BombSystem(scene as never, {
      eventBus: bus,
      gameOverGate: gate,
      lifeState,
    });

    const gameOvers: unknown[] = [];
    bus.on(EVENT.gameOver, (p) => gameOvers.push(p));

    bus.emit(EVENT.slice, makeSliceEvent(1, 'pipe', true));

    // Жизнь отнята, но game-over не эмитится — игра продолжается.
    expect(lifeState.lives).toBe(2);
    expect(lifeState.gameOver).toBe(false);
    expect(gameOvers.length).toBe(0);
    // Счётчик взрывов всё равно растёт.
    expect(gate.isGameOver).toBe(false);
  });

  it('вызывает camera.shake для FX взрыва', () => {
    const { scene, state } = makeSceneStub();
    const bus = new EventBus();
    const gate = new GameOverGate();
    new BombSystem(scene as never, { eventBus: bus, gameOverGate: gate });

    bus.emit(EVENT.slice, makeSliceEvent(1, 'pipe', true));

    expect(state.shakeCount).toBe(1);
  });
});

describe('BombSystem / идемпотентность через GameOverGate', () => {
  it('повторный slice трубы НЕ порождает второй game-over эмит', () => {
    const { scene } = makeSceneStub();
    const bus = new EventBus();
    const gate = new GameOverGate();
    // lifeState=1: первый slice → gameOver и эмит, дальнейшие — gate блокирует.
    new BombSystem(scene as never, {
      eventBus: bus,
      gameOverGate: gate,
      lifeState: new LifeState(1),
    });

    const gameOvers: unknown[] = [];
    bus.on(EVENT.gameOver, (p) => gameOvers.push(p));

    bus.emit(EVENT.slice, makeSliceEvent(1, 'pipe', true));
    bus.emit(EVENT.slice, makeSliceEvent(2, 'pipe', true));
    bus.emit(EVENT.slice, makeSliceEvent(3, 'pipe', true));

    expect(gameOvers.length).toBe(1);
  });

  it('game-over НЕ эмитится, если gate уже в game-over (симуляция конфликта с Life)', () => {
    const { scene } = makeSceneStub();
    const bus = new EventBus();
    const gate = new GameOverGate();
    // Эмулируем что LifeSystem уже перевела в game over (no-lives) — gate уже «сработал».
    gate.markGameOver('no-lives');
    new BombSystem(scene as never, { eventBus: bus, gameOverGate: gate });

    const gameOvers: unknown[] = [];
    bus.on(EVENT.gameOver, (p) => gameOvers.push(p));

    bus.emit(EVENT.slice, makeSliceEvent(1, 'pipe', true));

    expect(gameOvers.length).toBe(0);
  });
});

describe('BombSystem / reset', () => {
  it('reset делегирует в GameOverGate', () => {
    const { scene } = makeSceneStub();
    const bus = new EventBus();
    const gate = new GameOverGate();
    // lifeState=1: slice → loseLife → gameOver → gate.markGameOver сработает.
    const sys = new BombSystem(scene as never, {
      eventBus: bus,
      gameOverGate: gate,
      lifeState: new LifeState(1),
    });

    bus.emit(EVENT.slice, makeSliceEvent(1, 'pipe', true));
    expect(gate.isGameOver).toBe(true);

    sys.reset();

    expect(gate.isGameOver).toBe(false);
  });

  it('после reset slice трубы снова эмитит game-over', () => {
    const { scene } = makeSceneStub();
    const bus = new EventBus();
    const gate = new GameOverGate();
    // lifeState=1: каждый slice → gameOver → эмит (если gate сброшен).
    const sys = new BombSystem(scene as never, {
      eventBus: bus,
      gameOverGate: gate,
      lifeState: new LifeState(1),
    });

    const gameOvers: unknown[] = [];
    bus.on(EVENT.gameOver, (p) => gameOvers.push(p));

    bus.emit(EVENT.slice, makeSliceEvent(1, 'pipe', true));
    expect(gameOvers.length).toBe(1);

    sys.reset();

    bus.emit(EVENT.slice, makeSliceEvent(2, 'pipe', true));
    expect(gameOvers.length).toBe(2);
  });
});

describe('BombSystem / destroy', () => {
  it('destroy отписывается — slice не вызывает эмитов', () => {
    const { scene } = makeSceneStub();
    const bus = new EventBus();
    const gate = new GameOverGate();
    const sys = new BombSystem(scene as never, {
      eventBus: bus,
      gameOverGate: gate,
    });
    const gameOvers: unknown[] = [];
    bus.on(EVENT.gameOver, (p) => gameOvers.push(p));

    sys.destroy();

    bus.emit(EVENT.slice, makeSliceEvent(1, 'pipe', true));
    expect(gameOvers.length).toBe(0);
  });

  it('destroy идемпотентен', () => {
    const { scene } = makeSceneStub();
    const bus = new EventBus();
    const gate = new GameOverGate();
    const sys = new BombSystem(scene as never, {
      eventBus: bus,
      gameOverGate: gate,
    });
    expect(() => {
      sys.destroy();
      sys.destroy();
    }).not.toThrow();
  });
});

describe('BombSystem / устойчивость FX к отсутствию scene-методов', () => {
  it('camera.shake бросает → BombSystem не падает, game-over всё равно эмитится', () => {
    const scene = {
      cameras: {
        main: {
          shake: () => {
            throw new Error('test: camera missing');
          },
        },
      },
      add: {
        particles: () => ({ active: true, explode: () => {}, destroy: () => {} }),
        graphics: () => ({
          fillStyle: () => {}, fillRect: () => {}, fillCircle: () => {}, lineStyle: () => {},
          strokeRect: () => {}, strokeCircle: () => {}, setDepth: () => {}, destroy: () => {}, x: 0, y: 0,
        }),
      },
      make: {
        graphics: () => ({
          fillStyle: () => {},
          fillRect: () => {},
          generateTexture: () => {},
          destroy: () => {},
        }),
      },
      textures: { exists: () => false },
      time: { delayedCall: (_ms: number, cb: () => void) => { cb(); return { remove: () => {} }; } },
      tweens: { add: (cfg: { onComplete?: () => void }) => { if (cfg.onComplete) cfg.onComplete(); } },
    };
    const bus = new EventBus();
    const gate = new GameOverGate();
    // lifeState=1: slice → gameOver → эмит (несмотря на throw в camera.shake).
    new BombSystem(scene as never, {
      eventBus: bus,
      gameOverGate: gate,
      lifeState: new LifeState(1),
    });

    const gameOvers: unknown[] = [];
    bus.on(EVENT.gameOver, (p) => gameOvers.push(p));

    expect(() => bus.emit(EVENT.slice, makeSliceEvent(1, 'pipe', true))).not.toThrow();
    expect(gameOvers.length).toBe(1);
  });
});
