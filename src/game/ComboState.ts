/**
 * ComboState (фаза 6) — pure-logic комбо-множитель за серию разрезов в окне.
 *
 * Контракт (план, фаза 6, «комбо-множитель»):
 *   - registerSlice(nowMs): регистрирует разрез. Если между прошлым slice и
 *     nowMs <= COMBO_WINDOW_MS → combo++, иначе combo=1 (первый slice серии);
 *   - update(nowMs): если combo>0 и прошло > COMBO_WINDOW_MS с последнего
 *     slice → combo=0 (таймаут, множитель обнуляется);
 *   - getCombo(): текущая длина серии (0 — нет активного комбо);
 *   - getMultiplier(): ступенчатый множитель по getCombo():
 *       combo 0-1 → ×1 (нет бонуса),
 *       combo 2-3 → ×2,
 *       combo 4-6 → ×3,
 *       combo 7+ → ×4;
 *   - reset(): combo=0, lastSliceMs=0 (для restart игры).
 *
 * Пороги множителя зафиксированы в COMBO_MULTIPLIER_TIERS (старший → младший).
 *
 * Модуль НЕ зависит от Phaser. Phaser-обёртка — systems/ScoreSystem.ts +
 * scenes/GameScene.ts (вызывает update(nowMs) каждый кадр).
 */

/**
 * Окно комбо, мс. Серия продолжается, пока разрезы идут не реже этого интервала.
 * 1000 мс — аркадный темп (вдохновлено планом, окно «напр. 800 мс» — взято 1000).
 */
export const COMBO_WINDOW_MS = 1000;

/**
 * Пороги множителя. minCombo — минимальная длина серии для этого множителя.
 * Сортировка по убыванию minCombo для lookup'а от старшего tier'а.
 *
 * Прогрессия: combo 1→×1, 2-3→×2, 4-6→×3, 7+→×4.
 */
export const COMBO_MULTIPLIER_TIERS: ReadonlyArray<{
  readonly minCombo: number;
  readonly multiplier: number;
}> = [
  { minCombo: 7, multiplier: 4 },
  { minCombo: 4, multiplier: 3 },
  { minCombo: 2, multiplier: 2 },
  { minCombo: 1, multiplier: 1 },
];

/** Максимальный множитель (последний tier для combo 7+). */
export const COMBO_MAX_MULTIPLIER = 4;

/**
 * Чистая state-machine комбо-серии. Тестируется без рендера и без Phaser.
 * GameScene вызывает update(nowMs) каждый кадр; ScoreSystem — registerSlice
 * на каждый SliceEvent (передаёт event.timestamp как nowMs).
 */
export class ComboState {
  private _combo = 0;
  private _lastSliceMs = 0;

  /** Текущая длина серии разрезов. 0 — нет активного комбо. */
  getCombo(): number {
    return this._combo;
  }

  /** Timestamp последнего slice, мс (0 — если slice не было). */
  getLastSliceMs(): number {
    return this._lastSliceMs;
  }

  /**
   * Per-frame обновление: если combo>0 и прошло > COMBO_WINDOW_MS — сбрасывает
   * combo в 0 (множитель обнуляется по таймауту).
   *
   * nowMs — текущее время (performance.now() или Phaser time.now).
   * Идемпотентен в стационарном состоянии (после сброса — no-op).
   */
  update(nowMs: number): void {
    if (this._combo === 0) return;
    if (nowMs - this._lastSliceMs > COMBO_WINDOW_MS) {
      this._combo = 0;
    }
  }

  /**
   * Регистрирует разрез в nowMs.
   *
   * Если серия активна (combo>0) и nowMs в окне — combo++. Иначе combo=1
   * (начало новой серии). lastSliceMs обновляется на nowMs.
   */
  registerSlice(nowMs: number): void {
    if (this._combo > 0 && nowMs - this._lastSliceMs <= COMBO_WINDOW_MS) {
      this._combo++;
    } else {
      this._combo = 1;
    }
    this._lastSliceMs = nowMs;
  }

  /**
   * Ступенчатый множитель по текущему combo:
   *   0-1 → ×1, 2-3 → ×2, 4-6 → ×3, 7+ → ×4.
   *
   * Идёт от старшего tier'а к младшему, возвращая первый подходящий.
   * При combo=0 возвращает ×1 (безопасно для ScoreState — бонуса нет).
   */
  getMultiplier(): number {
    for (const tier of COMBO_MULTIPLIER_TIERS) {
      if (this._combo >= tier.minCombo) {
        return tier.multiplier;
      }
    }
    return 1;
  }

  /** Сброс серии (для restart игры). Идемпотентен. */
  reset(): void {
    this._combo = 0;
    this._lastSliceMs = 0;
  }
}
