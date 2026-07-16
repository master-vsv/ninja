import { describe, it, expect } from 'vitest';
import { isSwordUnlocked, getUnlockedSwords } from '../sword/SwordUnlock';
import type { SwordType } from '../events/types';

/**
 * Тесты SwordUnlock — pure-logic разблокировки мечей по уровню.
 *
 * Правила (ТЗ «Разблокировка мечей по уровню»):
 *   - forged    открывается с уровня 1 (всегда доступен);
 *   - welding   — с уровня 2;
 *   - plasma    — с уровня 3;
 *   - radiation — с уровня 4.
 *
 * Покрывает isSwordUnlocked (граница unlockLevel) и getUnlockedSwords
 * (состав списка для L1/L2/L3/L4 и уровнях выше).
 *
 * Модуль НЕ зависит от Phaser — тестируется в чистом окружении.
 */

describe('SwordProps.unlockLevel — корректные пороги', () => {
  it('forged.unlockLevel = 1 (всегда доступен)', () => {
    expect(isSwordUnlocked('forged', 1)).toBe(true);
  });

  it('пороги unlockLevel возрастают по порядку мечей', () => {
    // Косвенная проверка через isSwordUnlocked на самом нижнем уровне меча.
    expect(isSwordUnlocked('welding', 2)).toBe(true);
    expect(isSwordUnlocked('plasma', 3)).toBe(true);
    expect(isSwordUnlocked('radiation', 4)).toBe(true);
  });
});

describe('isSwordUnlocked / forged (всегда с L1)', () => {
  it('доступен на уровне 1', () => {
    expect(isSwordUnlocked('forged', 1)).toBe(true);
  });

  it('доступен на уровне 10', () => {
    expect(isSwordUnlocked('forged', 10)).toBe(true);
  });
});

describe('isSwordUnlocked / welding (с L2)', () => {
  it('заблокирован на уровне 1', () => {
    expect(isSwordUnlocked('welding', 1)).toBe(false);
  });

  it('открывается ровно на уровне 2 (>=)', () => {
    expect(isSwordUnlocked('welding', 2)).toBe(true);
  });

  it('доступен на уровне 3', () => {
    expect(isSwordUnlocked('welding', 3)).toBe(true);
  });
});

describe('isSwordUnlocked / plasma (с L3)', () => {
  it('заблокирован на уровне 1', () => {
    expect(isSwordUnlocked('plasma', 1)).toBe(false);
  });

  it('заблокирован на уровне 2', () => {
    expect(isSwordUnlocked('plasma', 2)).toBe(false);
  });

  it('открывается ровно на уровне 3', () => {
    expect(isSwordUnlocked('plasma', 3)).toBe(true);
  });

  it('доступен на уровне 5', () => {
    expect(isSwordUnlocked('plasma', 5)).toBe(true);
  });
});

describe('isSwordUnlocked / radiation (с L4)', () => {
  it('заблокирован на уровне 1', () => {
    expect(isSwordUnlocked('radiation', 1)).toBe(false);
  });

  it('заблокирован на уровне 3', () => {
    expect(isSwordUnlocked('radiation', 3)).toBe(false);
  });

  it('открывается ровно на уровне 4', () => {
    expect(isSwordUnlocked('radiation', 4)).toBe(true);
  });

  it('доступен на уровне 7', () => {
    expect(isSwordUnlocked('radiation', 7)).toBe(true);
  });
});

describe('isSwordUnlocked / инвариант границы unlockLevel', () => {
  const expectations: Array<{ sword: SwordType; unlockLevel: number }> = [
    { sword: 'forged', unlockLevel: 1 },
    { sword: 'welding', unlockLevel: 2 },
    { sword: 'plasma', unlockLevel: 3 },
    { sword: 'radiation', unlockLevel: 4 },
  ];

  it('на уровне unlockLevel-1 меч ещё заблокирован', () => {
    for (const { sword, unlockLevel } of expectations) {
      if (unlockLevel <= 1) continue; // forged не имеет уровня ниже
      expect(isSwordUnlocked(sword, unlockLevel - 1)).toBe(false);
    }
  });

  it('на уровне unlockLevel меч уже доступен', () => {
    for (const { sword, unlockLevel } of expectations) {
      expect(isSwordUnlocked(sword, unlockLevel)).toBe(true);
    }
  });
});

describe('getUnlockedSwords', () => {
  it('на уровне 1 — только forged', () => {
    expect(getUnlockedSwords(1)).toEqual(['forged']);
  });

  it('на уровне 2 — forged + welding', () => {
    expect(getUnlockedSwords(2)).toEqual(['forged', 'welding']);
  });

  it('на уровне 3 — forged + welding + plasma', () => {
    expect(getUnlockedSwords(3)).toEqual(['forged', 'welding', 'plasma']);
  });

  it('на уровне 4 — все 4 меча', () => {
    expect(getUnlockedSwords(4)).toEqual([
      'forged',
      'welding',
      'plasma',
      'radiation',
    ]);
  });

  it('на уровне выше 4 — все 4 меча (без дубликатов)', () => {
    const unlocked = getUnlockedSwords(10);
    expect(unlocked).toHaveLength(4);
    expect(new Set(unlocked).size).toBe(4);
  });

  it('список всегда в порядке SWORD_CYCLE_ORDER (forged → radiation)', () => {
    // Проверка порядка на промежуточном уровне.
    expect(getUnlockedSwords(3)).toEqual(['forged', 'welding', 'plasma']);
  });

  it('на уровне 1 forged присутствует всегда (инвариант старта)', () => {
    expect(getUnlockedSwords(1)).toContain('forged');
  });
});
