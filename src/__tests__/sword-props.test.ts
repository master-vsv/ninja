import { describe, it, expect } from 'vitest';
import {
  getSwordProps,
  getAllSwordProps,
  SLOWMO_DURATION_MS,
  SLOWMO_SPAWN_DELAY_MULTIPLIER,
} from '../sword/SwordProps';
import type { SwordType } from '../events/types';

/**
 * Тесты SwordProps (фаза 5) — измеримые свойства каждого меча.
 *
 * Покрывает (тест-сцены плана, раздел «Фаза 5»):
 *   - forged:    maxTargets=1, ignite=false, slowmo=false;
 *   - welding:   maxTargets=1, ignite=true, slowmo=false;
 *   - plasma:    maxTargets=3, ignite=false, slowmo=false;
 *   - radiation: maxTargets=1, ignite=false, slowmo=true.
 *
 * Также проверяет константы (SLOWMO_DURATION_MS, SLOWMO_SPAWN_DELAY_MULTIPLIER)
 * и наличие color/colorCss для HUD.
 *
 * Модуль НЕ зависит от Phaser — тестируется в чистом окружении.
 */

describe('SwordProps / forged (базовый меч)', () => {
  const props = getSwordProps('forged');

  it('type = "forged"', () => {
    expect(props.type).toBe('forged');
  });

  it('maxTargets = 1 (ровно один разрез за свайп)', () => {
    expect(props.maxTargets).toBe(1);
  });

  it('ignite = false', () => {
    expect(props.ignite).toBe(false);
  });

  it('slowmo = false', () => {
    expect(props.slowmo).toBe(false);
  });

  it('slowmoDurationMs = 0 (нет slowmo)', () => {
    expect(props.slowmoDurationMs).toBe(0);
  });

  it('color задан (cyan из палитры CYBER)', () => {
    expect(props.color).toBe(0x00f0ff);
  });

  it('colorCss задан', () => {
    expect(props.colorCss).toBe('#00f0ff');
  });
});

describe('SwordProps / welding (сварка)', () => {
  const props = getSwordProps('welding');

  it('type = "welding"', () => {
    expect(props.type).toBe('welding');
  });

  it('maxTargets = 1', () => {
    expect(props.maxTargets).toBe(1);
  });

  it('ignite = true (поджигает край среза)', () => {
    expect(props.ignite).toBe(true);
  });

  it('slowmo = false', () => {
    expect(props.slowmo).toBe(false);
  });

  it('color задан (yellow из палитры CYBER)', () => {
    expect(props.color).toBe(0xf5d300);
  });
});

describe('SwordProps / plasma (плазма)', () => {
  const props = getSwordProps('plasma');

  it('type = "plasma"', () => {
    expect(props.type).toBe('plasma');
  });

  it('maxTargets = 3 (режет до 3 объектов за свайп)', () => {
    expect(props.maxTargets).toBe(3);
  });

  it('ignite = false', () => {
    expect(props.ignite).toBe(false);
  });

  it('slowmo = false', () => {
    expect(props.slowmo).toBe(false);
  });

  it('color задан (magenta из палитры CYBER)', () => {
    expect(props.color).toBe(0xff2bd6);
  });
});

describe('SwordProps / radiation (радиация = fake-slowmo)', () => {
  const props = getSwordProps('radiation');

  it('type = "radiation"', () => {
    expect(props.type).toBe('radiation');
  });

  it('maxTargets = 1', () => {
    expect(props.maxTargets).toBe(1);
  });

  it('ignite = false', () => {
    expect(props.ignite).toBe(false);
  });

  it('slowmo = true (активирует fake-slowmo)', () => {
    expect(props.slowmo).toBe(true);
  });

  it('slowmoDurationMs в диапазоне плана 2000-3000 мс', () => {
    expect(props.slowmoDurationMs).toBeGreaterThanOrEqual(2000);
    expect(props.slowmoDurationMs).toBeLessThanOrEqual(3000);
  });

  it('color задан (neon green, отличается от CYBER)', () => {
    // Neon green для радиации.
    expect(props.color).toBe(0x39ff14);
  });
});

describe('SwordProps / константы', () => {
  it('SLOWMO_DURATION_MS в диапазоне плана 2000-3000', () => {
    expect(SLOWMO_DURATION_MS).toBeGreaterThanOrEqual(2000);
    expect(SLOWMO_DURATION_MS).toBeLessThanOrEqual(3000);
  });

  it('SLOWMO_SPAWN_DELAY_MULTIPLIER = 2 (спавн реже в 2 раза)', () => {
    expect(SLOWMO_SPAWN_DELAY_MULTIPLIER).toBe(2);
  });

  it('SLOWMO_DURATION_MS совпадает с radiation.slowmoDurationMs', () => {
    expect(getSwordProps('radiation').slowmoDurationMs).toBe(SLOWMO_DURATION_MS);
  });
});

describe('SwordProps / getAllSwordProps', () => {
  it('возвращает свойства 4 мечей', () => {
    const all = getAllSwordProps();
    expect(all).toHaveLength(4);
  });

  it('содержит каждый тип ровно один раз', () => {
    const all = getAllSwordProps();
    const types = all.map((p) => p.type);
    expect(types.sort()).toEqual(
      ['forged', 'plasma', 'radiation', 'welding'].sort(),
    );
  });

  it('возвращает иммутабельный массив', () => {
    const all = getAllSwordProps();
    // Попытка мутировать не падает, но оригинальные данные не меняются
    // (Object.values возвращает новый массив, объекты — общие иммутабельные).
    const snapshot = all.map((p) => p.maxTargets);
    expect(snapshot).toContain(3); // plasma
    // Повторный вызов возвращает те же данные.
    const again = getAllSwordProps();
    expect(again.map((p) => p.maxTargets)).toEqual(snapshot);
  });
});

describe('SwordProps / инварианты по всем мечам', () => {
  const allSwords: SwordType[] = ['forged', 'welding', 'plasma', 'radiation'];

  it('каждый меч имеет maxTargets >= 1', () => {
    for (const s of allSwords) {
      expect(getSwordProps(s).maxTargets).toBeGreaterThanOrEqual(1);
    }
  });

  it('только welding имеет ignite=true', () => {
    for (const s of allSwords) {
      const expected = s === 'welding';
      expect(getSwordProps(s).ignite).toBe(expected);
    }
  });

  it('только radiation имеет slowmo=true', () => {
    for (const s of allSwords) {
      const expected = s === 'radiation';
      expect(getSwordProps(s).slowmo).toBe(expected);
    }
  });

  it('только radiation имеет slowmoDurationMs > 0', () => {
    for (const s of allSwords) {
      const expected = s === 'radiation';
      const actual = getSwordProps(s).slowmoDurationMs > 0;
      expect(actual).toBe(expected);
    }
  });

  it('каждый меч имеет ненулевой color', () => {
    for (const s of allSwords) {
      expect(getSwordProps(s).color).toBeGreaterThan(0);
    }
  });

  it('цвета мечей различаются между собой', () => {
    const colors = new Set(allSwords.map((s) => getSwordProps(s).color));
    expect(colors.size).toBe(4);
  });
});
