import { describe, it, expect } from 'vitest';
import { LevelState, computeLevel } from '../game/LevelState';

/**
 * Тесты LevelState / computeLevel — pure-logic уровней.
 *
 * Правила (ТЗ «Система уровней»):
 *   - computeLevel(score) = floor(score/1000) + 1;
 *   - примеры: 0→1, 999→1, 1000→2, 2500→3;
 *   - LevelState.update(score) возвращает {leveledUp, newLevel};
 *   - leveledUp=true только при росте уровня;
 *   - reset() возвращает level в 1.
 *
 * Модуль НЕ зависит от Phaser.
 */

describe('computeLevel', () => {
  it('score=0 → level=1', () => {
    expect(computeLevel(0)).toBe(1);
  });

  it('score=999 → level=1 (последний очко перед порогом)', () => {
    expect(computeLevel(999)).toBe(1);
  });

  it('score=1000 → level=2 (ровно на пороге)', () => {
    expect(computeLevel(1000)).toBe(2);
  });

  it('score=2500 → level=3', () => {
    expect(computeLevel(2500)).toBe(3);
  });
});

describe('LevelState / начальное состояние', () => {
  it('level=1 при создании', () => {
    expect(new LevelState().level).toBe(1);
  });
});

describe('LevelState.update', () => {
  it('без роста уровня возвращает leveledUp=false', () => {
    const s = new LevelState();
    const r = s.update(500);
    expect(r.leveledUp).toBe(false);
    expect(r.newLevel).toBe(1);
    expect(s.level).toBe(1);
  });

  it('при переходе через 1000 — leveledUp=true, newLevel=2', () => {
    const s = new LevelState();
    s.update(500);
    const r = s.update(1000);
    expect(r.leveledUp).toBe(true);
    expect(r.newLevel).toBe(2);
    expect(s.level).toBe(2);
  });

  it('несколько повышений уровня подряд', () => {
    const s = new LevelState();
    expect(s.update(1000).newLevel).toBe(2);
    expect(s.update(2000).newLevel).toBe(3);
    // 2500 всё ещё level 3 (до 3000).
    expect(s.update(2500).newLevel).toBe(3);
    const r = s.update(3000);
    expect(r.leveledUp).toBe(true);
    expect(s.level).toBe(4);
  });

  it('повторный update в том же уровне не даёт leveledUp', () => {
    const s = new LevelState();
    s.update(1500); // level 2
    const r = s.update(1800); // всё ещё level 2
    expect(r.leveledUp).toBe(false);
    expect(r.newLevel).toBe(2);
  });

  it('на старте (score=0) — leveledUp=false, level=1', () => {
    const s = new LevelState();
    const r = s.update(0);
    expect(r.leveledUp).toBe(false);
    expect(r.newLevel).toBe(1);
  });
});

describe('LevelState.reset', () => {
  it('reset возвращает level в 1', () => {
    const s = new LevelState();
    s.update(3000);
    expect(s.level).toBe(4);
    s.reset();
    expect(s.level).toBe(1);
  });

  it('после reset уровень снова растёт с нуля', () => {
    const s = new LevelState();
    s.update(2000);
    s.reset();
    expect(s.update(1000).newLevel).toBe(2);
    expect(s.level).toBe(2);
  });
});
