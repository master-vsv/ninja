import Phaser from 'phaser';
import { EVENT } from './types';

/**
 * EventBus — единый канал связи между системами NDT-Ninja.
 * Обёртка над Phaser.Events.EventEmitter: даёт типизированный API и
 * единую точку для имен событий (см. EVENT).
 *
 * В фазе 0 — заглушка: класс определён, но не используется до фазы 3.
 */
export class EventBus {
  private readonly emitter = new Phaser.Events.EventEmitter();

  /** Отправить событие. */
  emit(event: typeof EVENT.slice, payload: unknown): void;
  emit(event: typeof EVENT.miss, payload: unknown): void;
  emit(event: typeof EVENT.gameOver, payload: unknown): void;
  emit(event: typeof EVENT.powerUp, payload: unknown): void;
  emit(event: string, payload?: unknown): void {
    this.emitter.emit(event, payload);
  }

  /** Подписаться на событие. Возвращает функцию отписки. */
  on(event: string, handler: (payload: unknown) => void): () => void {
    this.emitter.on(event, handler);
    return () => this.emitter.off(event, handler);
  }

  /** Отписаться от события. */
  off(event: string, handler: (payload: unknown) => void): void {
    this.emitter.off(event, handler);
  }

  /** Полная очистка подписок (используется в destroy сцены). */
  shutdown(): void {
    this.emitter.shutdown();
  }
}

/** Глобальный инстанс шины. Один на всё приложение. */
export const eventBus = new EventBus();
