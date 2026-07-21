import { describe, it, expect } from 'vitest';
import { SlowmoState } from '../sword/SlowmoState';

/**
 * Тесты SlowmoState (фаза 5) — pure-logic state-machine fake-slowmo.
 *
 * Покрывает:
 *   - activate(durationMs) → active=true, remaining=durationMs;
 *   - update(dtMs) уменьшает remaining;
 *   - update до истечения → остаётся active=true;
 *   - update с превышением → active=false, remaining=0;
 *   - идемпотентность: повторный activate продлевает (берёт max);
 *   - activate(<=0) — no-op;
 *   - update(<=0) — no-op;
 *   - reset() → inactive.
 *
 * ВАЖНО: это FAKE-slowmo. Никакого timeScale здесь нет (риск №9 плана).
 *
 * Модуль НЕ зависит от Phaser — тестируется в чистом окружении.
 */

describe('SlowmoState / начальное состояние', () => {
  it('не активен при создании', () => {
    const s = new SlowmoState();
    expect(s.isActive).toBe(false);
  });

  it('remaining = 0 при создании', () => {
    const s = new SlowmoState();
    expect(s.remainingMs).toBe(0);
  });
});

describe('SlowmoState.activate', () => {
  it('активирует slowmo на durationMs', () => {
    const s = new SlowmoState();
    const result = s.activate(2500);
    expect(result.activated).toBe(true);
    expect(result.remainingMs).toBe(2500);
    expect(s.isActive).toBe(true);
    expect(s.remainingMs).toBe(2500);
  });

  it('activate(0) — no-op, возвращает activated=false', () => {
    const s = new SlowmoState();
    const result = s.activate(0);
    expect(result.activated).toBe(false);
    expect(s.isActive).toBe(false);
  });

  it('activate(отрицательное) — no-op', () => {
    const s = new SlowmoState();
    const result = s.activate(-100);
    expect(result.activated).toBe(false);
    expect(s.isActive).toBe(false);
  });

  it('повторный activate ПРОДЛЕВАЕТ (берёт max remaining)', () => {
    const s = new SlowmoState();
    s.activate(1000);
    expect(s.remainingMs).toBe(1000);
    // Продление меньшим — не уменьшает.
    s.activate(500);
    expect(s.remainingMs).toBe(1000);
    // Продление большим — увеличивает.
    s.activate(3000);
    expect(s.remainingMs).toBe(3000);
  });

  it('повторный activate после истечения реактивирует', () => {
    const s = new SlowmoState();
    s.activate(100);
    s.update(100); // истёк
    expect(s.isActive).toBe(false);
    s.activate(500);
    expect(s.isActive).toBe(true);
    expect(s.remainingMs).toBe(500);
  });
});

describe('SlowmoState.update', () => {
  it('уменьшает remaining на dt', () => {
    const s = new SlowmoState();
    s.activate(1000);
    s.update(300);
    expect(s.remainingMs).toBe(700);
    expect(s.isActive).toBe(true);
  });

  it('несколько update подряд корректно суммируют dt', () => {
    const s = new SlowmoState();
    s.activate(1000);
    s.update(200);
    s.update(300);
    s.update(100);
    expect(s.remainingMs).toBe(400);
    expect(s.isActive).toBe(true);
  });

  it('при истечении remaining → isActive=false', () => {
    const s = new SlowmoState();
    s.activate(500);
    s.update(500);
    expect(s.remainingMs).toBe(0);
    expect(s.isActive).toBe(false);
  });

  it('при превышении remaining → remaining=0 (не отрицательное)', () => {
    const s = new SlowmoState();
    s.activate(500);
    s.update(1500);
    expect(s.remainingMs).toBe(0);
    expect(s.isActive).toBe(false);
  });

  it('update после истечения — no-op (остаётся inactive)', () => {
    const s = new SlowmoState();
    s.activate(100);
    s.update(100);
    expect(s.isActive).toBe(false);
    s.update(50);
    expect(s.isActive).toBe(false);
    expect(s.remainingMs).toBe(0);
  });

  it('update(0) — no-op', () => {
    const s = new SlowmoState();
    s.activate(1000);
    s.update(0);
    expect(s.remainingMs).toBe(1000);
    expect(s.isActive).toBe(true);
  });

  it('update(отрицательное) — no-op', () => {
    const s = new SlowmoState();
    s.activate(1000);
    s.update(-50);
    expect(s.remainingMs).toBe(1000);
    expect(s.isActive).toBe(true);
  });

  it('update на неактивном стейте — no-op', () => {
    const s = new SlowmoState();
    s.update(500);
    expect(s.isActive).toBe(false);
    expect(s.remainingMs).toBe(0);
  });
});

describe('SlowmoState.reset', () => {
  it('принудительно сбрасывает active в false', () => {
    const s = new SlowmoState();
    s.activate(2500);
    s.reset();
    expect(s.isActive).toBe(false);
    expect(s.remainingMs).toBe(0);
  });

  it('идемпотентен', () => {
    const s = new SlowmoState();
    s.reset();
    s.reset();
    expect(s.isActive).toBe(false);
    expect(s.remainingMs).toBe(0);
  });

  it('после reset можно снова активировать', () => {
    const s = new SlowmoState();
    s.activate(1000);
    s.reset();
    const result = s.activate(500);
    expect(result.activated).toBe(true);
    expect(s.isActive).toBe(true);
    expect(s.remainingMs).toBe(500);
  });
});

describe('SlowmoState / полный жизненный цикл', () => {
  it('активация → несколько update → истечение → реактивация', () => {
    const s = new SlowmoState();
    // Активация на 1000 мс.
    s.activate(1000);
    expect(s.isActive).toBe(true);
    // Тикаем 600 мс — ещё активен.
    s.update(600);
    expect(s.isActive).toBe(true);
    expect(s.remainingMs).toBe(400);
    // Тикаем ещё 500 — истёк (400+100 лишних).
    s.update(500);
    expect(s.isActive).toBe(false);
    expect(s.remainingMs).toBe(0);
    // Реактивация.
    s.activate(2000);
    expect(s.isActive).toBe(true);
    expect(s.remainingMs).toBe(2000);
  });
});
