import { WAVES, type WaveConfig } from './WaveConfig';

/**
 * WaveState (фаза 6) — pure-logic state-machine прогрессии волн.
 *
 * Контракт:
 *   - currentWaveIndex — индекс текущей волны в массиве WAVES (с 0);
 *   - elapsedSec — накопленное время в текущей волне, сек;
 *   - update(dtSec): накапливает elapsedSec; при достижении waveDuration
 *     текущей волны → переход на следующую (currentWaveIndex++), elapsedSec=0;
 *     на максимальной волне (isMaxWave) → остаёмся, elapsedSec накапливается;
 *   - getCurrent(): WaveConfig текущей волны (на максимальной — последняя);
 *   - isMaxWave(): true, если currentWaveIndex — последний;
 *   - reset(): currentWaveIndex=0, elapsedSec=0 (для restart игры).
 *
 * Инварианты:
 *   - dtSec <= 0 — no-op (защита от отрицательного/нулевого dt);
 *   - текущая волна не может выйти за пределы массива WAVES;
 *   - update идемпотентен на одном и том же dtSec только при вызове извне
 *     (внутренне состояние мутирует).
 *
 * Модуль НЕ зависит от Phaser. Phaser-обёртка — scenes/GameScene.ts.
 */
export class WaveState {
  private _currentWaveIndex = 0;
  private _elapsedSec = 0;

  /** Индекс текущей волны (с 0). */
  get currentWaveIndex(): number {
    return this._currentWaveIndex;
  }

  /** Прошедшее время в текущей волне, сек. */
  get elapsedSec(): number {
    return this._elapsedSec;
  }

  /**
   * Per-frame обновление: накапливает elapsedSec, переводит на следующую волну
   * при достижении waveDuration. dtSec — прошедшее время с прошлого кадра (сек).
   *
   * dtSec <= 0 — no-op.
   */
  update(dtSec: number): void {
    if (dtSec <= 0) return;
    if (this.isMaxWave()) {
      // На максимальной волне остаёмся; elapsedSec накапливается (без эффекта).
      this._elapsedSec += dtSec;
      return;
    }
    this._elapsedSec += dtSec;
    const current = this.getCurrent();
    if (this._elapsedSec >= current.waveDuration) {
      this._currentWaveIndex++;
      this._elapsedSec = 0;
    }
  }

  /**
   * Возвращает WaveConfig текущей волны. На максимальной волне — последняя
   * (WAVES[length - 1]). Гарантированно определена, т.к. WAVES непустой.
   */
  getCurrent(): WaveConfig {
    return WAVES[Math.min(this._currentWaveIndex, WAVES.length - 1)];
  }

  /** true, если текущая волна — последняя в массиве WAVES. */
  isMaxWave(): boolean {
    return this._currentWaveIndex >= WAVES.length - 1;
  }

  /** Сброс на первую волну (для restart игры). Идемпотентен. */
  reset(): void {
    this._currentWaveIndex = 0;
    this._elapsedSec = 0;
  }
}
