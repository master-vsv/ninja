/**
 * HapticsState (фаза 7) — pure-logic состояние вибро-откликов (navigator.vibrate).
 *
 * Назначение (план, фаза 7): тактильная отдача на мобайл при slice/bomb/gameover.
 * Haptics ОПЦИОНАЛЬНЫЙ: если API недоступно (iOS Safari, desktop-браузеры без
 * поддержки), все вызовы — noop, игра НЕ падает.
 *
 * Feature-detect: navigator.vibrate проверяется в конструкторе (или инжектируемый
 * vibeFn для тестов). canVibrate — readonly флаг доступности.
 *
 * Контракт:
 *   - vibe(pattern) → если canVibrate, вызывает vibeFn; иначе noop (false);
 *   - vibeSlice/vibeBomb/vibeGameover → именованные шаблоны (HAPTIC_PATTERNS);
 *   - callCount — счётчик реальных вызовов (для отладки/аудита);
 *   - reset() — обнуляет счётчик (canVibrate не меняется).
 *
 * Модуль НЕ зависит от Phaser. Phaser-обёртка — systems/HapticsSystem.ts (фаза 7).
 */

/** Тип функции вибрации (совместим с Navigator.vibrate). */
export type VibeFn = (pattern: number | number[]) => boolean;

/** Минимальная фигура navigator для feature-detect. */
export interface NavigatorLike {
  readonly vibrate?: VibeFn;
}

/**
 * Именованные шаблоны вибрации.
 * slice — короткий одиночный (10мс, лёгкий «клик» при разрезе).
 * bomb — длинный пульсирующий (взрыв трубы).
 * gameover — двойной длинный (финальный проигрыш).
 *
 * Свойства readonly (контракт), но массивы — mutable number[] для совместимости
 * с navigator.vibrate(pattern: number | number[]).
 */
export const HAPTIC_PATTERNS: {
  readonly slice: number;
  readonly bomb: number[];
  readonly gameover: number[];
} = {
  slice: 10,
  bomb: [100, 50, 100],
  gameover: [200, 100, 200],
};

/** Опции конструктора HapticsState. */
export interface HapticsStateOptions {
  /**
   * Явная vibe-функция (приоритет над navigator.vibrate). Для тестов.
   * null принудительно отключает вибрацию.
   */
  readonly vibeFn?: VibeFn | null;
  /**
   * Инжектируемый navigator для feature-detect (тесты/SSR).
   * По умолчанию — globalThis.navigator.
   */
  readonly navigator?: NavigatorLike | null;
}

export class HapticsState {
  /** Реально вызываемая vibe-функция (null если API недоступен). */
  private readonly vibeFn: VibeFn | null;
  /** Счётчик вызовов vibeFn (для аудита/тестов; растёт только при canVibrate). */
  private _callCount = 0;

  constructor(options: HapticsStateOptions = {}) {
    // Приоритет: явный vibeFn > navigator.vibrate (инжектируемый > глобальный).
    let fn: VibeFn | null = null;
    if (options.vibeFn !== undefined) {
      fn = options.vibeFn;
    } else {
      const nav =
        options.navigator !== undefined && options.navigator !== null
          ? options.navigator
          : getGlobalNavigator();
      if (nav && typeof nav.vibrate === 'function') {
        // КРИТИЧНО: bind(nav). navigator.vibrate — native API, требует this=navigator.
        // Без bind сохраняется detached-ссылка: fn(pattern) → "Illegal invocation"
        // (TypeError, крашит EventBus.emit при game-over → прерывает flow → «зависает»).
        fn = nav.vibrate.bind(nav);
      }
    }
    this.vibeFn = fn;
  }

  /** true, если vibe-функция доступна (вызовы vibe будут реальны). */
  get canVibrate(): boolean {
    return this.vibeFn !== null;
  }

  /** Число реально выполненных вызовов vibe (0 при canVibrate=false). */
  get callCount(): number {
    return this._callCount;
  }

  /**
   * Вызвать вибрацию с произвольным паттерном.
   * @returns true если вызов выполнен (canVibrate), иначе false (noop).
   *          Возвращаемое значение vibeFn (true/false от платформы) прокидывается.
   */
  vibe(pattern: number | number[]): boolean {
    if (this.vibeFn === null) return false;
    this._callCount++;
    return this.vibeFn(pattern);
  }

  /** Короткая вибрация при разрезе NDT-объекта. */
  vibeSlice(): boolean {
    return this.vibe(HAPTIC_PATTERNS.slice);
  }

  /** Длинная пульсирующая вибрация при разрезе трубы-бомбы. */
  vibeBomb(): boolean {
    return this.vibe(HAPTIC_PATTERNS.bomb);
  }

  /** Двойная длинная вибрация при game over. */
  vibeGameover(): boolean {
    return this.vibe(HAPTIC_PATTERNS.gameover);
  }

  /** Сброс счётчика вызовов. canVibrate НЕ меняется. */
  reset(): void {
    this._callCount = 0;
  }
}

/**
 * Безопасное чтение глобального navigator (защита от SSR/тестов без window).
 * Возвращает минимальную фигуру для feature-detect.
 */
function getGlobalNavigator(): NavigatorLike | null {
  try {
    if (typeof navigator !== 'undefined' && navigator !== null) {
      return navigator as NavigatorLike;
    }
  } catch {
    // В SSR-окружении обращение к navigator может бросать — игнорируем.
  }
  return null;
}
