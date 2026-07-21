import type { NDTObjectKind } from '../events/types';

/**
 * ScoreState (фаза 4 + расширение фазы 6) — pure-logic счёт с комбо-множителем.
 *
 * Назначение (план, фаза 4, «ScoreSystem (базовый счёт)» + фаза 6 «комбо»):
 *   - фикс. очки за разрез каждого режущегося kind (POINTS_PER_KIND);
 *   - труба (isBomb=true) не приносит очков (мгновенный game over отдельно);
 *   - applySlice(kind, isBomb, multiplier=1): если isBomb → +0, иначе
 *     += POINTS_PER_KIND[kind] × multiplier (множитель комбо из ComboState);
 *   - reset() обнуляет счёт.
 *
 * Комбо-множитель (фаза 6) передаётся параметром — ScoreState НЕ зависит от
 * ComboState, остаётся pure-logic. ScoreSystem связывает их: сначала
 * регистрирует slice в ComboState, затем передаёт multiplier в ScoreState.
 * multiplier=1 по умолчанию — обратная совместимость с тестами фазы 4.
 *
 * Модуль НЕ зависит от Phaser. Phaser-обёртка — systems/ScoreSystem.ts.
 */

/**
 * Фиксированные очки за разрез каждого вида объекта.
 * pipe = 0: труба обрабатывается BombSystem (мгновенный game over), а не очками.
 *
 * Значения подобраны по плану как «напр.»: bolt:10, nut:15, ruler:20, standard:25.
 * Новые виды (фаза NDT-методов): probe:25, magnet:30, penetrant20.
 * Power-up фигуры (shrink/grow/slow): 50 — бонус за разрез редкого спец-объекта
 * (помимо активации временного эффекта через отдельное событие 'power-up').
 * NDT-экипировка (helmet/goggles/weldingMask): 50 — тот же бонус, что и у
 * классических power-up фигур (это тоже power-up, активирует эффект при разрезе).
 */
export const POINTS_PER_KIND: Readonly<Record<NDTObjectKind, number>> = {
  bolt: 10,
  nut: 15,
  ruler: 20,
  standard: 25,
  pipe: 0,
  probe: 25,
  magnet: 30,
  penetrant: 20,
  shrink: 50,
  grow: 50,
  slow: 50,
  helmet: 50,
  goggles: 50,
  weldingMask: 50,
};

/**
 * Чистая стейт-машина счёта. Тестируется без рендера.
 *
 * ScoreSystem (тонкая Phaser-обёртка) подписывается на 'slice' через EventBus
 * и делегирует обновление этому состоянию, передавая множитель комбо из
 * отдельного ComboState (фаза 6).
 */
export class ScoreState {
  private _score = 0;

  /** Текущий счёт. */
  get score(): number {
    return this._score;
  }

  /**
   * Применяет разрез к счёту.
   *
   * @param kind тип разрезанного объекта.
   * @param isBomb true только для 'pipe' → очков не приносит.
   * @param multiplier множитель очков (комбо, фаза 6). По умолчанию 1 —
   *   обратная совместимость с фазой 4. Должен быть >= 1 (защита от
   *   обнуления/отрицательных очков: при < 1 используется 1).
   * @returns количество очков, добавленных за этот разрез (для UI/HUD反馈).
   */
  applySlice(kind: NDTObjectKind, isBomb: boolean, multiplier = 1): number {
    // Труба-бомба разрезана → очков не приносит (вместо этого game over).
    if (isBomb) {
      return 0;
    }
    // Защита: множитель < 1 не должен уменьшать очки (некорректный caller).
    const mul = Math.max(1, multiplier);
    const basePoints = POINTS_PER_KIND[kind] ?? 0;
    const points = Math.round(basePoints * mul);
    this._score += points;
    return points;
  }

  /** Сброс счёта в 0 (для restart игры). */
  reset(): void {
    this._score = 0;
  }
}
