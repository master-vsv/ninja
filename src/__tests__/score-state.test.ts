import { describe, it, expect } from 'vitest';
import { ScoreState, POINTS_PER_KIND } from '../game/ScoreState';

/**
 * Тесты ScoreState (фаза 4) — pure-logic базового счёта.
 *
 * Правила из плана (фаза 4, «ScoreSystem (базовый счёт)»):
 *   - POINTS_PER_KIND: фикс. очки за каждый режущийся kind
 *     (bolt:10, nut:15, ruler:20, standard:25; pipe не режется в счёт);
 *   - новые NDT-методы: probe:25, magnet:30, penetrant:20;
 *   - applySlice(kind, isBomb): если isBomb → +0; иначе += POINTS_PER_KIND[kind];
 *   - reset() обнуляет счёт.
 *
 * Комбо-множитель — фаза 6 (пост-MVP), здесь не тестируется.
 * Модуль НЕ зависит от Phaser.
 */

describe('ScoreState / POINTS_PER_KIND', () => {
  it('bolt = 10', () => {
    expect(POINTS_PER_KIND.bolt).toBe(10);
  });

  it('nut = 15', () => {
    expect(POINTS_PER_KIND.nut).toBe(15);
  });

  it('ruler = 20', () => {
    expect(POINTS_PER_KIND.ruler).toBe(20);
  });

  it('standard = 25', () => {
    expect(POINTS_PER_KIND.standard).toBe(25);
  });

  it('pipe = 0 (труба не режется в счёт)', () => {
    expect(POINTS_PER_KIND.pipe).toBe(0);
  });

  it('probe (УЗ-щуп) = 25', () => {
    expect(POINTS_PER_KIND.probe).toBe(25);
  });

  it('magnet (магнит-подкова) = 30', () => {
    expect(POINTS_PER_KIND.magnet).toBe(30);
  });

  it('penetrant (капля пенетранта) = 20', () => {
    expect(POINTS_PER_KIND.penetrant).toBe(20);
  });

  it('shrink (power-up) = 50 (бонус за разрез)', () => {
    expect(POINTS_PER_KIND.shrink).toBe(50);
  });

  it('grow (power-up) = 50 (бонус за разрез)', () => {
    expect(POINTS_PER_KIND.grow).toBe(50);
  });

  it('slow (power-up) = 50 (бонус за разрез)', () => {
    expect(POINTS_PER_KIND.slow).toBe(50);
  });

  it('helmet (shield-экипировка) = 50 (бонус за разрез)', () => {
    expect(POINTS_PER_KIND.helmet).toBe(50);
  });

  it('goggles (grow-экипировка) = 50 (бонус за разрез)', () => {
    expect(POINTS_PER_KIND.goggles).toBe(50);
  });

  it('weldingMask (slow-экипировка) = 50 (бонус за разрез)', () => {
    expect(POINTS_PER_KIND.weldingMask).toBe(50);
  });

  it('содержит все 14 NDTObjectKind (8 базовых + 3 power-up + 3 экипировки)', () => {
    const keys = Object.keys(POINTS_PER_KIND).sort();
    expect(keys).toEqual([
      'bolt',
      'goggles',
      'grow',
      'helmet',
      'magnet',
      'nut',
      'penetrant',
      'pipe',
      'probe',
      'ruler',
      'shrink',
      'slow',
      'standard',
      'weldingMask',
    ]);
  });
});

describe('ScoreState.applySlice — power-up фигуры', () => {
  it('разрез shrink → +50 очков', () => {
    const s = new ScoreState();
    s.applySlice('shrink', false);
    expect(s.score).toBe(50);
  });

  it('разрез grow → +50 очков', () => {
    const s = new ScoreState();
    s.applySlice('grow', false);
    expect(s.score).toBe(50);
  });

  it('разрез slow → +50 очков', () => {
    const s = new ScoreState();
    s.applySlice('slow', false);
    expect(s.score).toBe(50);
  });

  it('разрез helmet → +50 очков (shield-экипировка)', () => {
    const s = new ScoreState();
    s.applySlice('helmet', false);
    expect(s.score).toBe(50);
  });

  it('разрез goggles → +50 очков (grow-экипировка)', () => {
    const s = new ScoreState();
    s.applySlice('goggles', false);
    expect(s.score).toBe(50);
  });

  it('разрез weldingMask → +50 очков (slow-экипировка)', () => {
    const s = new ScoreState();
    s.applySlice('weldingMask', false);
    expect(s.score).toBe(50);
  });
});

describe('ScoreState / начальное состояние', () => {
  it('score=0 при создании', () => {
    const s = new ScoreState();
    expect(s.score).toBe(0);
  });
});

describe('ScoreState.applySlice — обычные объекты', () => {
  it('разрез bolt → +10', () => {
    const s = new ScoreState();
    s.applySlice('bolt', false);
    expect(s.score).toBe(10);
  });

  it('разрез nut → +15', () => {
    const s = new ScoreState();
    s.applySlice('nut', false);
    expect(s.score).toBe(15);
  });

  it('разрез ruler → +20', () => {
    const s = new ScoreState();
    s.applySlice('ruler', false);
    expect(s.score).toBe(20);
  });

  it('разрез standard → +25', () => {
    const s = new ScoreState();
    s.applySlice('standard', false);
    expect(s.score).toBe(25);
  });

  it('разрез probe → +25 (новый NDT-метод UT)', () => {
    const s = new ScoreState();
    s.applySlice('probe', false);
    expect(s.score).toBe(25);
  });

  it('разрез magnet → +30 (новый NDT-метод MT)', () => {
    const s = new ScoreState();
    s.applySlice('magnet', false);
    expect(s.score).toBe(30);
  });

  it('разрез penetrant → +20 (новый NDT-метод PT)', () => {
    const s = new ScoreState();
    s.applySlice('penetrant', false);
    expect(s.score).toBe(20);
  });

  it('возвращает добавленные очки (для UI/HUD)', () => {
    const s = new ScoreState();
    const gained = s.applySlice('nut', false);
    expect(gained).toBe(15);
  });
});

describe('ScoreState.applySlice — труба (isBomb=true)', () => {
  it('разрез трубы (isBomb=true) → +0 очков', () => {
    const s = new ScoreState();
    const gained = s.applySlice('pipe', true);
    expect(gained).toBe(0);
    expect(s.score).toBe(0);
  });

  it('разрез трубы не влияет на последующие очки', () => {
    const s = new ScoreState();
    s.applySlice('pipe', true);
    s.applySlice('bolt', false);
    expect(s.score).toBe(10);
  });

  it('труба с isBomb=true корректно игнорируется даже если kind=pipe по ошибке с isBomb=false', () => {
    // Инвариант: pipe всегда даёт 0 (POINTS_PER_KIND.pipe = 0), даже если
    // флаг isBomb забыт — безопасность по двум каналам.
    const s = new ScoreState();
    const gained = s.applySlice('pipe', false);
    expect(gained).toBe(0);
    expect(s.score).toBe(0);
  });
});

describe('ScoreState / накопление', () => {
  it('несколько разрезов суммируются', () => {
    const s = new ScoreState();
    s.applySlice('bolt', false); // 10
    s.applySlice('nut', false); // 15
    s.applySlice('ruler', false); // 20
    s.applySlice('standard', false); // 25
    expect(s.score).toBe(70);
  });

  it('труба между обычными разрезами не влияет на сумму', () => {
    const s = new ScoreState();
    s.applySlice('bolt', false); // 10
    s.applySlice('pipe', true); // 0
    s.applySlice('nut', false); // 15
    expect(s.score).toBe(25);
  });
});

describe('ScoreState.reset', () => {
  it('reset обнуляет счёт', () => {
    const s = new ScoreState();
    s.applySlice('standard', false);
    s.applySlice('standard', false);
    expect(s.score).toBe(50);
    s.reset();
    expect(s.score).toBe(0);
  });

  it('после reset очки снова накапливаются с нуля', () => {
    const s = new ScoreState();
    s.applySlice('standard', false);
    s.reset();
    s.applySlice('bolt', false);
    expect(s.score).toBe(10);
  });
});
