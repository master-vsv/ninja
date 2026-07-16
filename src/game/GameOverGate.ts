import type { GameOverReason } from '../events/types';

/**
 * GameOverGate (фаза 4) — pure-logic идемпотентный вентиль game-over.
 *
 * Назначение (план, раздел «GameOverFlow»):
 *   - и BombSystem, и LifeSystem могут перевести игру в game over;
 *   - обе эмитят EventBus.emit('game-over', { reason });
 *   - GameScene — единственный консамер; обработчик идемпотентен;
 *   - защита от двойного эмитта (BombSystem+LifeSystem в одном кадре).
 *
 * GameOverGate реализует эту идемпотентность на стороне эмитента:
 *   markGameOver(reason) возвращает true только при первом вызове за игру —
 *   именно его (true) должен эмитить вызвавший в EventBus. Последующие вызовы
 *   в той же игре возвращают false — дублирующий эмит подавляется.
 *
 * reset() вызывается при restart игры.
 *
 * Модуль НЕ зависит от Phaser.
 */
export class GameOverGate {
  private _isGameOver = false;

  /** true, если в текущей игре уже зафиксирован game over. */
  get isGameOver(): boolean {
    return this._isGameOver;
  }

  /**
   * Пытается зафиксировать game over с указанной причиной.
   *
   * @returns true, если это первый mark в текущей игре (нужно эмитить 'game-over').
   *          false при повторных вызовах — дублирующий эмит подавлен.
   */
  markGameOver(_reason: GameOverReason): boolean {
    if (this._isGameOver) {
      return false;
    }
    this._isGameOver = true;
    // reason сейчас не сохраняется (GameScene достаточно факта перехода);
    // остаётся в сигнатуре для будущего расширения (аналитика, разные экраны).
    return true;
  }

  /** Сброс в начальное состояние (для restart игры). */
  reset(): void {
    this._isGameOver = false;
  }
}
