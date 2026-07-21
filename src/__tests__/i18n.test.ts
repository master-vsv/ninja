import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  I18n,
  i18n,
  TRANSLATIONS,
  LANG_STORAGE_KEY,
  type Lang,
  type StorageLike,
} from '../i18n/I18n';

/**
 * Тесты I18n (локализация RU/EN) — чистая логика без Phaser.
 *
 * Требования из плана:
 *   - type Lang = 'ru' | 'en';
 *   - TRANSLATIONS — словарь для обоих языков с одинаковым набором ключей;
 *   - class I18n: getLang/setLang, t(key, params?) с подстановкой {n};
 *   - default 'ru';
 *   - сохранение в localStorage (ключ 'ndt-ninja:lang:v1', try/catch);
 *   - fallback на ключ если перевода нет;
 *   - синглтон i18n.
 */

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

/** Mock storage, выбрасывающий при любом доступе (имитация приватного режима). */
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

describe('I18n / TRANSLATIONS словарь', () => {
  it('содержит ровно два языка: ru и en', () => {
    expect(Object.keys(TRANSLATIONS).sort()).toEqual(['en', 'ru']);
  });

  it('наборы ключей в ru и en совпадают', () => {
    const ruKeys = Object.keys(TRANSLATIONS.ru).sort();
    const enKeys = Object.keys(TRANSLATIONS.en).sort();
    expect(enKeys).toEqual(ruKeys);
  });

  it('покрывает все основные тексты игры', () => {
    const required = [
      'title',
      'subtitle',
      'play',
      'hiScore',
      'sound',
      'soundOff',
      'language',
      'wave',
      'level',
      'combo',
      'gameOver',
      'reasonBomb',
      'reasonNoLives',
      'score',
      'hi',
      'livesLeft',
      'restart',
      'newRecord',
      'swordHint',
      'benchmarkBtn',
      'benchmarkHint',
    ];
    for (const key of required) {
      expect(TRANSLATIONS.ru[key]).toBeTruthy();
      expect(TRANSLATIONS.en[key]).toBeTruthy();
    }
  });
});

describe('I18n / ключ storage', () => {
  it("LANG_STORAGE_KEY = 'ndt-ninja:lang:v1'", () => {
    expect(LANG_STORAGE_KEY).toBe('ndt-ninja:lang:v1');
  });
});

describe('I18n / default', () => {
  it("по умолчанию язык 'ru'", () => {
    const i = new I18n(makeMemoryStorage());
    expect(i.getLang()).toBe('ru');
  });

  it('при пустом storage — lang=ru', () => {
    const i = new I18n(makeMemoryStorage());
    expect(i.getLang()).toBe('ru');
  });
});

describe('I18n / t RU', () => {
  const i = new I18n(makeMemoryStorage(), 'ru');

  it('переводит title (одинаково для обоих языков)', () => {
    expect(i.t('title')).toBe('NDT-NINJA');
  });

  it('переводит play', () => {
    expect(i.t('play')).toBe('ИГРАТЬ');
  });

  it('переводит gameOver', () => {
    expect(i.t('gameOver')).toBe('ИГРА ОКОНЧЕНА');
  });

  it('переводит subtitle', () => {
    expect(i.t('subtitle')).toBe('Режем оборудование. Избегай труб.');
  });

  it('переводит restart', () => {
    expect(i.t('restart')).toBe('ЗАНОВО');
  });

  it('переводит sound / soundOff', () => {
    expect(i.t('sound')).toBe('ЗВУК: ВКЛ');
    expect(i.t('soundOff')).toBe('ЗВУК: ВЫКЛ');
  });
});

describe('I18n / t EN', () => {
  const i = new I18n(makeMemoryStorage(), 'en');

  it('переводит title (одинаково для обоих языков)', () => {
    expect(i.t('title')).toBe('NDT-NINJA');
  });

  it('переводит play', () => {
    expect(i.t('play')).toBe('PLAY');
  });

  it('переводит gameOver', () => {
    expect(i.t('gameOver')).toBe('GAME OVER');
  });

  it('переводит subtitle', () => {
    expect(i.t('subtitle')).toBe('Slice the hardware. Avoid the pipes.');
  });

  it('переводит restart', () => {
    expect(i.t('restart')).toBe('RESTART');
  });

  it('переводит sound / soundOff', () => {
    expect(i.t('sound')).toBe('SOUND: ON');
    expect(i.t('soundOff')).toBe('SOUND: OFF');
  });
});

describe('I18n / setLang', () => {
  it('переключает ru → en', () => {
    const i = new I18n(makeMemoryStorage(), 'ru');
    i.setLang('en');
    expect(i.getLang()).toBe('en');
    expect(i.t('play')).toBe('PLAY');
  });

  it('переключает en → ru', () => {
    const i = new I18n(makeMemoryStorage(), 'en');
    i.setLang('ru');
    expect(i.getLang()).toBe('ru');
    expect(i.t('play')).toBe('ИГРАТЬ');
  });

  it('setLang no-op при том же языке (не пишет в storage)', () => {
    const storage = makeMemoryStorage();
    const i = new I18n(storage, 'ru');
    i.setLang('ru');
    expect(i.getLang()).toBe('ru');
    expect(storage.dump().has(LANG_STORAGE_KEY)).toBe(false);
  });

  it('setLang игнорирует некорректные значения', () => {
    const i = new I18n(makeMemoryStorage(), 'ru');
    // @ts-expect-error — намеренно передаём некорректное значение.
    i.setLang('fr');
    expect(i.getLang()).toBe('ru');
  });

  it('после setLang(en) t возвращает английский перевод', () => {
    const i = new I18n(makeMemoryStorage(), 'ru');
    expect(i.t('gameOver')).toBe('ИГРА ОКОНЧЕНА');
    i.setLang('en');
    expect(i.t('gameOver')).toBe('GAME OVER');
  });
});

describe('I18n / подстановка параметров', () => {
  it('ru: wave с параметром {n}', () => {
    const i = new I18n(makeMemoryStorage(), 'ru');
    expect(i.t('wave', { n: 1 })).toBe('ВОЛНА 1');
    expect(i.t('wave', { n: 42 })).toBe('ВОЛНА 42');
  });

  it('en: wave с параметром {n}', () => {
    const i = new I18n(makeMemoryStorage(), 'en');
    expect(i.t('wave', { n: 1 })).toBe('WAVE 1');
    expect(i.t('wave', { n: 7 })).toBe('WAVE 7');
  });

  it('ru: level с параметром', () => {
    const i = new I18n(makeMemoryStorage(), 'ru');
    expect(i.t('level', { n: 3 })).toBe('УРОВЕНЬ 3');
  });

  it('ru: combo с параметром', () => {
    const i = new I18n(makeMemoryStorage(), 'ru');
    expect(i.t('combo', { n: 4 })).toBe('КОМБО ×4');
  });

  it('en: combo с параметром', () => {
    const i = new I18n(makeMemoryStorage(), 'en');
    expect(i.t('combo', { n: 2 })).toBe('COMBO ×2');
  });

  it('ru: hiScore со строковым параметром (zpad)', () => {
    const i = new I18n(makeMemoryStorage(), 'ru');
    expect(i.t('hiScore', { n: '0042' })).toBe('РЕКОРД: 0042');
  });

  it('en: hiScore со строковым параметром (zpad)', () => {
    const i = new I18n(makeMemoryStorage(), 'en');
    expect(i.t('hiScore', { n: '0042' })).toBe('HI-SCORE: 0042');
  });

  it('ru: livesLeft с параметром', () => {
    const i = new I18n(makeMemoryStorage(), 'ru');
    expect(i.t('livesLeft', { n: 2 })).toBe('Осталось жизней: 2');
  });

  it('en: livesLeft с параметром', () => {
    const i = new I18n(makeMemoryStorage(), 'en');
    expect(i.t('livesLeft', { n: 0 })).toBe('Lives left: 0');
  });

  it('числовой параметр приводится к строке', () => {
    const i = new I18n(makeMemoryStorage(), 'ru');
    expect(i.t('wave', { n: 5 })).toBe('ВОЛНА 5');
  });

  it('отсутствующий параметр остаётся как {name}', () => {
    const i = new I18n(makeMemoryStorage(), 'ru');
    expect(i.t('wave', {})).toBe('ВОЛНА {n}');
  });

  it('вызов t без params не пытается подставлять', () => {
    const i = new I18n(makeMemoryStorage(), 'ru');
    // Без params строка с плейсхолдером возвращается как есть.
    expect(i.t('wave')).toBe('ВОЛНА {n}');
  });
});

describe('I18n / fallback на ключ', () => {
  it('несуществующий ключ → возвращает сам ключ (ru)', () => {
    const i = new I18n(makeMemoryStorage(), 'ru');
    expect(i.t('nonexistent.key')).toBe('nonexistent.key');
  });

  it('несуществующий ключ → возвращает сам ключ (en)', () => {
    const i = new I18n(makeMemoryStorage(), 'en');
    expect(i.t('no.such.key')).toBe('no.such.key');
  });

  it('fallback работает с params', () => {
    const i = new I18n(makeMemoryStorage(), 'ru');
    expect(i.t('missing', { x: 1 })).toBe('missing');
  });
});

describe('I18n / localStorage', () => {
  it('сохраняет язык под ключом LANG_STORAGE_KEY при setLang', () => {
    const storage = makeMemoryStorage();
    const i = new I18n(storage, 'ru');
    i.setLang('en');
    expect(storage.dump().get(LANG_STORAGE_KEY)).toBe('en');
  });

  it('загружает язык из storage при создании', () => {
    const storage = makeMemoryStorage();
    storage.setItem(LANG_STORAGE_KEY, 'en');
    const i = new I18n(storage);
    expect(i.getLang()).toBe('en');
  });

  it('загружает ru из storage', () => {
    const storage = makeMemoryStorage();
    storage.setItem(LANG_STORAGE_KEY, 'ru');
    const i = new I18n(storage);
    expect(i.getLang()).toBe('ru');
  });

  it('при повреждённом значении — fallback на ru', () => {
    const storage = makeMemoryStorage();
    storage.setItem(LANG_STORAGE_KEY, 'fr');
    const i = new I18n(storage);
    expect(i.getLang()).toBe('ru');
  });

  it('при выбрасывающем storage — fallback на ru и не падает при setLang', () => {
    const i = new I18n(makeThrowingStorage());
    expect(i.getLang()).toBe('ru');
    expect(() => i.setLang('en')).not.toThrow();
    // Язык в памяти всё равно меняется, даже если storage не записал.
    expect(i.getLang()).toBe('en');
  });

  it('initialLang в конструкторе имеет приоритет над storage', () => {
    const storage = makeMemoryStorage();
    storage.setItem(LANG_STORAGE_KEY, 'en');
    const i = new I18n(storage, 'ru');
    expect(i.getLang()).toBe('ru');
  });
});

describe('I18n / синглтон', () => {
  // Сохраняем и восстанавливаем язык синглтона чтобы тесты были изолированы
  // (синглтон использует globalThis.localStorage).
  let original: Lang;

  beforeEach(() => {
    original = i18n.getLang();
  });

  afterEach(() => {
    i18n.setLang(original);
  });

  it('синглтон i18n доступен и содержит валидный язык', () => {
    expect(i18n).toBeInstanceOf(I18n);
    expect(['ru', 'en']).toContain(i18n.getLang());
  });

  it('синглтон: setLang + t работают согласованно', () => {
    i18n.setLang('ru');
    expect(i18n.getLang()).toBe('ru');
    expect(i18n.t('play')).toBe('ИГРАТЬ');
    i18n.setLang('en');
    expect(i18n.getLang()).toBe('en');
    expect(i18n.t('play')).toBe('PLAY');
  });

  it('синглтон переживёт round-trip через globalThis localStorage', () => {
    // Чистим ключ перед тестом для детерминированности.
    try {
      globalThis.localStorage?.removeItem(LANG_STORAGE_KEY);
    } catch {
      // ignore
    }
    i18n.setLang('en');
    // Новый инстанс с дефолтным storage должен подхватить 'en'.
    const fresh = new I18n();
    expect(fresh.getLang()).toBe('en');
    // Возвращаем чистоту.
    try {
      globalThis.localStorage?.removeItem(LANG_STORAGE_KEY);
    } catch {
      // ignore
    }
  });
});
