import { describe, it, expect } from 'vitest';
import {
  PowerUpState,
  DEFAULT_POWERUP_DURATION_MS,
} from '../game/PowerUpState';
import {
  isPowerUpKind,
  kindToPowerUpType,
  POWERUP_COLORS,
  POWERUP_KINDS,
  type PowerUpType,
} from '../game/PowerUpType';
import type { NDTObjectKind } from '../events/types';

/**
 * Тесты PowerUpState + хелперов PowerUpType (pure-logic state machine).
 *
 * Покрывает:
 *   - начальное состояние (не активен, remaining=0, scale/speed=1);
 *   - activate(type) → активен, remaining=duration, множители применены;
 *   - activate(<=0) — no-op;
 *   - update(dt) уменьшает remaining;
 *   - update до истечения → остаётся active;
 *   - update с превышением → activeType=null, remaining=0;
 *   - смена типа при повторном activate (новый тип заменяет);
 *   - продление (max remaining) при том же типе;
 *   - reset() → inactive;
 *   - getScaleMultiplier: shrink=0.6, grow=1.4, slow=1, none=1;
 *   - getSpeedMultiplier: slow=0.5, остальные=1, none=1;
 *   - helpers isPowerUpKind / kindToPowerUpType / POWERUP_COLORS / POWERUP_KINDS.
 *
 * Модуль НЕ зависит от Phaser — тестируется в чистом окружении.
 */

describe('PowerUpState / начальное состояние', () => {
  it('не активен при создании (activeType=null)', () => {
    const s = new PowerUpState();
    expect(s.isActive).toBe(false);
    expect(s.activeType).toBeNull();
  });

  it('remaining = 0 при создании', () => {
    const s = new PowerUpState();
    expect(s.remainingMs).toBe(0);
  });

  it('getScaleMultiplier = 1 при создании', () => {
    const s = new PowerUpState();
    expect(s.getScaleMultiplier()).toBe(1);
  });

  it('getSpeedMultiplier = 1 при создании', () => {
    const s = new PowerUpState();
    expect(s.getSpeedMultiplier()).toBe(1);
  });
});

describe('PowerUpState.activate', () => {
  it('активирует shrink на DEFAULT_POWERUP_DURATION_MS', () => {
    const s = new PowerUpState();
    const result = s.activate('shrink');
    expect(result.activated).toBe(true);
    expect(result.type).toBe('shrink');
    expect(result.remainingMs).toBe(DEFAULT_POWERUP_DURATION_MS);
    expect(s.isActive).toBe(true);
    expect(s.activeType).toBe('shrink');
    expect(s.remainingMs).toBe(DEFAULT_POWERUP_DURATION_MS);
  });

  it('activate с явной длительностью задаёт remaining', () => {
    const s = new PowerUpState();
    s.activate('grow', 3000);
    expect(s.remainingMs).toBe(3000);
    expect(s.activeType).toBe('grow');
  });

  it('activate(0) — no-op, возвращает activated=false', () => {
    const s = new PowerUpState();
    const result = s.activate('shrink', 0);
    expect(result.activated).toBe(false);
    expect(s.isActive).toBe(false);
    expect(s.activeType).toBeNull();
  });

  it('activate(отрицательное) — no-op', () => {
    const s = new PowerUpState();
    const result = s.activate('grow', -100);
    expect(result.activated).toBe(false);
    expect(s.isActive).toBe(false);
  });

  it('повторный activate ТОГО ЖЕ типа ПРОДЛЕВАЕТ (max remaining)', () => {
    const s = new PowerUpState();
    s.activate('shrink', 5000);
    expect(s.remainingMs).toBe(5000);
    // Продление меньшим — не уменьшает.
    s.activate('shrink', 3000);
    expect(s.remainingMs).toBe(5000);
    expect(s.activeType).toBe('shrink');
    // Продление большим — увеличивает.
    s.activate('shrink', 7000);
    expect(s.remainingMs).toBe(7000);
  });

  it('повторный activate ДРУГОГО типа ЗАМЕНЯЕТ активный', () => {
    const s = new PowerUpState();
    s.activate('shrink', 5000);
    expect(s.activeType).toBe('shrink');
    // Смена типа на grow: тип заменяется, длительность = max(5000, 4000).
    s.activate('grow', 4000);
    expect(s.activeType).toBe('grow');
    expect(s.remainingMs).toBe(5000);
    // Смена на slow с большей длительностью — тип и remaining обновляются.
    s.activate('slow', 8000);
    expect(s.activeType).toBe('slow');
    expect(s.remainingMs).toBe(8000);
  });

  it('повторный activate после истечения реактивирует', () => {
    const s = new PowerUpState();
    s.activate('shrink', 100);
    s.update(100); // истёк
    expect(s.isActive).toBe(false);
    s.activate('grow', 500);
    expect(s.isActive).toBe(true);
    expect(s.activeType).toBe('grow');
    expect(s.remainingMs).toBe(500);
  });

  it('activate(shield) — активирует shield на DEFAULT_DURATION_MS', () => {
    const s = new PowerUpState();
    const result = s.activate('shield');
    expect(result.activated).toBe(true);
    expect(result.type).toBe('shield');
    expect(result.remainingMs).toBe(DEFAULT_POWERUP_DURATION_MS);
    expect(s.activeType).toBe('shield');
  });
});

describe('PowerUpState.update', () => {
  it('уменьшает remaining на dt', () => {
    const s = new PowerUpState();
    s.activate('shrink', 1000);
    s.update(300);
    expect(s.remainingMs).toBe(700);
    expect(s.isActive).toBe(true);
  });

  it('несколько update подряд корректно суммируют dt', () => {
    const s = new PowerUpState();
    s.activate('grow', 1000);
    s.update(200);
    s.update(300);
    s.update(100);
    expect(s.remainingMs).toBe(400);
    expect(s.isActive).toBe(true);
  });

  it('при истечении remaining → isActive=false, activeType=null', () => {
    const s = new PowerUpState();
    s.activate('slow', 500);
    s.update(500);
    expect(s.remainingMs).toBe(0);
    expect(s.isActive).toBe(false);
    expect(s.activeType).toBeNull();
  });

  it('при превышении remaining → remaining=0 (не отрицательное)', () => {
    const s = new PowerUpState();
    s.activate('shrink', 500);
    s.update(1500);
    expect(s.remainingMs).toBe(0);
    expect(s.isActive).toBe(false);
    expect(s.activeType).toBeNull();
  });

  it('update после истечения — no-op (остаётся inactive)', () => {
    const s = new PowerUpState();
    s.activate('grow', 100);
    s.update(100);
    expect(s.isActive).toBe(false);
    s.update(50);
    expect(s.isActive).toBe(false);
    expect(s.remainingMs).toBe(0);
  });

  it('update(0) — no-op', () => {
    const s = new PowerUpState();
    s.activate('shrink', 1000);
    s.update(0);
    expect(s.remainingMs).toBe(1000);
    expect(s.isActive).toBe(true);
  });

  it('update(отрицательное) — no-op', () => {
    const s = new PowerUpState();
    s.activate('grow', 1000);
    s.update(-50);
    expect(s.remainingMs).toBe(1000);
    expect(s.isActive).toBe(true);
  });

  it('update на неактивном стейте — no-op', () => {
    const s = new PowerUpState();
    s.update(500);
    expect(s.isActive).toBe(false);
    expect(s.remainingMs).toBe(0);
    expect(s.activeType).toBeNull();
  });
});

describe('PowerUpState.reset', () => {
  it('принудительно сбрасывает эффект (activeType=null)', () => {
    const s = new PowerUpState();
    s.activate('shrink', 2500);
    s.reset();
    expect(s.isActive).toBe(false);
    expect(s.activeType).toBeNull();
    expect(s.remainingMs).toBe(0);
  });

  it('идемпотентен', () => {
    const s = new PowerUpState();
    s.reset();
    s.reset();
    expect(s.isActive).toBe(false);
    expect(s.activeType).toBeNull();
    expect(s.remainingMs).toBe(0);
  });

  it('после reset можно снова активировать', () => {
    const s = new PowerUpState();
    s.activate('grow', 1000);
    s.reset();
    const result = s.activate('slow', 500);
    expect(result.activated).toBe(true);
    expect(s.isActive).toBe(true);
    expect(s.activeType).toBe('slow');
    expect(s.remainingMs).toBe(500);
  });
});

describe('PowerUpState.getScaleMultiplier', () => {
  it('shrink → 0.6', () => {
    const s = new PowerUpState();
    s.activate('shrink');
    expect(s.getScaleMultiplier()).toBeCloseTo(0.6, 6);
  });

  it('grow → 1.4', () => {
    const s = new PowerUpState();
    s.activate('grow');
    expect(s.getScaleMultiplier()).toBeCloseTo(1.4, 6);
  });

  it('slow → 1.0 (slow не меняет размер)', () => {
    const s = new PowerUpState();
    s.activate('slow');
    expect(s.getScaleMultiplier()).toBe(1);
  });

  it('none → 1.0', () => {
    const s = new PowerUpState();
    expect(s.getScaleMultiplier()).toBe(1);
  });

  it('после истечения → 1.0 (эффект снят)', () => {
    const s = new PowerUpState();
    s.activate('shrink', 100);
    s.update(100);
    expect(s.getScaleMultiplier()).toBe(1);
  });

  it('смена shrink→grow меняет множитель 0.6→1.4', () => {
    const s = new PowerUpState();
    s.activate('shrink');
    expect(s.getScaleMultiplier()).toBeCloseTo(0.6, 6);
    s.activate('grow');
    expect(s.getScaleMultiplier()).toBeCloseTo(1.4, 6);
  });
});

describe('PowerUpState.getSpeedMultiplier', () => {
  it('slow → 0.5', () => {
    const s = new PowerUpState();
    s.activate('slow');
    expect(s.getSpeedMultiplier()).toBeCloseTo(0.5, 6);
  });

  it('shrink → 1.0 (shrink не меняет скорость)', () => {
    const s = new PowerUpState();
    s.activate('shrink');
    expect(s.getSpeedMultiplier()).toBe(1);
  });

  it('grow → 1.0', () => {
    const s = new PowerUpState();
    s.activate('grow');
    expect(s.getSpeedMultiplier()).toBe(1);
  });

  it('none → 1.0', () => {
    const s = new PowerUpState();
    expect(s.getSpeedMultiplier()).toBe(1);
  });

  it('после истечения → 1.0', () => {
    const s = new PowerUpState();
    s.activate('slow', 100);
    s.update(100);
    expect(s.getSpeedMultiplier()).toBe(1);
  });
});

describe('PowerUpState / полный жизненный цикл', () => {
  it('активация → несколько update → истечение → реактивация', () => {
    const s = new PowerUpState();
    s.activate('shrink', 1000);
    expect(s.isActive).toBe(true);
    expect(s.getScaleMultiplier()).toBeCloseTo(0.6, 6);
    s.update(600);
    expect(s.isActive).toBe(true);
    expect(s.remainingMs).toBe(400);
    s.update(500);
    expect(s.isActive).toBe(false);
    expect(s.activeType).toBeNull();
    expect(s.getScaleMultiplier()).toBe(1);
    s.activate('grow', 2000);
    expect(s.isActive).toBe(true);
    expect(s.activeType).toBe('grow');
    expect(s.remainingMs).toBe(2000);
  });
});

// --- Хелперы PowerUpType ---

describe('isPowerUpKind', () => {
  it('true для shrink/grow/slow', () => {
    expect(isPowerUpKind('shrink')).toBe(true);
    expect(isPowerUpKind('grow')).toBe(true);
    expect(isPowerUpKind('slow')).toBe(true);
  });

  it('false для обычных NDT-объектов', () => {
    const normals: ReadonlyArray<NDTObjectKind> = [
      'bolt',
      'nut',
      'ruler',
      'standard',
      'pipe',
      'probe',
      'magnet',
      'penetrant',
    ];
    for (const k of normals) {
      expect(isPowerUpKind(k)).toBe(false);
    }
  });
});

describe('kindToPowerUpType', () => {
  it('возвращает соответствующий PowerUpType для power-up kinds', () => {
    expect(kindToPowerUpType('shrink')).toBe('shrink');
    expect(kindToPowerUpType('grow')).toBe('grow');
    expect(kindToPowerUpType('slow')).toBe('slow');
  });

  it('возвращает null для обычных NDT-объектов', () => {
    expect(kindToPowerUpType('bolt')).toBeNull();
    expect(kindToPowerUpType('pipe')).toBeNull();
    expect(kindToPowerUpType('penetrant')).toBeNull();
  });
});

describe('POWERUP_COLORS / POWERUP_KINDS (контракты ТЗ)', () => {
  it('shrink = purple (0xb14dff)', () => {
    expect(POWERUP_COLORS.shrink).toBe(0xb14dff);
  });

  it('grow = orange (0xff8a00)', () => {
    expect(POWERUP_COLORS.grow).toBe(0xff8a00);
  });

  it('slow = ice-blue (0x00d4ff)', () => {
    expect(POWERUP_COLORS.slow).toBe(0x00d4ff);
  });

  it('shield = gold (0xffd700)', () => {
    expect(POWERUP_COLORS.shield).toBe(0xffd700);
  });

  it('POWERUP_KINDS содержит ровно 6 kinds (3 power-up + 3 экипировки)', () => {
    expect(POWERUP_KINDS).toEqual([
      'shrink',
      'grow',
      'slow',
      'helmet',
      'goggles',
      'weldingMask',
    ]);
  });

  it('каждый POWERUP_KIND отображается в PowerUpType', () => {
    for (const k of POWERUP_KINDS) {
      const t: PowerUpType | null = kindToPowerUpType(k);
      expect(t).not.toBeNull();
    }
  });
});

// --- NDT-фигуры экипировки: shield-интеграция ---

describe('PowerUpState.shield (временная неуязвимость)', () => {
  it('isShielded=false в начальном состоянии', () => {
    const s = new PowerUpState();
    expect(s.isShielded).toBe(false);
  });

  it('activate("shield") → isShielded=true на время действия', () => {
    const s = new PowerUpState();
    s.activate('shield');
    expect(s.isShielded).toBe(true);
    expect(s.isActive).toBe(true);
    expect(s.activeType).toBe('shield');
  });

  it('shield истекает → isShielded=false', () => {
    const s = new PowerUpState();
    s.activate('shield', 500);
    expect(s.isShielded).toBe(true);
    s.update(500);
    expect(s.isShielded).toBe(false);
    expect(s.isActive).toBe(false);
  });

  it('reset() снимает shield', () => {
    const s = new PowerUpState();
    s.activate('shield', 5000);
    expect(s.isShielded).toBe(true);
    s.reset();
    expect(s.isShielded).toBe(false);
  });

  it('shield НЕ меняет scale (getScaleMultiplier=1.0)', () => {
    const s = new PowerUpState();
    s.activate('shield');
    expect(s.getScaleMultiplier()).toBe(1);
  });

  it('shield НЕ меняет скорость (getSpeedMultiplier=1.0)', () => {
    const s = new PowerUpState();
    s.activate('shield');
    expect(s.getSpeedMultiplier()).toBe(1);
  });

  it('смена shrink→shield: тип заменяется', () => {
    const s = new PowerUpState();
    s.activate('shrink', 5000);
    expect(s.isShielded).toBe(false);
    s.activate('shield', 5000);
    expect(s.activeType).toBe('shield');
    expect(s.isShielded).toBe(true);
  });

  it('смена shield→grow снимает shield', () => {
    const s = new PowerUpState();
    s.activate('shield', 5000);
    expect(s.isShielded).toBe(true);
    s.activate('grow', 5000);
    expect(s.activeType).toBe('grow');
    expect(s.isShielded).toBe(false);
  });
});

describe('isPowerUpKind / kindToPowerUpType — экипировка', () => {
  it('helmet — power-up kind с типом shield', () => {
    expect(isPowerUpKind('helmet')).toBe(true);
    expect(kindToPowerUpType('helmet')).toBe('shield');
  });

  it('goggles — power-up kind с типом grow', () => {
    expect(isPowerUpKind('goggles')).toBe(true);
    expect(kindToPowerUpType('goggles')).toBe('grow');
  });

  it('weldingMask — power-up kind с типом slow', () => {
    expect(isPowerUpKind('weldingMask')).toBe(true);
    expect(kindToPowerUpType('weldingMask')).toBe('slow');
  });
});
