import type Phaser from 'phaser';
import type { EventBus } from '../events/EventBus';
import { eventBus as defaultEventBus } from '../events/EventBus';
import { EVENT } from '../events/types';
import type { SliceEvent } from '../events/SliceEvent';
import { ScoreState } from '../game/ScoreState';
import { ComboState } from '../game/ComboState';
import type { LifeState } from '../game/LifeState';

/**
 * ScoreSystem (фаза 4 + расширение фазы 6) — тонкая Phaser-обёртка над
 * ScoreState + ComboState.
 *
 * Назначение:
 *   - подписка на 'slice' через EventBus;
 *   - применение SliceEvent к shared ScoreState (очки по POINTS_PER_KIND);
 *   - труба (isBomb=true) игнорируется (+0 очков, комбо НЕ регистрируется);
 *   - reset() делегирует в ScoreState + ComboState (для restart игры).
 *
 * Фаза 6 (комбо): перед применением очков регистрирует slice в ComboState
 * (через event.timestamp), затем передаёт ComboState.getMultiplier() в
 * ScoreState.applySlice. Труба не разрывает и не регистрирует серию —
 * она мгновенно триггерит game over в BombSystem.
 *
 * update(nowMs) — прокси к ComboState.update для таймаута окна комбо.
 * GameScene вызывает каждый кадр (this.time.now).
 *
 * Архитектура: чистая логика вынесена в ScoreState/ComboState и покрыта
 * unit-тестами. Здесь только wiring: EventBus → shared state.
 *
 * Контракт SliceEvent НЕ меняется между фазами.
 */
export interface ScoreSystemDeps {
  /** EventBus для подписки на 'slice'. По умолчанию — глобальный синглтон. */
  readonly eventBus?: EventBus;
  /** Shared состояние счёта (владеет GameScene). Если не передать — создаётся локальное. */
  readonly scoreState?: ScoreState;
  /**
   * Фаза 6: shared состояние комбо (владеет GameScene). Если не передать —
   * создаётся локальное (комбо изолировано в этом ScoreSystem).
   */
  readonly comboState?: ComboState;
  /**
   * Фича «комбо увеличивает здоровье»: shared LifeState для восстановления
   * жизни при комбо, кратном 5. Опционально — без него фича отключена
   * (обратная совместимость со старыми тестами/конфигурациями).
   */
  readonly lifeState?: LifeState;
}

export class ScoreSystem {
  private readonly eventBus: EventBus;
  private readonly _scoreState: ScoreState;
  private readonly _comboState: ComboState;
  /**
   * Shared LifeState для фичи «комбо → +жизнь» (опционально). Если не передан —
   * восстановление жизней при комбо не происходит.
   */
  private readonly _lifeState?: LifeState;
  private readonly offSlice: () => void;
  private destroyed = false;

  constructor(
    protected readonly scene: Phaser.Scene,
    deps: ScoreSystemDeps = {},
  ) {
    this.eventBus = deps.eventBus ?? defaultEventBus;
    this._scoreState = deps.scoreState ?? new ScoreState();
    this._comboState = deps.comboState ?? new ComboState();
    this._lifeState = deps.lifeState;

    this.offSlice = this.eventBus.on(EVENT.slice, (payload) => {
      this.handleSlice(payload as SliceEvent);
    });
  }

  /** Текущий счёт (из shared ScoreState). */
  get score(): number {
    return this._scoreState.score;
  }

  /** Доступ к shared ScoreState (для HUD). */
  get scoreState(): ScoreState {
    return this._scoreState;
  }

  /** Доступ к shared ComboState (для HUD, фаза 6). */
  get comboState(): ComboState {
    return this._comboState;
  }

  /**
   * Per-frame обновление: прокси к ComboState.update(nowMs) для таймаута окна.
   * GameScene вызывает с this.time.now.
   */
  update(nowMs: number): void {
    if (this.destroyed) return;
    this._comboState.update(nowMs);
  }

  /** Сброс счёта и комбо (для restart игры). Делегирует в shared state. */
  reset(): void {
    this._scoreState.reset();
    this._comboState.reset();
  }

  /**
   * Обработка SliceEvent: регистрирует slice в ComboState (если не труба),
   * добавляет очки через ScoreState с учётом множителя комбо.
   *
   * Побочный эффект: при переходе серии на новый множитель ×2+ проигрывает
   * звук 'combo' (опционально, не влияет на логику очков).
   */
  private handleSlice(event: SliceEvent): void {
    if (this.destroyed) return;
    // Труба не регистрируется в комбо и не приносит очков.
    if (event.isBomb) {
      this._scoreState.applySlice(event.kind, true);
      return;
    }
    // Запоминаем множитель ДО registerSlice, чтобы зафиксировать момент
    // перехода на новый tier (×1 → ×2 → ×3 → ×4).
    const prevMultiplier = this._comboState.getMultiplier();
    // Сначала регистрируем slice → ComboState наращивает серию и множитель.
    this._comboState.registerSlice(event.timestamp);
    const combo = this._comboState.getCombo();
    const multiplier = this._comboState.getMultiplier();
    this._scoreState.applySlice(event.kind, false, multiplier);
    // Звук комбо при переходе на новый множитель ×2+.
    if (multiplier >= 2 && multiplier > prevMultiplier) {
      this.playSound('combo', 0.4);
    }
    // Фича «комбо увеличивает здоровье»: каждые 5 комбо (+1 жизнь, clamp на MAX_LIVES).
    // Звук 'extra-life' играем только если жизнь реально прибавилась (gained > 0),
    // чтобы не вводить игрока в заблуждение при достижении потолка жизней.
    if (this._lifeState && combo >= 5 && combo % 5 === 0) {
      const result = this._lifeState.gainLife(1);
      if (result.gained > 0) {
        this.playSound('extra-life', 0.5);
      }
    }
  }

  /**
   * Универсальный хелпер проигрывания звука комбо.
   * Соблюдает mute-флаг ('ndt:mute') и проверяет наличие ассета.
   * Не падает при ошибках аудио (в headless/тестах scene.game может отсутствовать).
   */
  private playSound(key: string, volume: number): void {
    try {
      const game = this.scene.game;
      if (game.registry.get('ndt:mute') === true) return;
      if (!game.cache.audio.exists(key)) return;
      this.scene.sound.play(key, { volume });
    } catch {
      // Аудио недоступно или scene-stub без game — не роняем логику очков.
    }
  }

  /** Уничтожение: отписка от событий. Идемпотентен. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.offSlice();
  }
}
