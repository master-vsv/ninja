import { describe, it, expect } from 'vitest';
import { ScoreSystem } from '../systems/ScoreSystem';
import { ScoreState, POINTS_PER_KIND } from '../game/ScoreState';
import { ComboState } from '../game/ComboState';
import { LifeState, MAX_LIVES } from '../game/LifeState';
import { EventBus } from '../events/EventBus';
import { EVENT } from '../events/types';
import type { SliceEvent } from '../events/SliceEvent';

/**
 * Wiring-тесты ScoreSystem (фаза 4 + расширение фазы 6 — комбо).
 *
 * Цель: проверить тонкую Phaser-обёртку без реального Phaser.Game:
 *   - подписка на 'slice' через EventBus;
 *   - при SliceEvent добавляет очки через ScoreState (POINTS_PER_KIND);
 *   - труба (isBomb=true) → очков не приносит, combo НЕ регистрируется;
 *   - фаза 6: множитель комбо из ComboState применяется к очкам серии;
 *   - destroy() отписывается;
 *   - reset() делегирует в ScoreState и ComboState.
 *
 * Scene в ScoreSystem не используется напрямую.
 *
 * По умолчанию makeSliceEvent использует timestamp=0 — все slice «одномоментны»,
 * поэтому combo нарастает и множитель ×1/×2/×3 применяется. Для проверки
 * базового счёта без комбо используйте makeSliceEventAt с большим шагом
 * timestamp (> COMBO_WINDOW_MS) — combo будет всегда ×1.
 */

/** Минимальный stub Phaser.Scene. */
function makeSceneStub(): unknown {
  return { sys: { events: { on: () => {}, off: () => {} } } };
}

/**
 * Создаёт SliceEvent с явно заданным timestamp (для контроля combo-окна).
 * Все события с одним timestamp → combo нарастает; с большим шагом → combo ×1.
 */
function makeSliceEventAt(
  bodyId: number,
  kind: SliceEvent['kind'],
  isBomb: boolean,
  timestamp: number,
): SliceEvent {
  return {
    id: `test-${bodyId}`,
    timestamp,
    bodyId,
    kind,
    isBomb,
    slice: {
      from: { x: 0, y: 0 } as never,
      to: { x: 100, y: 0 } as never,
      angle: 0,
    },
    swordType: null,
    fragments: [],
  };
}

/** Создаёт SliceEvent с минимумом нужных полей (timestamp = 0, combo-окно активно). */
function makeSliceEvent(
  bodyId: number,
  kind: SliceEvent['kind'],
  isBomb: boolean,
): SliceEvent {
  return makeSliceEventAt(bodyId, kind, isBomb, 0);
}

describe('ScoreSystem / конструктор', () => {
  it('по умолчанию счёт=0', () => {
    const bus = new EventBus();
    const scoreState = new ScoreState();
    const sys = new ScoreSystem(makeSceneStub() as never, {
      eventBus: bus,
      scoreState,
    });
    expect(sys.score).toBe(0);
  });

  it('пробрасывает getter scoreState', () => {
    const bus = new EventBus();
    const scoreState = new ScoreState();
    const sys = new ScoreSystem(makeSceneStub() as never, {
      eventBus: bus,
      scoreState,
    });
    expect(sys.scoreState).toBe(scoreState);
  });
});

describe('ScoreSystem / обработка SliceEvent', () => {
  it('разрез bolt → +10 очков', () => {
    const bus = new EventBus();
    const scoreState = new ScoreState();
    const sys = new ScoreSystem(makeSceneStub() as never, {
      eventBus: bus,
      scoreState,
    });
    bus.emit(EVENT.slice, makeSliceEvent(1, 'bolt', false));
    expect(sys.score).toBe(POINTS_PER_KIND.bolt);
    expect(sys.score).toBe(10);
  });

  it('разрез nut → +15', () => {
    const bus = new EventBus();
    const scoreState = new ScoreState();
    const sys = new ScoreSystem(makeSceneStub() as never, {
      eventBus: bus,
      scoreState,
    });
    bus.emit(EVENT.slice, makeSliceEvent(1, 'nut', false));
    expect(sys.score).toBe(15);
  });

  it('разрез ruler → +20', () => {
    const bus = new EventBus();
    const scoreState = new ScoreState();
    const sys = new ScoreSystem(makeSceneStub() as never, {
      eventBus: bus,
      scoreState,
    });
    bus.emit(EVENT.slice, makeSliceEvent(1, 'ruler', false));
    expect(sys.score).toBe(20);
  });

  it('разрез standard → +25', () => {
    const bus = new EventBus();
    const scoreState = new ScoreState();
    const sys = new ScoreSystem(makeSceneStub() as never, {
      eventBus: bus,
      scoreState,
    });
    bus.emit(EVENT.slice, makeSliceEvent(1, 'standard', false));
    expect(sys.score).toBe(25);
  });

  it('труба (isBomb=true) → +0 очков', () => {
    const bus = new EventBus();
    const scoreState = new ScoreState();
    const sys = new ScoreSystem(makeSceneStub() as never, {
      eventBus: bus,
      scoreState,
    });
    bus.emit(EVENT.slice, makeSliceEvent(1, 'pipe', true));
    expect(sys.score).toBe(0);
  });

  it('несколько разрезов суммируются', () => {
    // Фаза 6: slice идут подряд (одномоментно, timestamp=0), поэтому
    // combo нарастает и множитель ×1/×2/×2/×3 применяется:
    //   bolt(combo=1,×1)=10 + nut(combo=2,×2)=30 + ruler(combo=3,×2)=40
    //   + standard(combo=4,×3)=75 = 155.
    const bus = new EventBus();
    const scoreState = new ScoreState();
    const sys = new ScoreSystem(makeSceneStub() as never, {
      eventBus: bus,
      scoreState,
    });
    bus.emit(EVENT.slice, makeSliceEvent(1, 'bolt', false));
    bus.emit(EVENT.slice, makeSliceEvent(2, 'nut', false));
    bus.emit(EVENT.slice, makeSliceEvent(3, 'ruler', false));
    bus.emit(EVENT.slice, makeSliceEvent(4, 'standard', false));
    expect(sys.score).toBe(10 + 15 * 2 + 20 * 2 + 25 * 3);
    expect(sys.score).toBe(155);
  });

  it('труба между обычными разрезами не влияет на сумму (combo продолжает серию)', () => {
    // Труба (isBomb) НЕ регистрируется в combo и не приносит очков,
    // но и НЕ обрывает серию — следующий slice продолжает combo:
    //   bolt(combo=1,×1)=10 + pipe(+0) + nut(combo=2,×2)=30 = 40.
    const bus = new EventBus();
    const scoreState = new ScoreState();
    const sys = new ScoreSystem(makeSceneStub() as never, {
      eventBus: bus,
      scoreState,
    });
    bus.emit(EVENT.slice, makeSliceEvent(1, 'bolt', false)); // 10
    bus.emit(EVENT.slice, makeSliceEvent(2, 'pipe', true)); // 0
    bus.emit(EVENT.slice, makeSliceEvent(3, 'nut', false)); // 30 (×2)
    expect(sys.score).toBe(40);
  });
});

describe('ScoreSystem / reset', () => {
  it('reset обнуляет счёт (и combo)', () => {
    // Фаза 6: 2×standard подряд → combo=2 ×2: 25 + 50 = 75.
    const bus = new EventBus();
    const scoreState = new ScoreState();
    const sys = new ScoreSystem(makeSceneStub() as never, {
      eventBus: bus,
      scoreState,
    });
    bus.emit(EVENT.slice, makeSliceEvent(1, 'standard', false));
    bus.emit(EVENT.slice, makeSliceEvent(2, 'standard', false));
    expect(sys.score).toBe(25 + 50);
    expect(sys.score).toBe(75);

    sys.reset();

    expect(sys.score).toBe(0);
    expect(sys.comboState.getCombo()).toBe(0);
  });
});

describe('ScoreSystem / destroy', () => {
  it('destroy отписывается — события не меняют счёт', () => {
    const bus = new EventBus();
    const scoreState = new ScoreState();
    const sys = new ScoreSystem(makeSceneStub() as never, {
      eventBus: bus,
      scoreState,
    });
    sys.destroy();

    bus.emit(EVENT.slice, makeSliceEvent(1, 'bolt', false));

    expect(sys.score).toBe(0);
  });

  it('destroy идемпотентен', () => {
    const bus = new EventBus();
    const scoreState = new ScoreState();
    const sys = new ScoreSystem(makeSceneStub() as never, {
      eventBus: bus,
      scoreState,
    });
    expect(() => {
      sys.destroy();
      sys.destroy();
    }).not.toThrow();
  });
});

/**
 * Фаза 6: тесты интеграции ScoreSystem с ComboState.
 *
 * Проверяют:
 *   - проброс getter comboState;
 *   - при big-timestamp шагах (> COMBO_WINDOW_MS) combo сбрасывается → ×1;
 *   - при подряд идущих slice множитель нарастает;
 *   - update(nowMs) сбрасывает combo при истечении окна;
 *   - reset() сбрасывает combo.
 */
describe('ScoreSystem / фаза 6 — комбо-интеграция', () => {
  it('пробрасывает getter comboState (shared снаружи)', () => {
    const bus = new EventBus();
    const comboState = new ComboState();
    const sys = new ScoreSystem(makeSceneStub() as never, {
      eventBus: bus,
      comboState,
    });
    expect(sys.comboState).toBe(comboState);
  });

  it('slice вне окна комбо (> COMBO_WINDOW_MS) → всегда ×1 (базовый счёт)', () => {
    // Большие шаги timestamp → каждый slice начинает новую серию, combo=1, ×1.
    const bus = new EventBus();
    const sys = new ScoreSystem(makeSceneStub() as never, { eventBus: bus });
    bus.emit(EVENT.slice, makeSliceEventAt(1, 'bolt', false, 0));
    bus.emit(EVENT.slice, makeSliceEventAt(2, 'nut', false, 5000));
    bus.emit(EVENT.slice, makeSliceEventAt(3, 'ruler', false, 10000));
    bus.emit(EVENT.slice, makeSliceEventAt(4, 'standard', false, 15000));
    expect(sys.score).toBe(10 + 15 + 20 + 25);
    expect(sys.score).toBe(70);
    expect(sys.comboState.getCombo()).toBe(1);
  });

  it('4 slice подряд → combo=4, последний slice с множителем ×3', () => {
    const bus = new EventBus();
    const sys = new ScoreSystem(makeSceneStub() as never, { eventBus: bus });
    // 4 slice одномоментно (timestamp=0): combo нарастает 1→2→3→4.
    bus.emit(EVENT.slice, makeSliceEvent(1, 'standard', false)); // ×1 → 25
    bus.emit(EVENT.slice, makeSliceEvent(2, 'standard', false)); // ×2 → 50
    bus.emit(EVENT.slice, makeSliceEvent(3, 'standard', false)); // ×2 → 50
    bus.emit(EVENT.slice, makeSliceEvent(4, 'standard', false)); // ×3 → 75
    expect(sys.comboState.getCombo()).toBe(4);
    expect(sys.comboState.getMultiplier()).toBe(3);
    expect(sys.score).toBe(25 + 50 + 50 + 75);
    expect(sys.score).toBe(200);
  });

  it('7+ slice подряд → максимальный множитель ×4', () => {
    const bus = new EventBus();
    const sys = new ScoreSystem(makeSceneStub() as never, { eventBus: bus });
    for (let i = 0; i < 7; i++) {
      bus.emit(EVENT.slice, makeSliceEvent(i + 1, 'bolt', false));
    }
    expect(sys.comboState.getCombo()).toBe(7);
    expect(sys.comboState.getMultiplier()).toBe(4);
    // bolt=10, серия: ×1 + ×2 + ×2 + ×3 + ×3 + ×3 + ×4 = 10+20+20+30+30+30+40 = 180.
    expect(sys.score).toBe(180);
  });

  it('update(nowMs) сбрасывает combo при истечении окна', () => {
    const bus = new EventBus();
    const sys = new ScoreSystem(makeSceneStub() as never, { eventBus: bus });
    bus.emit(EVENT.slice, makeSliceEvent(1, 'bolt', false)); // combo=1
    bus.emit(EVENT.slice, makeSliceEvent(2, 'nut', false)); // combo=2
    expect(sys.comboState.getCombo()).toBe(2);
    // Тикаем время за пределы COMBO_WINDOW_MS (1000 мс).
    sys.update(2000);
    expect(sys.comboState.getCombo()).toBe(0);
  });

  it('reset() сбрасывает и счёт, и combo', () => {
    const bus = new EventBus();
    const sys = new ScoreSystem(makeSceneStub() as never, { eventBus: bus });
    bus.emit(EVENT.slice, makeSliceEvent(1, 'standard', false));
    bus.emit(EVENT.slice, makeSliceEvent(2, 'standard', false));
    expect(sys.comboState.getCombo()).toBe(2);
    sys.reset();
    expect(sys.score).toBe(0);
    expect(sys.comboState.getCombo()).toBe(0);
  });

  it('труба не увеличивает combo (серия продолжается только через режимый slice)', () => {
    const bus = new EventBus();
    const sys = new ScoreSystem(makeSceneStub() as never, { eventBus: bus });
    bus.emit(EVENT.slice, makeSliceEvent(1, 'bolt', false)); // combo=1
    bus.emit(EVENT.slice, makeSliceEvent(2, 'pipe', true)); // +0, combo не трогает
    bus.emit(EVENT.slice, makeSliceEvent(3, 'nut', false)); // combo=2 (продолжает серию)
    expect(sys.comboState.getCombo()).toBe(2);
  });
});

/**
 * Тесты фичи «комбо увеличивает здоровье» — интеграция ScoreSystem + LifeState.
 *
 * Контракт: при достижении комбо, кратного 5 (×5, ×10, ×15...), ScoreSystem
 * вызывает lifeState.gainLife(1). Жизни clamp на MAX_LIVES=3. Звук 'extra-life'
 * играет только при gained>0 (здесь проверяем только логику жизней — аудио в
 * try/catch и не тестируется).
 *
 * Все slice идут с одним timestamp (combo нарастает), bolt=10 очков.
 */
describe('ScoreSystem / фича — комбо → +жизнь', () => {
  it('без lifeState фича отключена: combo растёт, но вызов не падает', () => {
    // Обратная совместимость: ScoreSystem без lifeState работает как раньше.
    const bus = new EventBus();
    const sys = new ScoreSystem(makeSceneStub() as never, { eventBus: bus });
    for (let i = 0; i < 5; i++) {
      bus.emit(EVENT.slice, makeSliceEvent(i + 1, 'bolt', false));
    }
    expect(sys.comboState.getCombo()).toBe(5);
    expect(() => sys.comboState.getCombo()).not.toThrow();
  });

  it('5 slice подряд (combo=5) → +1 жизнь (2→3), если была потеря', () => {
    const bus = new EventBus();
    const lifeState = new LifeState(2); // намеренно меньше MAX_LIVES
    const sys = new ScoreSystem(makeSceneStub() as never, {
      eventBus: bus,
      lifeState,
    });
    for (let i = 0; i < 5; i++) {
      bus.emit(EVENT.slice, makeSliceEvent(i + 1, 'bolt', false));
    }
    expect(sys.comboState.getCombo()).toBe(5);
    expect(lifeState.lives).toBe(3);
  });

  it('10 slice подряд (combo=10) → второй +1 только если есть куда восстанавливать', () => {
    const bus = new EventBus();
    const lifeState = new LifeState(1); // есть запас до MAX_LIVES=3
    const sys = new ScoreSystem(makeSceneStub() as never, {
      eventBus: bus,
      lifeState,
    });
    for (let i = 0; i < 10; i++) {
      bus.emit(EVENT.slice, makeSliceEvent(i + 1, 'bolt', false));
    }
    expect(sys.comboState.getCombo()).toBe(10);
    // combo=5 → +1 (1→2), combo=10 → +1 (2→3). Итог = MAX_LIVES.
    expect(lifeState.lives).toBe(MAX_LIVES);
  });

  it('combo=5 при MAX_LIVES → gainLife clamp, lives остаётся 3 (звук не играем)', () => {
    // Старт с полным_health: восстановить некуда, lives не меняется.
    const bus = new EventBus();
    const lifeState = new LifeState(); // lives=3 (MAX)
    const sys = new ScoreSystem(makeSceneStub() as never, {
      eventBus: bus,
      lifeState,
    });
    for (let i = 0; i < 5; i++) {
      bus.emit(EVENT.slice, makeSliceEvent(i + 1, 'bolt', false));
    }
    expect(sys.comboState.getCombo()).toBe(5);
    expect(lifeState.lives).toBe(MAX_LIVES); // без изменений
  });

  it('combo=4 не даёт жизнь (только кратное 5)', () => {
    const bus = new EventBus();
    const lifeState = new LifeState(2);
    const sys = new ScoreSystem(makeSceneStub() as never, {
      eventBus: bus,
      lifeState,
    });
    for (let i = 0; i < 4; i++) {
      bus.emit(EVENT.slice, makeSliceEvent(i + 1, 'bolt', false));
    }
    expect(sys.comboState.getCombo()).toBe(4);
    expect(lifeState.lives).toBe(2); // нет восстановления
  });

  it('труба не учитывается в комбо и не влияет на восстановление жизни', () => {
    const bus = new EventBus();
    const lifeState = new LifeState(2);
    const sys = new ScoreSystem(makeSceneStub() as never, {
      eventBus: bus,
      lifeState,
    });
    // 4 обычных slice (combo=4) + труба (combo не трогает) + 1 slice (combo=5).
    bus.emit(EVENT.slice, makeSliceEvent(1, 'bolt', false));
    bus.emit(EVENT.slice, makeSliceEvent(2, 'bolt', false));
    bus.emit(EVENT.slice, makeSliceEvent(3, 'bolt', false));
    bus.emit(EVENT.slice, makeSliceEvent(4, 'bolt', false));
    bus.emit(EVENT.slice, makeSliceEvent(5, 'pipe', true)); // combo=4 всё ещё
    bus.emit(EVENT.slice, makeSliceEvent(6, 'bolt', false)); // combo=5 → +1 жизнь
    expect(sys.comboState.getCombo()).toBe(5);
    expect(lifeState.lives).toBe(3);
  });

  it('reset ScoreSystem не трогает lifeState (раздельные ответственности)', () => {
    const bus = new EventBus();
    const lifeState = new LifeState(2);
    const sys = new ScoreSystem(makeSceneStub() as never, {
      eventBus: bus,
      lifeState,
    });
    for (let i = 0; i < 5; i++) {
      bus.emit(EVENT.slice, makeSliceEvent(i + 1, 'bolt', false));
    }
    expect(lifeState.lives).toBe(3);
    sys.reset();
    // ScoreSystem.reset обнуляет только score/combo — lifeState не его ответственность.
    expect(sys.score).toBe(0);
    expect(lifeState.lives).toBe(3);
  });
});
