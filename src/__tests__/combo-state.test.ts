import { describe, it, expect } from 'vitest';
import {
  ComboState,
  COMBO_WINDOW_MS,
  COMBO_MAX_MULTIPLIER,
  COMBO_MULTIPLIER_TIERS,
} from '../game/ComboState';

/**
 * Тесты ComboState (фаза 6) — pure-logic комбо-множитель.
 *
 * Контракт плана (фаза 6, «комбо-множитель»):
 *   - первый slice → combo=1, ×1 (нет бонуса);
 *   - серия в окне COMBO_WINDOW_MS → combo растёт, множитель ступенчато:
 *       combo 1 → ×1, 2-3 → ×2, 4-6 → ×3, 7+ → ×4;
 *   - timeout (вне окна > COMBO_WINDOW_MS) → combo=0, ×1;
 *   - reset() → combo=0.
 *
 * Модуль НЕ зависит от Phaser.
 */

describe('ComboState / константы', () => {
  it('COMBO_WINDOW_MS = 1000 (аркадный темп)', () => {
    expect(COMBO_WINDOW_MS).toBe(1000);
  });

  it('COMBO_MAX_MULTIPLIER = 4', () => {
    expect(COMBO_MAX_MULTIPLIER).toBe(4);
  });

  it('tier 7+ → ×4', () => {
    const t = COMBO_MULTIPLIER_TIERS.find((x) => x.minCombo === 7);
    expect(t?.multiplier).toBe(4);
  });

  it('tier 4-6 → ×3', () => {
    const t = COMBO_MULTIPLIER_TIERS.find((x) => x.minCombo === 4);
    expect(t?.multiplier).toBe(3);
  });

  it('tier 2-3 → ×2', () => {
    const t = COMBO_MULTIPLIER_TIERS.find((x) => x.minCombo === 2);
    expect(t?.multiplier).toBe(2);
  });

  it('tier 1 → ×1', () => {
    const t = COMBO_MULTIPLIER_TIERS.find((x) => x.minCombo === 1);
    expect(t?.multiplier).toBe(1);
  });
});

describe('ComboState / начальное состояние', () => {
  it('combo = 0', () => {
    const s = new ComboState();
    expect(s.getCombo()).toBe(0);
  });

  it('multiplier = 1 (нет бонуса)', () => {
    const s = new ComboState();
    expect(s.getMultiplier()).toBe(1);
  });

  it('lastSliceMs = 0', () => {
    const s = new ComboState();
    expect(s.getLastSliceMs()).toBe(0);
  });
});

describe('ComboState.registerSlice — нарастание серии', () => {
  it('первый slice → combo=1', () => {
    const s = new ComboState();
    s.registerSlice(100);
    expect(s.getCombo()).toBe(1);
  });

  it('первый slice → multiplier=×1 (нет бонуса)', () => {
    const s = new ComboState();
    s.registerSlice(100);
    expect(s.getMultiplier()).toBe(1);
  });

  it('registerSlice обновляет lastSliceMs', () => {
    const s = new ComboState();
    s.registerSlice(500);
    expect(s.getLastSliceMs()).toBe(500);
  });

  it('два slice в окне → combo=2', () => {
    const s = new ComboState();
    s.registerSlice(100);
    s.registerSlice(200);
    expect(s.getCombo()).toBe(2);
  });

  it('серия из 7 slice в окне → combo=7', () => {
    const s = new ComboState();
    for (let i = 0; i < 7; i++) {
      s.registerSlice(100 + i * 100); // 100, 200, ..., 700
    }
    expect(s.getCombo()).toBe(7);
  });
});

describe('ComboState.getMultiplier — пороги', () => {
  it('combo=0 → ×1', () => {
    const s = new ComboState();
    expect(s.getMultiplier()).toBe(1);
  });

  it('combo=1 → ×1', () => {
    const s = new ComboState();
    s.registerSlice(0);
    expect(s.getMultiplier()).toBe(1);
  });

  it('combo=2 → ×2', () => {
    const s = new ComboState();
    s.registerSlice(0);
    s.registerSlice(100);
    expect(s.getCombo()).toBe(2);
    expect(s.getMultiplier()).toBe(2);
  });

  it('combo=3 → ×2', () => {
    const s = new ComboState();
    s.registerSlice(0);
    s.registerSlice(100);
    s.registerSlice(200);
    expect(s.getCombo()).toBe(3);
    expect(s.getMultiplier()).toBe(2);
  });

  it('combo=4 → ×3', () => {
    const s = new ComboState();
    for (let i = 0; i < 4; i++) s.registerSlice(i * 100);
    expect(s.getCombo()).toBe(4);
    expect(s.getMultiplier()).toBe(3);
  });

  it('combo=6 → ×3', () => {
    const s = new ComboState();
    for (let i = 0; i < 6; i++) s.registerSlice(i * 100);
    expect(s.getCombo()).toBe(6);
    expect(s.getMultiplier()).toBe(3);
  });

  it('combo=7 → ×4 (макс)', () => {
    const s = new ComboState();
    for (let i = 0; i < 7; i++) s.registerSlice(i * 100);
    expect(s.getCombo()).toBe(7);
    expect(s.getMultiplier()).toBe(4);
  });

  it('combo=20 → ×4 (cap на максимальном tier)', () => {
    const s = new ComboState();
    for (let i = 0; i < 20; i++) s.registerSlice(i * 50);
    expect(s.getCombo()).toBe(20);
    expect(s.getMultiplier()).toBe(COMBO_MAX_MULTIPLIER);
  });
});

describe('ComboState.update — таймаут окна', () => {
  it('update без активного комбо — no-op', () => {
    const s = new ComboState();
    s.update(500);
    expect(s.getCombo()).toBe(0);
  });

  it('update в пределах окна — combo не сбрасывается', () => {
    const s = new ComboState();
    s.registerSlice(100);
    s.update(500); // 400 мс после slice — в окне
    expect(s.getCombo()).toBe(1);
  });

  it('update ровно в окне (== COMBO_WINDOW_MS) — combo НЕ сбрасывается', () => {
    const s = new ComboState();
    s.registerSlice(100);
    // lastSlice=100, now=100+1000=1100 → diff==COMBO_WINDOW_MS, не > .
    s.update(100 + COMBO_WINDOW_MS);
    expect(s.getCombo()).toBe(1);
  });

  it('update при превышении окна → combo=0', () => {
    const s = new ComboState();
    s.registerSlice(100);
    s.update(100 + COMBO_WINDOW_MS + 1);
    expect(s.getCombo()).toBe(0);
  });

  it('после таймаута multiplier=×1', () => {
    const s = new ComboState();
    s.registerSlice(100);
    s.registerSlice(200);
    s.update(200 + COMBO_WINDOW_MS + 1);
    expect(s.getCombo()).toBe(0);
    expect(s.getMultiplier()).toBe(1);
  });

  it('после таймаута новый slice начинает серию с combo=1', () => {
    const s = new ComboState();
    s.registerSlice(100);
    s.registerSlice(200);
    s.update(200 + COMBO_WINDOW_MS + 1);
    expect(s.getCombo()).toBe(0);
    s.registerSlice(200 + COMBO_WINDOW_MS + 100);
    expect(s.getCombo()).toBe(1);
    expect(s.getMultiplier()).toBe(1);
  });

  it('update идемпотентен после сброса', () => {
    const s = new ComboState();
    s.registerSlice(100);
    s.update(2000);
    expect(s.getCombo()).toBe(0);
    s.update(2100);
    s.update(2200);
    expect(s.getCombo()).toBe(0);
  });
});

describe('ComboState / окно комбо на границах', () => {
  it('registerSlice ровно в окне (== COMBO_WINDOW_MS) → серия продолжается', () => {
    const s = new ComboState();
    s.registerSlice(100);
    s.registerSlice(100 + COMBO_WINDOW_MS); // diff == window
    expect(s.getCombo()).toBe(2);
  });

  it('registerSlice за окном (> COMBO_WINDOW_MS) → новая серия combo=1', () => {
    const s = new ComboState();
    s.registerSlice(100);
    s.registerSlice(100 + COMBO_WINDOW_MS + 1);
    expect(s.getCombo()).toBe(1);
  });
});

describe('ComboState.reset', () => {
  it('reset обнуляет combo', () => {
    const s = new ComboState();
    s.registerSlice(100);
    s.registerSlice(200);
    expect(s.getCombo()).toBe(2);
    s.reset();
    expect(s.getCombo()).toBe(0);
    expect(s.getMultiplier()).toBe(1);
  });

  it('reset обнуляет lastSliceMs', () => {
    const s = new ComboState();
    s.registerSlice(500);
    s.reset();
    expect(s.getLastSliceMs()).toBe(0);
  });

  it('reset идемпотентен', () => {
    const s = new ComboState();
    s.reset();
    s.reset();
    expect(s.getCombo()).toBe(0);
  });

  it('после reset серия снова нарастает', () => {
    const s = new ComboState();
    s.registerSlice(100);
    s.registerSlice(200);
    s.reset();
    s.registerSlice(300);
    expect(s.getCombo()).toBe(1);
    s.registerSlice(400);
    expect(s.getCombo()).toBe(2);
  });
});

describe('ComboState / полный игровой цикл', () => {
  it('эскалация серии ×1 → ×2 → ×3 → ×4 → таймаут → новая серия', () => {
    const s = new ComboState();
    let now = 1000;
    // 4 slice в окне → combo=4, ×3.
    for (let i = 0; i < 4; i++) {
      s.registerSlice(now);
      now += 200;
    }
    expect(s.getCombo()).toBe(4);
    expect(s.getMultiplier()).toBe(3);
    // Ещё 3 slice → combo=7, ×4.
    for (let i = 0; i < 3; i++) {
      s.registerSlice(now);
      now += 200;
    }
    expect(s.getCombo()).toBe(7);
    expect(s.getMultiplier()).toBe(4);
    // Таймаут.
    s.update(now + COMBO_WINDOW_MS + 1);
    expect(s.getCombo()).toBe(0);
    expect(s.getMultiplier()).toBe(1);
    // Новый slice → combo=1.
    s.registerSlice(now + 5000);
    expect(s.getCombo()).toBe(1);
    expect(s.getMultiplier()).toBe(1);
  });
});
