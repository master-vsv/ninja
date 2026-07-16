import { describe, it, expect } from 'vitest';
import { LifeState, MAX_LIVES } from '../game/LifeState';

/**
 * Тесты LifeState (фаза 4) — pure-logic стейт-машины жизней.
 *
 * Правила из плана (раздел «Дизайн failstate»):
 *   - начальное lives=3 (MAX_LIVES=3);
 *   - труба упущена (isBomb=true) → ШТРАФА НЕТ (мина, не цель);
 *   - обычный объект упущен (isBomb=false) → lives-1;
 *   - при lives<=0 → gameOver=true;
 *   - reset() → 3.
 *
 * Модуль НЕ зависит от Phaser — тестируется в чистом окружении.
 */

describe('LifeState / конструктор', () => {
  it('начальное lives=3', () => {
    const s = new LifeState();
    expect(s.lives).toBe(3);
  });

  it('MAX_LIVES экспортирован = 3', () => {
    expect(MAX_LIVES).toBe(3);
  });

  it('gameOver=false в начальном состоянии', () => {
    const s = new LifeState();
    expect(s.gameOver).toBe(false);
  });

  it('поддерживает каставиное начальное lives (для тестов/экспериментов)', () => {
    const s = new LifeState(2);
    expect(s.lives).toBe(2);
  });
});

describe('LifeState.applyMiss — труба упущена (isBomb=true)', () => {
  it('труба упущена → без штрафа, lives не меняется', () => {
    const s = new LifeState();
    const result = s.applyMiss('pipe', true);
    expect(s.lives).toBe(3);
    expect(result.lives).toBe(3);
    expect(result.gameOver).toBe(false);
  });

  it('труба упущена при 1 жизни → lives остаётся 1, gameOver=false', () => {
    const s = new LifeState(1);
    const result = s.applyMiss('pipe', true);
    expect(s.lives).toBe(1);
    expect(result.gameOver).toBe(false);
  });
});

describe('LifeState.applyMiss — обычный объект упущен (isBomb=false)', () => {
  it('bolt упущен → lives 3→2, gameOver=false', () => {
    const s = new LifeState();
    const result = s.applyMiss('bolt', false);
    expect(s.lives).toBe(2);
    expect(result.lives).toBe(2);
    expect(result.gameOver).toBe(false);
  });

  it('nut упущен → lives-1', () => {
    const s = new LifeState();
    s.applyMiss('nut', false);
    expect(s.lives).toBe(2);
  });

  it('ruler упущен → lives-1', () => {
    const s = new LifeState();
    s.applyMiss('ruler', false);
    expect(s.lives).toBe(2);
  });

  it('standard упущен → lives-1', () => {
    const s = new LifeState();
    s.applyMiss('standard', false);
    expect(s.lives).toBe(2);
  });

  it('несколько промахов суммируются: 3→2→1→0', () => {
    const s = new LifeState();
    s.applyMiss('bolt', false);
    expect(s.lives).toBe(2);
    s.applyMiss('nut', false);
    expect(s.lives).toBe(1);
    const result = s.applyMiss('ruler', false);
    expect(s.lives).toBe(0);
    expect(result.lives).toBe(0);
    expect(result.gameOver).toBe(true);
  });
});

describe('LifeState.applyMiss — переход в gameOver', () => {
  it('при lives=1 один промах → lives=0, gameOver=true', () => {
    const s = new LifeState(1);
    const result = s.applyMiss('bolt', false);
    expect(s.lives).toBe(0);
    expect(s.gameOver).toBe(true);
    expect(result.gameOver).toBe(true);
  });

  it('gameOver остаётся true при последующих промахах (нет отрицательных жизней)', () => {
    const s = new LifeState(1);
    s.applyMiss('bolt', false);
    expect(s.gameOver).toBe(true);
    // Последующий промах не уводит lives в минус.
    const result = s.applyMiss('nut', false);
    expect(s.lives).toBe(0);
    expect(result.gameOver).toBe(true);
  });

  it('труба не может перевести в gameOver (даже при lives=1)', () => {
    const s = new LifeState(1);
    s.applyMiss('pipe', true);
    expect(s.lives).toBe(1);
    expect(s.gameOver).toBe(false);
  });
});

describe('LifeState.reset', () => {
  it('reset возвращает lives=3', () => {
    const s = new LifeState();
    s.applyMiss('bolt', false);
    s.applyMiss('nut', false);
    expect(s.lives).toBe(1);
    s.reset();
    expect(s.lives).toBe(3);
  });

  it('reset сбрасывает gameOver=false', () => {
    const s = new LifeState(1);
    s.applyMiss('bolt', false);
    expect(s.gameOver).toBe(true);
    s.reset();
    expect(s.gameOver).toBe(false);
  });

  it('после reset обычный промах снова уменьшает lives', () => {
    const s = new LifeState(1);
    s.applyMiss('bolt', false);
    s.reset();
    const result = s.applyMiss('nut', false);
    expect(s.lives).toBe(2);
    expect(result.gameOver).toBe(false);
  });
});

describe('LifeState.loseLife — разрез трубы-бомбы', () => {
  // loseLife отличается от applyMiss: применяется при разрезе трубы-бомбы
  // (взрыв отнимает жизнь), а не при упущенном объекте. ВСЕГДА уменьшает lives
  // на 1 — это штраф за разрез мины.

  it('loseLife отнимает 1 жизнь (3→2), gameOver=false', () => {
    const s = new LifeState();
    const result = s.loseLife();
    expect(s.lives).toBe(2);
    expect(result.lives).toBe(2);
    expect(result.gameOver).toBe(false);
    expect(s.gameOver).toBe(false);
  });

  it('loseLife до 0 → lives=0, gameOver=true', () => {
    const s = new LifeState(1);
    const result = s.loseLife();
    expect(s.lives).toBe(0);
    expect(result.lives).toBe(0);
    expect(result.gameOver).toBe(true);
    expect(s.gameOver).toBe(true);
  });

  it('после gameOver состояние заморожено: loseLife не уменьшает lives и не меняет gameOver', () => {
    const s = new LifeState(1);
    s.loseLife();
    expect(s.gameOver).toBe(true);
    expect(s.lives).toBe(0);

    // Повторный loseLife после gameOver — состояние не меняется.
    const result = s.loseLife();
    expect(s.lives).toBe(0);
    expect(s.gameOver).toBe(true);
    expect(result.lives).toBe(0);
    expect(result.gameOver).toBe(true);
  });

  it('clamp на 0: многократный loseLife не уходит в минус', () => {
    const s = new LifeState(2);
    s.loseLife();
    expect(s.lives).toBe(1);
    s.loseLife();
    expect(s.lives).toBe(0);
    // Дальнейшие вызовы не уводят lives в отрицательные значения.
    s.loseLife();
    expect(s.lives).toBe(0);
    s.loseLife();
    expect(s.lives).toBe(0);
  });

  it('reset после loseLife возвращает lives=MAX_LIVES, gameOver=false', () => {
    const s = new LifeState(2);
    s.loseLife();
    s.loseLife();
    expect(s.lives).toBe(0);
    expect(s.gameOver).toBe(true);

    s.reset();
    expect(s.lives).toBe(MAX_LIVES);
    expect(s.gameOver).toBe(false);
  });

  it('loseLife НЕ влияет на applyMiss — раздельные методы с независимыми эффектами', () => {
    // loseLife уменьшает от разреза трубы; applyMiss — от упущенного объекта.
    // Проверяем что loseLife не «пачкает» логику applyMiss (например, для трубы).
    const s = new LifeState();
    // Разрез трубы-бомбы: -1 жизнь.
    s.loseLife();
    expect(s.lives).toBe(2);

    // Упущенная труба-бомба (isBomb=true) по-прежнему НЕ штрафует.
    const result = s.applyMiss('pipe', true);
    expect(result.lives).toBe(2);
    expect(result.gameOver).toBe(false);
    expect(s.lives).toBe(2);

    // Упущенный обычный объект по-прежнему даёт -1.
    s.applyMiss('bolt', false);
    expect(s.lives).toBe(1);
  });

  it('loseLife возвращает корректный контракт { lives, gameOver }', () => {
    const s = new LifeState(3);
    const result = s.loseLife();
    expect(result).toEqual({ lives: 2, gameOver: false });
  });
});

describe('LifeState — возвращаемое значение контракта', () => {
  it('applyMiss возвращает объект { lives, gameOver }', () => {
    const s = new LifeState();
    const result = s.applyMiss('bolt', false);
    expect(result).toEqual({ lives: 2, gameOver: false });
  });

  it('applyMiss для трубы возвращает unchanged-state', () => {
    const s = new LifeState();
    const result = s.applyMiss('pipe', true);
    expect(result).toEqual({ lives: 3, gameOver: false });
  });
});

/**
 * Тесты gainLife — фича «комбо увеличивает здоровье» (фаза NDT-Ninja features).
 *
 * Контракт:
 *   - gainLife(amount) добавляет жизни, ограниченные сверху MAX_LIVES;
 *   - возвращает { lives, gained } — gained = сколько реально прибавилось;
 *   - после gameOver состояние заморожено (gained=0);
 *   - amount <= 0 → no-op.
 *
 * Применение: ScoreSystem вызывает gainLife(1) при комбо, кратном 5.
 */
describe('LifeState.gainLife — восстановление жизней', () => {
  it('gainLife(1) при lives=2 → lives=3, gained=1', () => {
    const s = new LifeState(2);
    const result = s.gainLife(1);
    expect(s.lives).toBe(3);
    expect(result).toEqual({ lives: 3, gained: 1 });
  });

  it('gainLife(1) при lives=3 (MAX_LIVES) → clamp, gained=0', () => {
    const s = new LifeState();
    const result = s.gainLife(1);
    expect(s.lives).toBe(MAX_LIVES);
    expect(result.lives).toBe(MAX_LIVES);
    expect(result.gained).toBe(0);
  });

  it('gainLife НЕ превышает MAX_LIVES: с lives=2 gainLife(5) → lives=3, gained=1', () => {
    const s = new LifeState(2);
    const result = s.gainLife(5);
    expect(s.lives).toBe(MAX_LIVES);
    expect(result.gained).toBe(1);
  });

  it('gainLife(2) при lives=1 → lives=3 (clamp), gained=2', () => {
    const s = new LifeState(1);
    const result = s.gainLife(2);
    expect(s.lives).toBe(3);
    expect(result.gained).toBe(2);
  });

  it('gainLife после серии потерь восстанавливает жизнь', () => {
    const s = new LifeState();
    s.applyMiss('bolt', false); // 3→2
    s.applyMiss('nut', false); // 2→1
    expect(s.lives).toBe(1);
    const result = s.gainLife(1);
    expect(s.lives).toBe(2);
    expect(result.gained).toBe(1);
  });

  it('многократный gainLife упирается в MAX_LIVES и не превышает', () => {
    const s = new LifeState(1);
    s.gainLife(1); // 1→2
    s.gainLife(1); // 2→3
    expect(s.lives).toBe(MAX_LIVES);
    // Дальнейшие вызовы не добавляют (уже на потолке).
    const result = s.gainLife(1);
    expect(s.lives).toBe(MAX_LIVES);
    expect(result.gained).toBe(0);
  });

  it('gainLife(0) → no-op (нечего добавлять)', () => {
    const s = new LifeState(2);
    const result = s.gainLife(0);
    expect(s.lives).toBe(2);
    expect(result.gained).toBe(0);
  });

  it('gainLife с отрицательным amount → no-op', () => {
    const s = new LifeState(2);
    const result = s.gainLife(-3);
    expect(s.lives).toBe(2);
    expect(result.gained).toBe(0);
  });

  it('после gameOver gainLife заморожен: gained=0, lives не меняется', () => {
    const s = new LifeState(1);
    s.applyMiss('bolt', false); // → lives=0, gameOver=true
    expect(s.gameOver).toBe(true);
    const result = s.gainLife(1);
    expect(s.lives).toBe(0);
    expect(s.gameOver).toBe(true);
    expect(result.gained).toBe(0);
  });

  it('gainLife НЕ сбрасывает gameOver (даже если lives стали бы > 0)', () => {
    const s = new LifeState(1);
    s.applyMiss('bolt', false); // gameOver, lives=0
    s.gainLife(3);
    expect(s.gameOver).toBe(true);
    expect(s.lives).toBe(0);
  });

  it('reset после gainLife возвращает lives=MAX_LIVES, gameOver=false', () => {
    const s = new LifeState(1);
    s.gainLife(1); // 1→2
    s.reset();
    expect(s.lives).toBe(MAX_LIVES);
    expect(s.gameOver).toBe(false);
  });
});
