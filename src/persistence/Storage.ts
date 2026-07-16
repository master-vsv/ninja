/**
 * Storage (фаза 4) — обёртка над localStorage с try/catch и версионированием.
 *
 * Назначение (план, фаза 4):
 *   - сохранение рекорда между сессиями;
 *   - приватный режим / quota exceeded / повреждённые данные НЕ роняют игру;
 *   - ключи версионированы: ndt-ninja:<name>:v<version>.
 *
 * Инжектируемая зависимость: конструктор принимает любой StorageLike
 * (по умолчанию globalThis.localStorage) — это позволяет тестировать модуль
 * с in-memory mock без привязки к глобальному состоянию браузера.
 *
 * Модуль НЕ зависит от Phaser.
 */

const KEY_PREFIX = 'ndt-ninja';
const HI_SCORE_KEY = 'hi-score';
const DEFAULT_VERSION = 1;

/** Зафиксированный версионированный ключ рекорда. */
export const HI_SCORE_STORAGE_KEY = `${KEY_PREFIX}:${HI_SCORE_KEY}:v${DEFAULT_VERSION}`;

/**
 * Минимальный интерфейс хранилища: подмножество Web Storage API.
 * Соответствует globalThis.localStorage / sessionStorage и любому mock-объекту.
 */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * Безопасное чтение числа из хранилища с try/catch.
 * Бросается — возвращаем fallback.
 */
function safeGetNumber(storage: StorageLike, key: string, fallback: number): number {
  try {
    const raw = storage.getItem(key);
    if (raw === null || raw === undefined) return fallback;
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'number' || !Number.isFinite(parsed)) {
      return fallback;
    }
    return parsed;
  } catch {
    // Приватный режим / повреждённые данные → не падать.
    return fallback;
  }
}

/**
 * Безопасная запись числа в хранилище с try/catch.
 * Возвращает true при успехе, false если storage недоступен (quota/private mode).
 */
function safeSetNumber(storage: StorageLike, key: string, value: number): boolean {
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    // Quota exceeded / приватный режим → глотаем.
    return false;
  }
}

/**
 * Обёртка над localStorage с DI. По умолчанию использует globalThis.localStorage;
 * в тестах инжектируется in-memory mock.
 */
export class Storage {
  private readonly storage: StorageLike;

  constructor(storage: StorageLike = defaultGlobalStorage()) {
    this.storage = storage;
  }

  /**
   * Читает рекорд из хранилища.
   * @returns сохранённое значение или 0, если записи нет / данные повреждены /
   *          storage недоступен (приватный режим).
   */
  getHiScore(): number {
    return safeGetNumber(this.storage, HI_SCORE_STORAGE_KEY, 0);
  }

  /**
   * Записывает рекорд в хранилище.
   * @returns true при успехе, false если storage недоступен / quota exceeded.
   */
  setHiScore(score: number): boolean {
    return safeSetNumber(this.storage, HI_SCORE_STORAGE_KEY, score);
  }

  /**
   * Обновляет рекорд, только если newScore больше текущего.
   * @returns итоговое значение рекорда (max(текущий, newScore)).
   */
  updateHiScore(newScore: number): number {
    const current = this.getHiScore();
    const next = Math.max(current, newScore);
    if (next > current) {
      this.setHiScore(next);
    }
    return next;
  }
}

/**
 * Доступ к globalThis.localStorage с защитой от окружений без DOM (SSR/тесты).
 * Возвращает no-op storage если localStorage отсутствует — методы возвращают
 * null/false как при пустом/недоступном хранилище.
 */
function defaultGlobalStorage(): StorageLike {
  // Проверяем typeof + наличие методов (на случай частичных полифилов).
  if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
    return globalThis.localStorage;
  }
  return {
    getItem: () => null,
    setItem: () => {
      // no-op: storage недоступен.
    },
    removeItem: () => {
      // no-op.
    },
  };
}

/**
 * Дефолтный синглтон-Storage (используется в MenuScene/GameOverScene без DI).
 * В тестах создаются собственные инстансы с mock-storage.
 */
export const defaultStorage = new Storage();
