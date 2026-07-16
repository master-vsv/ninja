import { describe, it, expect, vi } from 'vitest';
import { FragmentPool } from '../perf/FragmentPool';

/**
 * Тесты FragmentPool (фаза 7) — pure-logic пула переиспользуемых объектов.
 *
 * Назначение (план, фаза 7 «полировка + перф»): избежать new/destroy на каждый
 * slice — BodySplitter переиспользует обёртки фрагментов из пула.
 *
 * Контракт:
 *   - acquire() → элемент из пула ИЛИ новый (через factory);
 *   - release(item) → вернуть в пул (true если принят, false если пул полон);
 *   - size ограничен maxPoolSize;
 *   - clear()/reset() — опустошить пул;
 *   - модуль НЕ зависит от Phaser (дженерик по T).
 *
 * Модуль НЕ зависит от Phaser — тестируется в чистом окружении.
 */

/** Фабрика простых объектов для тестов (с id для отслеживания экземпляров). */
let nextId = 0;
function makeFactory(): { factory: () => { id: number; payload: unknown }; created: number } {
  let created = 0;
  const factory = () => {
    created++;
    return { id: ++nextId, payload: null };
  };
  return { factory, get created() { return created; } };
}

describe('FragmentPool / конструктор и размер', () => {
  it('начальный size=0', () => {
    const { factory } = makeFactory();
    const pool = new FragmentPool(factory);
    expect(pool.size).toBe(0);
  });

  it('maxSize по умолчанию > 0', () => {
    const { factory } = makeFactory();
    const pool = new FragmentPool(factory);
    expect(pool.maxSize).toBeGreaterThan(0);
  });

  it('кастомный maxSize сохраняется', () => {
    const { factory } = makeFactory();
    const pool = new FragmentPool(factory, 8);
    expect(pool.maxSize).toBe(8);
  });

  it('maxSize clamp на целое неотрицательное', () => {
    const { factory } = makeFactory();
    const pool = new FragmentPool(factory, -3);
    expect(pool.maxSize).toBeGreaterThanOrEqual(0);
  });
});

describe('FragmentPool / acquire', () => {
  it('acquire на пустом пуле вызывает factory', () => {
    const f = makeFactory();
    const pool = new FragmentPool(f.factory, 4);
    const item = pool.acquire();
    expect(item).toBeDefined();
    expect(f.created).toBe(1);
    expect(pool.size).toBe(0);
  });

  it('acquire возвращает разные экземпляры при пустом пуле', () => {
    const { factory } = makeFactory();
    const pool = new FragmentPool(factory, 4);
    const a = pool.acquire();
    const b = pool.acquire();
    expect(a).not.toBe(b);
  });

  it('acquire после release переиспользует элемент БЕЗ factory', () => {
    const f = makeFactory();
    const pool = new FragmentPool(f.factory, 4);
    const a = pool.acquire();
    expect(f.created).toBe(1);
    pool.release(a);
    expect(pool.size).toBe(1);
    const b = pool.acquire();
    expect(b).toBe(a);
    expect(f.created).toBe(1);
    expect(pool.size).toBe(0);
  });
});

describe('FragmentPool / release', () => {
  it('release увеличивает size', () => {
    const { factory } = makeFactory();
    const pool = new FragmentPool(factory, 4);
    const item = pool.acquire();
    const accepted = pool.release(item);
    expect(accepted).toBe(true);
    expect(pool.size).toBe(1);
  });

  it('release возвращает true пока пул не полон', () => {
    const { factory } = makeFactory();
    const pool = new FragmentPool(factory, 2);
    const a = pool.acquire();
    const b = pool.acquire();
    const c = pool.acquire();
    expect(pool.release(a)).toBe(true);
    expect(pool.release(b)).toBe(true);
    expect(pool.size).toBe(2);
    expect(pool.release(c)).toBe(false);
    expect(pool.size).toBe(2);
  });

  it('release сверх maxSize не увеличивает size', () => {
    const { factory } = makeFactory();
    const pool = new FragmentPool(factory, 1);
    const a = pool.acquire();
    const b = pool.acquire();
    expect(pool.release(a)).toBe(true);
    expect(pool.size).toBe(1);
    expect(pool.release(b)).toBe(false);
    expect(pool.size).toBe(1);
  });

  it('цикл acquire-release переиспользует один экземпляр много раз', () => {
    const f = makeFactory();
    const pool = new FragmentPool(f.factory, 2);
    const first = pool.acquire();
    for (let i = 0; i < 10; i++) {
      pool.release(first);
      const next = pool.acquire();
      expect(next).toBe(first);
    }
    // factory вызвана ровно 1 раз за весь цикл.
    expect(f.created).toBe(1);
  });
});

describe('FragmentPool / LIFO-порядок', () => {
  it('acquire возвращает последний освобождённый (LIFO)', () => {
    const { factory } = makeFactory();
    const pool = new FragmentPool(factory, 4);
    const a = pool.acquire();
    const b = pool.acquire();
    pool.release(a);
    pool.release(b);
    expect(pool.acquire()).toBe(b);
    expect(pool.acquire()).toBe(a);
  });
});

describe('FragmentPool / clear и reset', () => {
  it('clear опустошает пул', () => {
    const { factory } = makeFactory();
    const pool = new FragmentPool(factory, 4);
    const a = pool.acquire();
    const b = pool.acquire();
    pool.release(a);
    pool.release(b);
    expect(pool.size).toBe(2);
    pool.clear();
    expect(pool.size).toBe(0);
  });

  it('после clear acquire снова вызывает factory', () => {
    const f = makeFactory();
    const pool = new FragmentPool(f.factory, 4);
    const a = pool.acquire();
    pool.release(a);
    pool.clear();
    const b = pool.acquire();
    expect(b).not.toBe(a);
    expect(f.created).toBe(2);
  });

  it('reset — алиас для clear (опустошает пул)', () => {
    const { factory } = makeFactory();
    const pool = new FragmentPool(factory, 4);
    const a = pool.acquire();
    const b = pool.acquire();
    pool.release(a);
    pool.release(b);
    expect(pool.size).toBe(2);
    pool.reset();
    expect(pool.size).toBe(0);
  });

  it('clear на пустом пуле — no-op (не падает)', () => {
    const { factory } = makeFactory();
    const pool = new FragmentPool(factory, 4);
    expect(() => pool.clear()).not.toThrow();
    expect(pool.size).toBe(0);
  });
});

describe('FragmentPool / дженерик по T', () => {
  it('работает с массивами как T', () => {
    const pool = new FragmentPool<number[]>(() => [], 2);
    const a = pool.acquire();
    a.push(42);
    pool.release(a);
    const b = pool.acquire();
    expect(b).toBe(a);
    expect(b).toContain(42);
  });

  it('работает с произвольным объектным типом', () => {
    interface Slot { ref: unknown }
    const pool = new FragmentPool<Slot>(() => ({ ref: null }), 2);
    const a = pool.acquire();
    a.ref = 'x';
    pool.release(a);
    const b = pool.acquire();
    expect(b.ref).toBe('x');
  });
});

describe('FragmentPool / edge-кейсы', () => {
  it('release(null) принимается если T допускает null (дженерик не валидирует)', () => {
    const pool = new FragmentPool(() => null, 2);
    const accepted = pool.release(null);
    expect(accepted).toBe(true);
    expect(pool.size).toBe(1);
  });

  it('двойной release одного элемента не детектируется (контракт на стороне владельца)', () => {
    const { factory } = makeFactory();
    const pool = new FragmentPool(factory, 4);
    const a = pool.acquire();
    expect(pool.release(a)).toBe(true);
    expect(pool.release(a)).toBe(true);
    expect(pool.size).toBe(2);
  });
});

describe('FragmentPool / factory не вызывается при наличии свободных', () => {
  it('заполняем пул, потом N acquire — factory вызвана только под заполнение', () => {
    const spy = vi.fn(() => ({}));
    const pool = new FragmentPool(spy, 3);
    const items = [pool.acquire(), pool.acquire(), pool.acquire()];
    expect(spy).toHaveBeenCalledTimes(3);
    for (const it of items) pool.release(it);
    expect(spy).toHaveBeenCalledTimes(3);
    // Повторный acquire из пула — factory не дёргается.
    pool.acquire();
    pool.acquire();
    pool.acquire();
    expect(spy).toHaveBeenCalledTimes(3);
  });
});
