import type { SwordType } from '../events/types';

/**
 * SwordState (фаза 5) — pure-logic стейт-машина активного меча.
 *
 * Назначение (план, фаза 5, «SwordSystem + 4 меча»):
 *   - хранит активный меч (forged/welding/plasma/radiation);
 *   - set(sword) — прямое переключение (используется HUD/клавишами 1-4);
 *   - cycle() — циклическое переключение по SWORD_CYCLE_ORDER;
 *   - reset() — возврат к дефолту (forged);
 *   - current() — чтение активного меча.
 *
 * Инварианты:
 *   - начальный меч всегда forged (DEFAULT_SWORD);
 *   - set повторно того же меча — идемпотентен (не триггерит никакие эффекты:
 *     за эффекты отвечает SwordSystem/HUD, не этот стейт).
 *
 * Модуль НЕ зависит от Phaser. Phaser-обёртка — systems/SwordSystem.ts.
 */

/** Мечи в порядке циклического переключения. */
export const SWORD_CYCLE_ORDER: ReadonlyArray<SwordType> = [
  'forged',
  'welding',
  'plasma',
  'radiation',
];

/** Дефолтный (начальный) меч. */
export const DEFAULT_SWORD: SwordType = 'forged';

/**
 * Чистая стейт-машина активного меча. Тестируется без рендера.
 *
 * Используется SwordSystem (Phaser-обёртка): переключает активный меч и читает
 * текущий для применения свойств (maxTargets, slowmo, ...) через SwordProps.
 */
export class SwordState {
  private _current: SwordType;

  constructor(initial: SwordType = DEFAULT_SWORD) {
    this._current = initial;
  }

  /** Текущий активный меч. */
  current(): SwordType {
    return this._current;
  }

  /** Прямое переключение меча. Возвращает новый активный меч. */
  set(sword: SwordType): SwordType {
    this._current = sword;
    return this._current;
  }

  /**
   * Циклическое переключение: forged → welding → plasma → radiation → forged.
   * Возвращает новый активный меч.
   */
  cycle(): SwordType {
    const idx = SWORD_CYCLE_ORDER.indexOf(this._current);
    const nextIdx = (idx + 1) % SWORD_CYCLE_ORDER.length;
    this._current = SWORD_CYCLE_ORDER[nextIdx];
    return this._current;
  }

  /** Сброс в начальное состояние (forged). Используется при restart игры. */
  reset(): void {
    this._current = DEFAULT_SWORD;
  }
}
