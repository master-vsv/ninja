/**
 * I18n — локализация (RU/EN) для NDT-Ninja.
 *
 * Чистая логика, НЕ зависит от Phaser. Хранит словарь всех текстов игры,
 * текущий язык и делает перевод с подстановкой параметров.
 *
 * Назначение:
 *   - t(key, params?) — перевод ключа с подстановкой параметров вида {name};
 *   - setLang(lang) / getLang() — управление текущим языком;
 *   - язык сохраняется в localStorage (ключ LANG_STORAGE_KEY, try/catch);
 *   - при недоступности/повреждении storage — fallback на 'ru'.
 *
 * Инжектируемая зависимость: конструктор принимает любой StorageLike
 * (по умолчанию globalThis.localStorage) — это позволяет тестировать модуль
 * с in-memory mock без привязки к глобальному состоянию браузера.
 */

/** Поддерживаемые языки. */
export type Lang = 'ru' | 'en';

/** Ключ localStorage для сохранения языка (версионированный). */
export const LANG_STORAGE_KEY = 'ndt-ninja:lang:v1';

/**
 * Минимальный интерфейс хранилища: подмножество Web Storage API.
 * Соответствует globalThis.localStorage / sessionStorage и любому mock-объекту.
 * Дублирует интерфейс из persistence/Storage.ts чтобы модуль i18n оставался
 * автономным (без зависимости от других модулей игры).
 */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Параметры подстановки в перевод: имя-плейсхолдера → значение. */
export type TranslateParams = Record<string, string | number>;

/**
 * Словарь всех переводов игры.
 * Ключи идентичны для обоих языков; набор проверяется тестами.
 *
 * Плейсхолдеры вида {n} подставляются через t(key, { n: value }).
 */
export const TRANSLATIONS: Record<Lang, Record<string, string>> = {
  ru: {
    title: 'NDT-NINJA',
    subtitle: 'Режем оборудование. Избегай труб.',
    play: 'ИГРАТЬ',
    hiScore: 'РЕКОРД: {n}',
    sound: 'ЗВУК: ВКЛ',
    soundOff: 'ЗВУК: ВЫКЛ',
    language: 'ЯЗЫК',
    wave: 'ВОЛНА {n}',
    level: 'УРОВЕНЬ {n}',
    combo: 'КОМБО ×{n}',
    gameOver: 'ИГРА ОКОНЧЕНА',
    reasonBomb: 'Вы разрезали трубу-бомбу',
    reasonNoLives: 'Жизни закончились',
    score: 'СЧЁТ',
    hi: 'РЕК',
    livesLeft: 'Осталось жизней: {n}',
    restart: 'ЗАНОВО',
    newRecord: 'НОВЫЙ!',
    swordHint: '[1-4] МЕЧ  [SPACE] СПОСОБНОСТЬ',
    benchmarkBtn: '[ ЗАПУСТИТЬ БЕНЧМАРК ]',
    benchmarkHint: '(Открой консоль DevTools для отчёта)',
    rules: '[ ПРАВИЛА ]',
    rulesTitle: 'ПРАВИЛА',
    rulesClose: '× ЗАКРЫТЬ',
    rulesSwipe: 'Режь объекты свайпом — зарабатывай очки.',
    rulesBolt: 'Болт: режь, +1 очко.',
    rulesNut: 'Гайка: режь, +1 очко.',
    rulesRuler: 'Линейка: режь, +1 очко.',
    rulesStandard: 'Эталон: режь, +1 очко.',
    rulesProbe: 'УЗ-щуп (UT): режь, +1 очко.',
    rulesMagnet: 'Магнит (MT): режь, +1 очко.',
    rulesPenetrant: 'Пенетрант (PT): режь, +1 очко.',
    rulesPipe: 'Труба-бомба: НЕ резать! Игра окончена.',
    rulesShrink: 'Ромб: уменьшает объекты на 5 сек.',
    rulesGrow: 'Пятиугольник: увеличивает объекты на 5 сек.',
    rulesSlow: 'Кристалл: замедляет время на 5 сек.',
    rulesHelmet: 'Каска: щит, неуязвимость на 5 сек.',
    rulesGoggles: 'Очки: увеличение объектов на 5 сек.',
    rulesWeldingMask: 'Маска сварщика: замедление на 5 сек.',
    rulesForged: 'Кованый: базовый меч (ур. 1).',
    rulesWelding: 'Сварочный: поджигает край (ур. 2).',
    rulesPlasma: 'Плазменный: до 3 целей (ур. 3).',
    rulesRadiation: 'Радиация: замедление 2.5 сек (ур. 4).',
  },
  en: {
    title: 'NDT-NINJA',
    subtitle: 'Slice the hardware. Avoid the pipes.',
    play: 'PLAY',
    hiScore: 'HI-SCORE: {n}',
    sound: 'SOUND: ON',
    soundOff: 'SOUND: OFF',
    language: 'LANGUAGE',
    wave: 'WAVE {n}',
    level: 'LEVEL {n}',
    combo: 'COMBO ×{n}',
    gameOver: 'GAME OVER',
    reasonBomb: 'You sliced a pipe bomb',
    reasonNoLives: 'No lives left',
    score: 'SCORE',
    hi: 'HI',
    livesLeft: 'Lives left: {n}',
    restart: 'RESTART',
    newRecord: 'NEW!',
    swordHint: '[1-4] SWORD  [SPACE] ABILITY',
    benchmarkBtn: '[ RUN BENCHMARK ]',
    benchmarkHint: '(Open DevTools Console for the report)',
    rules: '[ RULES ]',
    rulesTitle: 'RULES',
    rulesClose: '× CLOSE',
    rulesSwipe: 'Slice objects with a swipe — earn points.',
    rulesBolt: 'Bolt: slice it, +1 point.',
    rulesNut: 'Nut: slice it, +1 point.',
    rulesRuler: 'Ruler: slice it, +1 point.',
    rulesStandard: 'Standard: slice it, +1 point.',
    rulesProbe: 'UT Probe: slice it, +1 point.',
    rulesMagnet: 'MT Magnet: slice it, +1 point.',
    rulesPenetrant: 'PT Penetrant: slice it, +1 point.',
    rulesPipe: 'Pipe bomb: DO NOT slice! Game over.',
    rulesShrink: 'Diamond: shrinks objects for 5 sec.',
    rulesGrow: 'Pentagon: enlarges objects for 5 sec.',
    rulesSlow: 'Crystal: slows time for 5 sec.',
    rulesHelmet: 'Helmet: shield for 5 sec.',
    rulesGoggles: 'Goggles: enlarges objects for 5 sec.',
    rulesWeldingMask: 'Welding mask: slows time for 5 sec.',
    rulesForged: 'Forged: basic sword (lvl 1).',
    rulesWelding: 'Welding: ignites edge (lvl 2).',
    rulesPlasma: 'Plasma: up to 3 targets (lvl 3).',
    rulesRadiation: 'Radiation: slowmo 2.5s (lvl 4).',
  },
};

/**
 * Доступ к globalThis.localStorage с защитой от окружений без DOM (SSR/тесты).
 * Возвращает no-op storage если localStorage отсутствует.
 */
function defaultGlobalStorage(): StorageLike {
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
 * Безопасное чтение языка из storage с try/catch.
 * Возвращает 'ru' если значения нет / оно повреждено / storage выбрасывает.
 */
function loadLangFromStorage(storage: StorageLike): Lang {
  try {
    const raw = storage.getItem(LANG_STORAGE_KEY);
    if (raw === 'ru' || raw === 'en') return raw;
    return 'ru';
  } catch {
    // Приватный режим / повреждённые данные → не падать.
    return 'ru';
  }
}

/**
 * Безопасная запись языка в storage с try/catch.
 * Quota exceeded / приватный режим — глушим, не падаем.
 */
function saveLangToStorage(storage: StorageLike, lang: Lang): void {
  try {
    storage.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    // Игнорируем — язык остаётся в памяти на текущую сессию.
  }
}

/**
 * I18n — менеджер локализации.
 *
 * Конструктор читает язык из storage (если не передан initialLang явно —
 * это удобно для тестов). Синглтон `i18n` ниже использует дефолтный storage.
 */
export class I18n {
  private lang: Lang;
  private readonly storage: StorageLike;

  constructor(storage: StorageLike = defaultGlobalStorage(), initialLang?: Lang) {
    this.storage = storage;
    this.lang = initialLang ?? loadLangFromStorage(storage);
  }

  /** Возвращает текущий язык. */
  getLang(): Lang {
    return this.lang;
  }

  /**
   * Устанавливает язык и сохраняет в storage.
   * No-op если передан тот же язык (не пишет в storage лишний раз).
   * Игнорирует некорректные значения.
   */
  setLang(lang: Lang): void {
    if (lang !== 'ru' && lang !== 'en') return;
    if (lang === this.lang) return;
    this.lang = lang;
    saveLangToStorage(this.storage, lang);
  }

  /**
   * Переводит ключ с подстановкой параметров.
   * Плейсхолдеры вида {name} заменяются на значения из params.
   * Если перевод отсутствует — возвращает сам ключ (fallback).
   */
  t(key: string, params?: TranslateParams): string {
    const dict = TRANSLATIONS[this.lang];
    const template = dict[key] ?? key;
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (match, name: string) => {
      const value = params[name];
      return value !== undefined ? String(value) : match;
    });
  }
}

/**
 * Дефолтный синглтон-I18n (используется сценами без DI).
 * Загружает язык из globalThis.localStorage при первом импорте.
 * В тестах создаются собственные инстансы с mock-storage.
 */
export const i18n = new I18n();
