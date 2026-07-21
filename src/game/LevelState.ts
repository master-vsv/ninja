/**
 * LevelState — pure-logic стейт-машина уровня игрока.
 *
 * Назначение:
 *   - отображение LEVEL N в HUD на основе текущего счёта;
 *   - level = floor(score / 1000) + 1 (0→1, 999→1, 1000→2, 2500→3);
 *   - НЕ влияет на failstate/score/waves — только отображение + оповещение
 *     о повышении (звук/визуал).
 *
 * Инварианты:
 *   - начальный уровень = 1;
 *   - ScoreState.score всегда >= 0, поэтому level всегда >= 1;
 *   - update() возвращает leveledUp=true только при росте уровня.
 *
 * Модуль НЕ зависит от Phaser. GameScene создаёт экземпляр, регистрирует его
 * в game.registry (для HUD) и вызывает update() каждый кадр; HUD читает level.
 */

/** Шаг очков между уровнями (1000 очков = +1 уровень). */
const LEVEL_SCORE_STEP = 1000;

/**
 * Чистая функция расчёта уровня из счёта.
 *
 * @param score текущий счёт (>= 0).
 * @returns уровень: floor(score/1000) + 1.
 *
 * Примеры: 0→1, 999→1, 1000→2, 2500→3.
 */
export function computeLevel(score: number): number {
  return Math.floor(score / LEVEL_SCORE_STEP) + 1;
}

/** Результат обновления уровня из счёта. */
export interface LevelUpdateResult {
  /** true, если уровень вырос по сравнению с предыдущим значением. */
  readonly leveledUp: boolean;
  /** Уровень после обновления. */
  readonly newLevel: number;
}

/**
 * Чистая стейт-машина уровня. Отслеживает currentLevel и сигнализирует о росте.
 *
 * HUD читает {@link level} для отображения; GameScene вызывает {@link update}
 * каждый кадр и реагирует на leveledUp (звук/визуал).
 */
export class LevelState {
  private _currentLevel: number;

  constructor(initialLevel = 1) {
    this._currentLevel = initialLevel;
  }

  /** Текущий уровень. */
  get level(): number {
    return this._currentLevel;
  }

  /**
   * Пересчитывает уровень из счёта.
   *
   * currentLevel обновляется всегда (включая уменьшение, например после reset
   * счёта). leveledUp=true только при строгом росте уровня.
   *
   * @param score текущий счёт.
   * @returns {leveledUp, newLevel}.
   */
  update(score: number): LevelUpdateResult {
    const newLevel = computeLevel(score);
    const leveledUp = newLevel > this._currentLevel;
    this._currentLevel = newLevel;
    return { leveledUp, newLevel };
  }

  /** Сброс в начальное состояние (level=1). Для restart игры. */
  reset(): void {
    this._currentLevel = 1;
  }
}
