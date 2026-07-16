import type Phaser from 'phaser';
import type { EventBus } from '../events/EventBus';
import { eventBus as defaultEventBus } from '../events/EventBus';
import { EVENT } from '../events/types';
import type { SliceEvent } from '../events/SliceEvent';
import { HapticsState, type HapticsStateOptions } from '../perf/HapticsState';

/**
 * HapticsSystem (фаза 7) — тонкая Phaser-обёртка для вибро-откликов.
 *
 * Назначение (план, фаза 7): navigator.vibrate на мобайл при slice/bomb/gameover.
 * Подписывается на события EventBus и делегирует в HapticsState (pure-logic).
 *
 * Мобайл-only по сути: canVibrate определяется feature-detect'ом navigator.vibrate
 * внутри HapticsState. Desktop-браузеры без API → все вызовы noop, игра НЕ падает.
 * НЕ блокирует геймплей при отсутствии API.
 *
 * События:
 *   - 'slice'    → vibeBomb если isBomb, иначе vibeSlice;
 *   - 'game-over' → vibeGameover.
 *
 * NOT pure-logic: импортирует тип Phaser.Scene (используется только в типах;
 * scene не вызывается напрямую — вибрация идёт через navigator.vibrate).
 */

/** Опции конструктора HapticsSystem. */
export interface HapticsSystemOptions {
  /** EventBus для подписки на события. По умолчанию — глобальный синглтон. */
  readonly eventBus?: EventBus;
  /** Опции HapticsState (для тестов: инжекция vibeFn/navigator). */
  readonly hapticsOptions?: HapticsStateOptions;
}

export class HapticsSystem {
  private readonly eventBus: EventBus;
  /** Pure-logic состояние вибро (feature-detect + паттерны). */
  readonly state: HapticsState;
  private readonly offSlice: () => void;
  private readonly offGameOver: () => void;
  private destroyed = false;

  constructor(
    _scene: Phaser.Scene,
    options: HapticsSystemOptions = {},
  ) {
    this.eventBus = options.eventBus ?? defaultEventBus;
    this.state = new HapticsState(options.hapticsOptions ?? {});

    this.offSlice = this.eventBus.on(EVENT.slice, (payload) => {
      this.handleSlice(payload as SliceEvent);
    });
    this.offGameOver = this.eventBus.on(EVENT.gameOver, () => {
      this.handleGameOver();
    });
  }

  /** Доступность вибрации (feature-detect navigator.vibrate). */
  get canVibrate(): boolean {
    return this.state.canVibrate;
  }

  /** Обработка slice: бомба → длинная вибрация, иначе короткая. */
  private handleSlice(event: SliceEvent): void {
    if (this.destroyed) return;
    if (event.isBomb) {
      this.state.vibeBomb();
    } else {
      this.state.vibeSlice();
    }
  }

  /** Обработка game-over: двойная длинная вибрация. */
  private handleGameOver(): void {
    if (this.destroyed) return;
    this.state.vibeGameover();
  }

  /** Уничтожение: отписка от событий. Идемпотентен. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.offSlice();
    this.offGameOver();
  }
}
