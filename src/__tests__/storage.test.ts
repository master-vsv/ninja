import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Storage, HI_SCORE_STORAGE_KEY } from '../persistence/Storage';

/**
 * Тесты Storage (фаза 4) — обёртки над localStorage с try/catch + версионированием.
 *
 * Требования из плана:
 *   - getHiScore()/setHiScore();
 *   - updateHiScore(newScore) → max(текущий, newScore), возвращает итог;
 *   - ключ 'ndt-ninja:hi-score:v1' (версионированный);
 *   - приватный режим / quota exceeded → НЕ падать (try/catch), возвращать 0 / глотать запись;
 *   - инжектируемый storage (по умолчанию globalThis.localStorage) — для mock в тестах.
 *
 * Модуль НЕ зависит от Phaser.
 */

/** Минимальный typed-Storage для тестов. */
interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** In-memory mock storage для детерминированных тестов. */
function makeMemoryStorage(): StorageLike & { dump(): Map<string, string> } {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
    dump: () => map,
  };
}

/** Mock storage, который выбрасывает при любом доступе (имитация приватного режима). */
function makeThrowingStorage(): StorageLike {
  return {
    getItem: () => {
      throw new Error('SecurityError: localStorage disabled');
    },
    setItem: () => {
      throw new Error('QuotaExceededError');
    },
    removeItem: () => {
      throw new Error('SecurityError');
    },
  };
}

describe('Storage / версионированный ключ', () => {
  it('HI_SCORE_STORAGE_KEY = "ndt-ninja:hi-score:v1"', () => {
    expect(HI_SCORE_STORAGE_KEY).toBe('ndt-ninja:hi-score:v1');
  });
});

describe('Storage / getHiScore', () => {
  let memStore: ReturnType<typeof makeMemoryStorage>;

  beforeEach(() => {
    memStore = makeMemoryStorage();
  });

  it('возвращает 0, если записи нет', () => {
    const storage = new Storage(memStore);
    expect(storage.getHiScore()).toBe(0);
  });

  it('возвращает ранее сохранённое значение', () => {
    memStore.setItem(HI_SCORE_STORAGE_KEY, JSON.stringify(12345));
    const storage = new Storage(memStore);
    expect(storage.getHiScore()).toBe(12345);
  });

  it('возвращает 0 при повреждённых данных (невалидный JSON)', () => {
    memStore.setItem(HI_SCORE_STORAGE_KEY, 'not-a-number-{');
    const storage = new Storage(memStore);
    expect(storage.getHiScore()).toBe(0);
  });

  it('возвращает 0, если storage выбрасывает (приватный режим)', () => {
    const storage = new Storage(makeThrowingStorage());
    expect(storage.getHiScore()).toBe(0);
  });
});

describe('Storage / setHiScore', () => {
  let memStore: ReturnType<typeof makeMemoryStorage>;

  beforeEach(() => {
    memStore = makeMemoryStorage();
  });

  it('сохраняет значение под версионированным ключом', () => {
    const storage = new Storage(memStore);
    const ok = storage.setHiScore(500);
    expect(ok).toBe(true);
    expect(memStore.dump().get(HI_SCORE_STORAGE_KEY)).toBe(JSON.stringify(500));
  });

  it('возвращает false, если storage выбрасывает (quota exceeded)', () => {
    const storage = new Storage(makeThrowingStorage());
    const ok = storage.setHiScore(500);
    expect(ok).toBe(false);
  });

  it('не падает при выбросе исключения из setItem', () => {
    const storage = new Storage(makeThrowingStorage());
    expect(() => storage.setHiScore(999)).not.toThrow();
  });
});

describe('Storage / updateHiScore (max)', () => {
  let memStore: ReturnType<typeof makeMemoryStorage>;

  beforeEach(() => {
    memStore = makeMemoryStorage();
  });

  it('при пустом storage: записывает newScore, возвращает newScore', () => {
    const storage = new Storage(memStore);
    const result = storage.updateHiScore(100);
    expect(result).toBe(100);
    expect(storage.getHiScore()).toBe(100);
  });

  it('newScore > текущего: обновляет и возвращает newScore', () => {
    memStore.setItem(HI_SCORE_STORAGE_KEY, JSON.stringify(80));
    const storage = new Storage(memStore);
    const result = storage.updateHiScore(120);
    expect(result).toBe(120);
    expect(storage.getHiScore()).toBe(120);
  });

  it('newScore < текущего: НЕ обновляет, возвращает текущий', () => {
    memStore.setItem(HI_SCORE_STORAGE_KEY, JSON.stringify(200));
    const storage = new Storage(memStore);
    const result = storage.updateHiScore(100);
    expect(result).toBe(200);
    expect(storage.getHiScore()).toBe(200);
  });

  it('newScore === текущему: возвращает то же значение', () => {
    memStore.setItem(HI_SCORE_STORAGE_KEY, JSON.stringify(150));
    const storage = new Storage(memStore);
    const result = storage.updateHiScore(150);
    expect(result).toBe(150);
  });

  it('newScore = 0: НЕ обновляет, если уже 0 (no-op)', () => {
    const storage = new Storage(memStore);
    const result = storage.updateHiScore(0);
    expect(result).toBe(0);
    expect(storage.getHiScore()).toBe(0);
  });

  it('отрицательный newScore: не ломает инвариант (остаётся текущий)', () => {
    memStore.setItem(HI_SCORE_STORAGE_KEY, JSON.stringify(50));
    const storage = new Storage(memStore);
    const result = storage.updateHiScore(-10);
    expect(result).toBe(50);
  });

  it('при throwing storage возвращает newScore (если > 0), не падает', () => {
    const storage = new Storage(makeThrowingStorage());
    // Текущий = 0 (getHiScore глотает исключение), newScore=42 → max(0,42)=42.
    const result = storage.updateHiScore(42);
    expect(result).toBe(42);
  });
});

describe('Storage / инжектируемая зависимость', () => {
  it('по умолчанию использует globalThis.localStorage', () => {
    // В Vitest jsdom localStorage доступен — проверяем что конструктор без аргументов не падает.
    const storage = new Storage();
    expect(typeof storage.getHiScore()).toBe('number');
  });

  it('использует инжектированный mock (предпочтительнее globalThis)', () => {
    const mem = makeMemoryStorage();
    mem.setItem(HI_SCORE_STORAGE_KEY, JSON.stringify(777));
    const storage = new Storage(mem);
    expect(storage.getHiScore()).toBe(777);
  });

  it('setHiScore пишет именно в инжектированный storage', () => {
    const mem = makeMemoryStorage();
    const storage = new Storage(mem);
    storage.setHiScore(42);
    expect(mem.dump().get(HI_SCORE_STORAGE_KEY)).toBe(JSON.stringify(42));
  });
});

describe('Storage /изоляция между тестами (globalThis)', () => {
  beforeEach(() => {
    // Чистим globalThis localStorage чтобы тесты не влияли друг на друга.
    try {
      globalThis.localStorage?.removeItem(HI_SCORE_STORAGE_KEY);
    } catch {
      // ignore
    }
  });

  afterEach(() => {
    try {
      globalThis.localStorage?.removeItem(HI_SCORE_STORAGE_KEY);
    } catch {
      // ignore
    }
  });

  it('default-storage переживает round-trip через globalThis localStorage', () => {
    const storage = new Storage();
    storage.setHiScore(31415);
    const storage2 = new Storage();
    expect(storage2.getHiScore()).toBe(31415);
  });
});

describe('Storage / spy: гарантируем что setItem вызывается', () => {
  it('setHiScore вызывает setItem с правильным ключом и значением', () => {
    const mem = makeMemoryStorage();
    const setItemSpy = vi.spyOn(mem, 'setItem');
    const storage = new Storage(mem);
    storage.setHiScore(99);
    expect(setItemSpy).toHaveBeenCalledWith(HI_SCORE_STORAGE_KEY, JSON.stringify(99));
  });

  it('getHiScore вызывает getItem с правильным ключом', () => {
    const mem = makeMemoryStorage();
    const getItemSpy = vi.spyOn(mem, 'getItem');
    const storage = new Storage(mem);
    storage.getHiScore();
    expect(getItemSpy).toHaveBeenCalledWith(HI_SCORE_STORAGE_KEY);
  });
});
