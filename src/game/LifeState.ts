import type { NDTObjectKind } from '../events/types';

/**
 * LifeState (фаза 4) — pure-logic стейт-машина жизней.
 *
 * Назначение (план, раздел «Дизайн failstate»):
 *   - 3 жизни на старте (MAX_LIVES=3);
 *   - упущенный режимый объект (isBomb=false) → lives-1;
 *   - упущенная труба-бомба (isBomb=true) → ШТРАФА НЕТ (мина, не цель);
 *   - при lives<=0 → gameOver=true;
 *   - reset() возвращает в начальное состояние (для restart игры).
 *
 * Инварианты:
 *   - lives НЕ может стать отрицательным (clamp на 0);
 *   - gameOver залипает: после true остаётся true до reset().
 *
 * Модуль НЕ зависит от Phaser. Phaser-обёртка — systems/LifeSystem.ts.
 */

/** Максимальное (и начальное) число жизней. */
export const MAX_LIVES = 3;

/** Результат применения MissEvent к состоянию. */
export interface LifeStateResult {
  /** Текущее число жизней после применения события. */
  readonly lives: number;
  /** true, если жизни закончились (переход в game over). */
  readonly gameOver: boolean;
}

/**
 * Результат восстановления жизней (gainLife).
 * Фича «комбо увеличивает здоровье»: gainLife(amount) добавляет жизни,
 * ограниченные сверху MAX_LIVES, и сообщает, сколько реально добавлено.
 */
export interface LifeGainResult {
  /** Текущее число жизней после восстановления. */
  readonly lives: number;
  /** Сколько жизней реально прибавилось (0 — если упёрлись в MAX_LIVES). */
  readonly gained: number;
}

/**
 * Чистая стейт-машина жизней. Тестируется без рендера.
 *
 * Используется LifeSystem (тонкая Phaser-обёртка), которая подписывается
 * на 'miss' через EventBus и применяет события к этому состоянию.
 */
export class LifeState {
  private _lives: number;
  private _gameOver = false;

  constructor(initialLives: number = MAX_LIVES) {
    this._lives = Math.max(0, Math.floor(initialLives));
  }

  /** Текущее число жизней (0..MAX_LIVES). */
  get lives(): number {
    return this._lives;
  }

  /** true, если жизни закончились. Залипает до reset(). */
  get gameOver(): boolean {
    return this._gameOver;
  }

  /**
   * Применяет MissEvent к состоянию.
   *
   * @param kind тип упущенного объекта (для будущей дифференциации штрафа).
   * @param isBomb true только для 'pipe' — труба упущена, штрафа нет.
   * @returns состояние после применения {lives, gameOver}.
   *
   * Инвариант: при уже случившемся gameOver дальнейшие промахи не уменьшают
   * lives ниже 0 (clamp) и не меняют gameOver.
   */
  applyMiss(kind: NDTObjectKind, isBomb: boolean): LifeStateResult {
    // После gameOver состояние заморожено — возвращаем текущее как есть.
    if (this._gameOver) {
      return { lives: this._lives, gameOver: true };
    }

    // Труба-бомба упущена → штрафа нет (мина, не цель).
    if (isBomb) {
      return { lives: this._lives, gameOver: false };
    }

    // Режимый объект упущен → -1 жизнь (с clamp на 0).
    this._lives = Math.max(0, this._lives - 1);
    if (this._lives <= 0) {
      this._gameOver = true;
    }
    // kind сейчас не влияет на формулу штрафа (всегда -1), но остаётся в сигнатуре
    // для будущих расширений (например, разные штрафы по kind в пост-MVP).
    void kind;

    return { lives: this._lives, gameOver: this._gameOver };
  }

  /**
   * Восстановление жизней (фича «комбо увеличивает здоровье»).
   *
   * Добавляет `amount` жизней, ограничивая итог сверху MAX_LIVES. Используется
   * ScoreSystem при достижении комбо, кратного 5 (+1 жизнь).
   *
   * Инварианты:
   *   - после gameOver состояние заморожено → no-op (gained=0);
   *   - lives НЕ превышает MAX_LIVES (clamp сверху);
   *   - amount <= 0 → no-op (нечего добавлять);
   *   - gained = сколько реально прибавилось (разница до/после).
   *
   * @param amount сколько жизней прибавить (ожидается > 0).
   * @returns {lives, gained} — итоговое lives и реально прибавленное число.
   */
  gainLife(amount: number): LifeGainResult {
    // После gameOver состояние заморожено — восстановления нет.
    if (this._gameOver) {
      return { lives: this._lives, gained: 0 };
    }
    if (amount <= 0) {
      return { lives: this._lives, gained: 0 };
    }
    const before = this._lives;
    this._lives = Math.min(MAX_LIVES, this._lives + Math.floor(amount));
    return { lives: this._lives, gained: this._lives - before };
  }

  /**
   * Разрез трубы-бомбы → -1 жизнь (взрыв отнимает жизнь, но НЕ мгновенный
   * game-over). Game-over наступает только когда жизни достигнут 0.
   *
   * В отличие от applyMiss (упущенный объект), loseLife ВСЕГДА уменьшает lives
   * на 1 — это штраф за разрез трубы.
   * @returns состояние после {lives, gameOver}.
   */
  loseLife(): LifeStateResult {
    if (this._gameOver) {
      return { lives: this._lives, gameOver: true };
    }
    this._lives = Math.max(0, this._lives - 1);
    if (this._lives <= 0) {
      this._gameOver = true;
    }
    return { lives: this._lives, gameOver: this._gameOver };
  }

  /** Сброс в начальное состояние (3 жизни). Используется при restart игры. */
  reset(): void {
    this._lives = MAX_LIVES;
    this._gameOver = false;
  }
}
