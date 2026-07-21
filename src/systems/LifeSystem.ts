import type Phaser from 'phaser';
import type { EventBus } from '../events/EventBus';
import { eventBus as defaultEventBus } from '../events/EventBus';
import { EVENT, type GameOverReason } from '../events/types';
import type { MissEvent } from '../events/MissEvent';
import { LifeState } from '../game/LifeState';
import { GameOverGate } from '../game/GameOverGate';
import type { PowerUpState } from '../game/PowerUpState';

/**
 * LifeSystem (фаза 4) — тонкая Phaser-обёртка над LifeState.
 *
 * Назначение:
 *   - подписка на 'miss' через EventBus;
 *   - применение MissEvent к shared LifeState;
 *   - при gameOver (lives=0) → эмит 'game-over' { reason: 'no-lives' },
 *     только если GameOverGate.mark вернул true (идемпотентность — защита
 *     от дублирующего эмитта вместе с BombSystem в одном кадре);
 *   - reset() делегирует в LifeState + GameOverGate (для restart игры).
 *
 * Shield-интеграция: при активном shield-эффекте (PowerUpState.isShielded)
 * упущенные объекты НЕ отнимают жизни — handleMiss пропускает applyMiss
 * (как и для трубы-бомбы, isBomb=true). Эквивалент «временной неуязвимости».
 *
 * Архитектура: чистая логика вынесена в LifeState/GameOverGate и покрыта
 * unit-тестами. Здесь только wiring: EventBus → shared state → EventBus.
 *
 * GameScene создаёт shared LifeState/GameOverGate и передаёт их в LifeSystem,
 * BombSystem и HUD (один экземпляр на игру, reset'ится при restart).
 */
export interface LifeSystemDeps {
  /** EventBus для подписки на 'miss'. По умолчанию — глобальный синглтон. */
  readonly eventBus?: EventBus;
  /** Shared состояние жизней (владеет GameScene). Если не передать — создаётся локальное. */
  readonly lifeState?: LifeState;
  /** Shared идемпотентный вентиль game-over (владеет GameScene). */
  readonly gameOverGate?: GameOverGate;
  /**
   * Провайдер PowerUpState (pull-модель). Если задан и shield активен —
   * упущенные объекты не отнимают жизни (временная неуязвимость от каски).
   * Если не задан — shield-эффект не действует (обратная совместимость).
   */
  readonly getPowerUpState?: () => PowerUpState | undefined;
}

export class LifeSystem {
  private readonly eventBus: EventBus;
  private readonly _lifeState: LifeState;
  private readonly _gameOverGate: GameOverGate;
  private readonly getPowerUpState?: () => PowerUpState | undefined;
  private readonly offMiss: () => void;
  private destroyed = false;

  constructor(
    protected readonly scene: Phaser.Scene,
    deps: LifeSystemDeps = {},
  ) {
    this.eventBus = deps.eventBus ?? defaultEventBus;
    this._lifeState = deps.lifeState ?? new LifeState();
    // Если gate не передан — создаём локальный. В GameScene передаётся shared.
    this._gameOverGate = deps.gameOverGate ?? new GameOverGate();
    this.getPowerUpState = deps.getPowerUpState;

    this.offMiss = this.eventBus.on(EVENT.miss, (payload) => {
      this.handleMiss(payload as MissEvent);
    });
  }

  /** Текущее число жизней (из shared LifeState). */
  get lives(): number {
    return this._lifeState.lives;
  }

  /** true, если жизни закончились. */
  get gameOver(): boolean {
    return this._lifeState.gameOver;
  }

  /** Доступ к shared LifeState (для HUD). */
  get lifeState(): LifeState {
    return this._lifeState;
  }

  /** Доступ к shared GameOverGate. */
  get gameOverGate(): GameOverGate {
    return this._gameOverGate;
  }

  /** Сброс состояния (для restart игры). Делегирует в shared state. */
  reset(): void {
    this._lifeState.reset();
    this._gameOverGate.reset();
  }

  /** Обработка MissEvent: применяет к LifeState, эмитит game-over при необходимости. */
  private handleMiss(event: MissEvent): void {
    if (this.destroyed) return;
    // Shield (временная неуязвимость от каски): упущенные объекты не отнимают
    // жизни. Проверяем ДО applyMiss — пропускаем весь штраф целиком (как isBomb).
    if (this.getPowerUpState?.()?.isShielded) {
      return;
    }
    const result = this._lifeState.applyMiss(event.kind, event.isBomb);
    if (result.gameOver) {
      // Идемпотентность: эмитим только если gate впервые зафиксировал game over.
      const reason: GameOverReason = 'no-lives';
      if (this._gameOverGate.markGameOver(reason)) {
        this.eventBus.emit(EVENT.gameOver, { reason });
      }
    }
  }

  /** Уничтожение: отписка от событий. Идемпотентен. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.offMiss();
  }
}
