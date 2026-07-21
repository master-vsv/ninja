import { describe, it, expect } from 'vitest';
import {
  SwordState,
  SWORD_CYCLE_ORDER,
  DEFAULT_SWORD,
} from '../sword/SwordState';

/**
 * Тесты SwordState (фаза 5) — pure-logic стейт-машины активного меча.
 *
 * Покрывает:
 *   - дефолт и кастомный initial;
 *   - set(sword) — прямое переключение;
 *   - cycle() — циклическое переключение по SWORD_CYCLE_ORDER;
 *   - reset() — возврат к DEFAULT_SWORD;
 *   - идемпотентность повторных set.
 *
 * Модуль НЕ зависит от Phaser — тестируется в чистом окружении.
 */

describe('SwordState / конструктор', () => {
  it('дефолт — forged (DEFAULT_SWORD)', () => {
    const s = new SwordState();
    expect(s.current()).toBe('forged');
  });

  it('DEFAULT_SWORD экспортирован = "forged"', () => {
    expect(DEFAULT_SWORD).toBe('forged');
  });

  it('поддерживает кастомный initial меч', () => {
    const s = new SwordState('plasma');
    expect(s.current()).toBe('plasma');
  });

  it('SWORD_CYCLE_ORDER содержит 4 меча в ожидаемом порядке', () => {
    expect(SWORD_CYCLE_ORDER).toEqual([
      'forged',
      'welding',
      'plasma',
      'radiation',
    ]);
  });
});

describe('SwordState.set', () => {
  it('переключает на указанный меч', () => {
    const s = new SwordState();
    s.set('plasma');
    expect(s.current()).toBe('plasma');
  });

  it('возвращает новый активный меч', () => {
    const s = new SwordState();
    const result = s.set('welding');
    expect(result).toBe('welding');
  });

  it('повторный set того же меча — идемпотентен', () => {
    const s = new SwordState();
    s.set('radiation');
    s.set('radiation');
    expect(s.current()).toBe('radiation');
  });

  it('позволяет переключаться через все 4 меча', () => {
    const s = new SwordState();
    s.set('forged');
    expect(s.current()).toBe('forged');
    s.set('welding');
    expect(s.current()).toBe('welding');
    s.set('plasma');
    expect(s.current()).toBe('plasma');
    s.set('radiation');
    expect(s.current()).toBe('radiation');
  });
});

describe('SwordState.cycle', () => {
  it('cycle из forged → welding', () => {
    const s = new SwordState();
    expect(s.cycle()).toBe('welding');
    expect(s.current()).toBe('welding');
  });

  it('cycle проходит по полному кругу и возвращается к стартовому', () => {
    const s = new SwordState();
    const visited: string[] = [s.current()];
    for (let i = 0; i < 4; i++) {
      visited.push(s.cycle());
    }
    // 4 шага цикла возвращают в исходный меч.
    expect(visited).toEqual([
      'forged',
      'welding',
      'plasma',
      'radiation',
      'forged',
    ]);
  });

  it('cycle работает не из дефолтного старта', () => {
    const s = new SwordState('radiation');
    expect(s.cycle()).toBe('forged');
    expect(s.cycle()).toBe('welding');
  });
});

describe('SwordState.reset', () => {
  it('reset возвращает к DEFAULT_SWORD (forged)', () => {
    const s = new SwordState('plasma');
    s.reset();
    expect(s.current()).toBe('forged');
  });

  it('reset сбрасывает даже после нескольких переключений', () => {
    const s = new SwordState();
    s.set('welding');
    s.set('radiation');
    s.cycle();
    s.reset();
    expect(s.current()).toBe('forged');
  });

  it('reset идемпотентен', () => {
    const s = new SwordState();
    s.reset();
    s.reset();
    expect(s.current()).toBe('forged');
  });

  it('после reset можно снова переключать', () => {
    const s = new SwordState();
    s.set('plasma');
    s.reset();
    expect(s.cycle()).toBe('welding');
  });
});
