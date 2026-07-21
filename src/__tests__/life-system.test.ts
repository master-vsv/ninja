import { describe, it, expect } from 'vitest';
import { LifeSystem } from '../systems/LifeSystem';
import { LifeState } from '../game/LifeState';
import { GameOverGate } from '../game/GameOverGate';
import { PowerUpState } from '../game/PowerUpState';
import { EventBus } from '../events/EventBus';
import { EVENT } from '../events/types';
import type { MissEvent } from '../events/MissEvent';

/**
 * Wiring-тесты LifeSystem (фаза 4).
 *
 * Цель: проверить тонкую Phaser-обёртку без реального Phaser.Game:
 *   - подписка на 'miss' через EventBus в конструкторе;
 *   - при MissEvent(isBomb=true) → lives НЕ меняется;
 *   - при MissEvent(isBomb=false) → lives-1 через LifeState;
 *   - при gameOver (lives=0) → эмит 'game-over' через EventBus,
 *     только если GameOverGate.mark вернул true;
 *   - идемпотентность: повторный emit 'miss' после gameOver НЕ порождает
 *     новых 'game-over' эмитов (gate блокирует);
 *   - destroy() отписывается от 'miss';
 *   - reset() делегирует в LifeState и GameOverGate.
 *
 * Scene в LifeSystem не используется напрямую — передаём unknown-кастиленный stub.
 */

/** Минимальный stub Phaser.Scene (LifeSystem его не использует в runtime). */
function makeSceneStub(): unknown {
  return { sys: { events: { on: () => {}, off: () => {} } } };
}

/** Эмитит MissEvent в шину. */
function emitMiss(bus: EventBus, ev: MissEvent): void {
  bus.emit(EVENT.miss, ev);
}

describe('LifeSystem / конструктор и подписка', () => {
  it('в конструкторе подписывается на EventBus.miss', () => {
    const bus = new EventBus();
    let missCount = 0;
    bus.on(EVENT.miss, () => missCount++);
    const lifeState = new LifeState();
    const gate = new GameOverGate();
    const sys = new LifeSystem(makeSceneStub() as never, {
      eventBus: bus,
      lifeState,
      gameOverGate: gate,
    });
    void sys;
    // Подписка LifeSystem ловит событие — но наш внешний счётчик тоже должен расти,
    // это подтверждает что событие вообще прошло.
    emitMiss(bus, { bodyId: 1, kind: 'bolt', isBomb: false });
    expect(missCount).toBe(1);
  });

  it('по умолчанию использует shared state из options (DI)', () => {
    const bus = new EventBus();
    const lifeState = new LifeState();
    const gate = new GameOverGate();
    const sys = new LifeSystem(makeSceneStub() as never, {
      eventBus: bus,
      lifeState,
      gameOverGate: gate,
    });
    expect(sys.lives).toBe(3);
    expect(sys.gameOver).toBe(false);
  });
});

describe('LifeSystem / обработка MissEvent', () => {
  it('труба упущена (isBomb=true) → lives не меняется', () => {
    const bus = new EventBus();
    const lifeState = new LifeState();
    const gate = new GameOverGate();
    const sys = new LifeSystem(makeSceneStub() as never, {
      eventBus: bus,
      lifeState,
      gameOverGate: gate,
    });
    emitMiss(bus, { bodyId: 1, kind: 'pipe', isBomb: true });
    expect(sys.lives).toBe(3);
    expect(sys.gameOver).toBe(false);
  });

  it('обычный объект упущен → lives-1', () => {
    const bus = new EventBus();
    const lifeState = new LifeState();
    const gate = new GameOverGate();
    const sys = new LifeSystem(makeSceneStub() as never, {
      eventBus: bus,
      lifeState,
      gameOverGate: gate,
    });
    emitMiss(bus, { bodyId: 1, kind: 'bolt', isBomb: false });
    expect(sys.lives).toBe(2);
  });

  it('3 промаха → lives=0 + gameOver', () => {
    const bus = new EventBus();
    const lifeState = new LifeState();
    const gate = new GameOverGate();
    const sys = new LifeSystem(makeSceneStub() as never, {
      eventBus: bus,
      lifeState,
      gameOverGate: gate,
    });
    emitMiss(bus, { bodyId: 1, kind: 'bolt', isBomb: false });
    emitMiss(bus, { bodyId: 2, kind: 'nut', isBomb: false });
    emitMiss(bus, { bodyId: 3, kind: 'ruler', isBomb: false });
    expect(sys.lives).toBe(0);
    expect(sys.gameOver).toBe(true);
  });
});

describe('LifeSystem / эмит game-over', () => {
  it('при lives=0 эмитит "game-over" { reason: "no-lives" }', () => {
    const bus = new EventBus();
    const lifeState = new LifeState();
    const gate = new GameOverGate();
    const sys = new LifeSystem(makeSceneStub() as never, {
      eventBus: bus,
      lifeState,
      gameOverGate: gate,
    });
    void sys;
    const gameOvers: Array<{ reason: string }> = [];
    bus.on(EVENT.gameOver, (p) => gameOvers.push(p as { reason: string }));

    emitMiss(bus, { bodyId: 1, kind: 'bolt', isBomb: false });
    emitMiss(bus, { bodyId: 2, kind: 'nut', isBomb: false });
    emitMiss(bus, { bodyId: 3, kind: 'ruler', isBomb: false });

    expect(gameOvers.length).toBe(1);
    expect(gameOvers[0].reason).toBe('no-lives');
  });

  it('НЕ эмитит game-over, пока lives > 0', () => {
    const bus = new EventBus();
    const lifeState = new LifeState();
    const gate = new GameOverGate();
    new LifeSystem(makeSceneStub() as never, {
      eventBus: bus,
      lifeState,
      gameOverGate: gate,
    });
    const gameOvers: unknown[] = [];
    bus.on(EVENT.gameOver, (p) => gameOvers.push(p));

    emitMiss(bus, { bodyId: 1, kind: 'bolt', isBomb: false });
    emitMiss(bus, { bodyId: 2, kind: 'nut', isBomb: false });

    expect(gameOvers.length).toBe(0);
  });

  it('труба НЕ эмитит game-over даже при lives=1', () => {
    const bus = new EventBus();
    const lifeState = new LifeState(1);
    const gate = new GameOverGate();
    new LifeSystem(makeSceneStub() as never, {
      eventBus: bus,
      lifeState,
      gameOverGate: gate,
    });
    const gameOvers: unknown[] = [];
    bus.on(EVENT.gameOver, (p) => gameOvers.push(p));

    emitMiss(bus, { bodyId: 1, kind: 'pipe', isBomb: true });

    expect(gameOvers.length).toBe(0);
  });
});

describe('LifeSystem / идемпотентность через GameOverGate', () => {
  it('после gameOver последующие miss НЕ порождают новых game-over эмитов', () => {
    const bus = new EventBus();
    const lifeState = new LifeState();
    const gate = new GameOverGate();
    new LifeSystem(makeSceneStub() as never, {
      eventBus: bus,
      lifeState,
      gameOverGate: gate,
    });
    const gameOvers: unknown[] = [];
    bus.on(EVENT.gameOver, (p) => gameOvers.push(p));

    // 3 промаха → game over.
    emitMiss(bus, { bodyId: 1, kind: 'bolt', isBomb: false });
    emitMiss(bus, { bodyId: 2, kind: 'nut', isBomb: false });
    emitMiss(bus, { bodyId: 3, kind: 'ruler', isBomb: false });
    expect(gameOvers.length).toBe(1);

    // Дополнительные промахи не должны породить новые эмиты (gate блокирует).
    emitMiss(bus, { bodyId: 4, kind: 'standard', isBomb: false });
    emitMiss(bus, { bodyId: 5, kind: 'bolt', isBomb: false });
    expect(gameOvers.length).toBe(1);
  });
});

describe('LifeSystem / reset', () => {
  it('reset делегирует в LifeState и GameOverGate', () => {
    const bus = new EventBus();
    const lifeState = new LifeState();
    const gate = new GameOverGate();
    const sys = new LifeSystem(makeSceneStub() as never, {
      eventBus: bus,
      lifeState,
      gameOverGate: gate,
    });
    emitMiss(bus, { bodyId: 1, kind: 'bolt', isBomb: false });
    emitMiss(bus, { bodyId: 2, kind: 'nut', isBomb: false });
    emitMiss(bus, { bodyId: 3, kind: 'ruler', isBomb: false });
    expect(sys.gameOver).toBe(true);

    sys.reset();

    expect(sys.lives).toBe(3);
    expect(sys.gameOver).toBe(false);
  });

  it('после reset новый промах снова может привести к game over', () => {
    const bus = new EventBus();
    const lifeState = new LifeState();
    const gate = new GameOverGate();
    const sys = new LifeSystem(makeSceneStub() as never, {
      eventBus: bus,
      lifeState,
      gameOverGate: gate,
    });
    const gameOvers: unknown[] = [];
    bus.on(EVENT.gameOver, (p) => gameOvers.push(p));

    // Первый game-over.
    emitMiss(bus, { bodyId: 1, kind: 'bolt', isBomb: false });
    emitMiss(bus, { bodyId: 2, kind: 'nut', isBomb: false });
    emitMiss(bus, { bodyId: 3, kind: 'ruler', isBomb: false });
    expect(gameOvers.length).toBe(1);

    sys.reset();

    // После reset новый game-over снова эмитится.
    emitMiss(bus, { bodyId: 4, kind: 'bolt', isBomb: false });
    emitMiss(bus, { bodyId: 5, kind: 'nut', isBomb: false });
    emitMiss(bus, { bodyId: 6, kind: 'ruler', isBomb: false });
    expect(gameOvers.length).toBe(2);
  });
});

describe('LifeSystem / destroy', () => {
  it('destroy отписывается от miss — последующие эвенты не меняют состояние', () => {
    const bus = new EventBus();
    const lifeState = new LifeState();
    const gate = new GameOverGate();
    const sys = new LifeSystem(makeSceneStub() as never, {
      eventBus: bus,
      lifeState,
      gameOverGate: gate,
    });
    sys.destroy();

    emitMiss(bus, { bodyId: 1, kind: 'bolt', isBomb: false });

    expect(sys.lives).toBe(3);
  });

  it('destroy идемпотентен (повторный вызов не падает)', () => {
    const bus = new EventBus();
    const lifeState = new LifeState();
    const gate = new GameOverGate();
    const sys = new LifeSystem(makeSceneStub() as never, {
      eventBus: bus,
      lifeState,
      gameOverGate: gate,
    });
    expect(() => {
      sys.destroy();
      sys.destroy();
    }).not.toThrow();
  });
});

describe('LifeSystem / проброс getters', () => {
  it('lives и gameOver отражают shared LifeState', () => {
    const bus = new EventBus();
    const lifeState = new LifeState(2);
    const gate = new GameOverGate();
    const sys = new LifeSystem(makeSceneStub() as never, {
      eventBus: bus,
      lifeState,
      gameOverGate: gate,
    });
    expect(sys.lives).toBe(2);
    expect(sys.gameOver).toBe(false);
    expect(sys.lifeState).toBe(lifeState);
    expect(sys.gameOverGate).toBe(gate);
  });
});

/**
 * Shield-интеграция: при активном shield-эффекте (каска) упущенные объекты
 * не отнимают жизни — LifeSystem пропускает applyMiss (как для трубы isBomb=true).
 *
 * PowerUpState передаётся через getPowerUpState (pull-модель, по образцу
 * SpawnDirector). Если shield не активен — поведение как раньше.
 */
describe('LifeSystem / shield (временная неуязвимость)', () => {
  it('без PowerUpState поведение как раньше (lives-1 на промах)', () => {
    const bus = new EventBus();
    const lifeState = new LifeState();
    const gate = new GameOverGate();
    const sys = new LifeSystem(makeSceneStub() as never, {
      eventBus: bus,
      lifeState,
      gameOverGate: gate,
    });
    emitMiss(bus, { bodyId: 1, kind: 'bolt', isBomb: false });
    expect(sys.lives).toBe(2);
  });

  it('shield активен → промах НЕ отнимает жизнь', () => {
    const bus = new EventBus();
    const lifeState = new LifeState();
    const gate = new GameOverGate();
    const powerUpState = new PowerUpState();
    powerUpState.activate('shield', 5000);
    new LifeSystem(makeSceneStub() as never, {
      eventBus: bus,
      lifeState,
      gameOverGate: gate,
      getPowerUpState: () => powerUpState,
    });
    emitMiss(bus, { bodyId: 1, kind: 'bolt', isBomb: false });
    expect(lifeState.lives).toBe(3);
  });

  it('shield активен → несколько промахов подряд НЕ отнимают жизни', () => {
    const bus = new EventBus();
    const lifeState = new LifeState();
    const gate = new GameOverGate();
    const powerUpState = new PowerUpState();
    powerUpState.activate('shield', 5000);
    new LifeSystem(makeSceneStub() as never, {
      eventBus: bus,
      lifeState,
      gameOverGate: gate,
      getPowerUpState: () => powerUpState,
    });
    emitMiss(bus, { bodyId: 1, kind: 'bolt', isBomb: false });
    emitMiss(bus, { bodyId: 2, kind: 'nut', isBomb: false });
    emitMiss(bus, { bodyId: 3, kind: 'ruler', isBomb: false });
    expect(lifeState.lives).toBe(3);
    expect(lifeState.gameOver).toBe(false);
  });

  it('shield НЕ активен (PowerUpState есть, но shield=false) → lives-1', () => {
    const bus = new EventBus();
    const lifeState = new LifeState();
    const gate = new GameOverGate();
    const powerUpState = new PowerUpState();
    // Активируем grow — это НЕ shield, промах штрафуется как обычно.
    powerUpState.activate('grow', 5000);
    new LifeSystem(makeSceneStub() as never, {
      eventBus: bus,
      lifeState,
      gameOverGate: gate,
      getPowerUpState: () => powerUpState,
    });
    emitMiss(bus, { bodyId: 1, kind: 'bolt', isBomb: false });
    expect(lifeState.lives).toBe(2);
  });

  it('shield истёк → промах снова отнимает жизнь', () => {
    const bus = new EventBus();
    const lifeState = new LifeState();
    const gate = new GameOverGate();
    const powerUpState = new PowerUpState();
    powerUpState.activate('shield', 500);
    const sys = new LifeSystem(makeSceneStub() as never, {
      eventBus: bus,
      lifeState,
      gameOverGate: gate,
      getPowerUpState: () => powerUpState,
    });
    void sys;

    // Пока shield активен — промах бесплатный.
    emitMiss(bus, { bodyId: 1, kind: 'bolt', isBomb: false });
    expect(lifeState.lives).toBe(3);

    // Истекаем shield.
    powerUpState.update(500);
    expect(powerUpState.isShielded).toBe(false);

    // После истечения — снова штраф.
    emitMiss(bus, { bodyId: 2, kind: 'nut', isBomb: false });
    expect(lifeState.lives).toBe(2);
  });

  it('shield НЕ эмитит game-over даже при lives=1', () => {
    const bus = new EventBus();
    const lifeState = new LifeState(1);
    const gate = new GameOverGate();
    const powerUpState = new PowerUpState();
    powerUpState.activate('shield', 5000);
    new LifeSystem(makeSceneStub() as never, {
      eventBus: bus,
      lifeState,
      gameOverGate: gate,
      getPowerUpState: () => powerUpState,
    });
    const gameOvers: unknown[] = [];
    bus.on(EVENT.gameOver, (p) => gameOvers.push(p));

    emitMiss(bus, { bodyId: 1, kind: 'bolt', isBomb: false });
    expect(lifeState.lives).toBe(1);
    expect(gameOvers.length).toBe(0);
  });

  it('труба (isBomb) и shield — оба не отнимают жизни (комбинированный случай)', () => {
    const bus = new EventBus();
    const lifeState = new LifeState();
    const gate = new GameOverGate();
    const powerUpState = new PowerUpState();
    powerUpState.activate('shield', 5000);
    new LifeSystem(makeSceneStub() as never, {
      eventBus: bus,
      lifeState,
      gameOverGate: gate,
      getPowerUpState: () => powerUpState,
    });
    emitMiss(bus, { bodyId: 1, kind: 'pipe', isBomb: true });
    emitMiss(bus, { bodyId: 2, kind: 'bolt', isBomb: false });
    expect(lifeState.lives).toBe(3);
  });
});
