import Phaser from 'phaser';
import { type SwordType } from '../events/types';
import {
  SwordState,
  DEFAULT_SWORD,
} from '../sword/SwordState';
import { getSwordProps, SLOWMO_DURATION_MS } from '../sword/SwordProps';
import { isSwordUnlocked } from '../sword/SwordUnlock';
import { SlowmoState } from '../sword/SlowmoState';
import type { LevelState } from '../game/LevelState';

/**
 * SwordSystem (фаза 5) — Phaser-обёртка над активным мечом.
 *
 * Назначение:
 *   - владеет shared SwordState (активный меч) и SlowmoState (fake-slowmo);
 *   - экспонирует геттеры-провайдеры для SliceSystem (maxTargets, swordType) и
 *     FXSystem (slowmoState для green-glow);
 *   - переключает меч (вызывается из HUD): set(sword), cycle();
 *   - активирует способность текущего меча: activateAbility() — для radiation
 *     это SlowmoState.activate(SLOWMO_DURATION_MS), для остальных мечей — no-op;
 *   - в update() тикает SlowmoState (delta = scene.time.now - prevTime).
 *
 * ВАЖНО (риск №9 плана): НЕ использует scene.time.timeScale ИЛИ
 * engine.timing.timeScale. Fake-slowmo applied ТОЛЬКО через:
 *   - SlowmoState.isActive (pull-модель): FXSystem рисует green-glow overlay;
 *   - GameScene: spawnTimer.delay × SLOWMO_SPAWN_DELAY_MULTIPLIER при isActive.
 *
 * НЕ внутренне подписывается на SliceEvent — SliceSystem сам читает меч через
 * геттеры (getMaxTargets/getSwordType) в начале update(). Это сохраняет
 * однонаправленный поток: SwordSystem → (через геттеры) → SliceSystem.
 *
 * Публичный API для HUD/тестов:
 *   - swordState, slowmoState — shared-объекты (registry);
 *   - set(sword), cycle(), activateAbility() — управление;
 *   - getMaxTargets(), getSwordType() — провайдеры для SliceSystem;
 *   - getCurrentLevel() — текущий уровень игрока (из registry 'ndt:levelState').
 *
 * Разблокировка по уровню: set(sword) проверяет доступность меча через
 * isSwordUnlocked(sword, getCurrentLevel()). Заблокированный меч — no-op
 * (активный меч не меняется) + звук отказа 'ui-button'.
 */

/** Ключ реестра для LevelState (тот же, что регистрирует GameScene/HUDScene). */
const REG_LEVEL_STATE = 'ndt:levelState';
/** Ключ реестра для mute-флага (тот же, что в MenuScene/GameScene). */
const REG_MUTE = 'ndt:mute';
/** Громкость звука отказа при попытке выбрать заблокированный меч. */
const LOCKED_REFUSE_VOLUME = 0.3;

/** Опции конструктора SwordSystem. */
export interface SwordSystemOptions {
  /** Shared SwordState (если не задан — создаётся новый). */
  readonly swordState?: SwordState;
  /** Shared SlowmoState (если не задан — создаётся новый). */
  readonly slowmoState?: SlowmoState;
  /** Начальный меч. По умолчанию DEFAULT_SWORD (forged). */
  readonly initialSword?: SwordType;
  /** Длительность slowmo при activateAbility() для radiation, мс. */
  readonly slowmoDurationMs?: number;
}

export class SwordSystem {
  /** Shared активный меч — переживает один игровой цикл, регистрируется в registry. */
  readonly swordState: SwordState;
  /** Shared fake-slowmo state — pull-модель для GameScene (spawn) и FXSystem (glow). */
  readonly slowmoState: SlowmoState;
  /** Длительность slowmo для radiation, мс. */
  private readonly slowmoDurationMs: number;
  /** Предыдущее scene.time.now — для вычисления delta в update(). */
  private prevTime = 0;
  private destroyed = false;

  constructor(
    protected readonly scene: Phaser.Scene,
    options: SwordSystemOptions = {},
  ) {
    this.swordState = options.swordState ?? new SwordState(options.initialSword ?? DEFAULT_SWORD);
    this.slowmoState = options.slowmoState ?? new SlowmoState();
    this.slowmoDurationMs = options.slowmoDurationMs ?? SLOWMO_DURATION_MS;
    this.prevTime = scene.time.now;
  }

  /** Текущий активный меч. */
  current(): SwordType {
    return this.swordState.current();
  }

  /**
   * Текущий уровень игрока. Читается из game.registry 'ndt:levelState'
   * (LevelState, регистрируется GameScene). Если LevelState отсутствует —
   * возвращается 1 (инвариант: уровень всегда >= 1).
   */
  getCurrentLevel(): number {
    const levelState = this.scene.registry.get(REG_LEVEL_STATE) as
      | LevelState
      | undefined;
    return levelState?.level ?? 1;
  }

  /**
   * Прямое переключение меча.
   *
   * Разблокировка по уровню: если меч заблокирован (level < unlockLevel) —
   * no-op (активный меч не меняется), проигрывается звук отказа 'ui-button'.
   * Иначе делегирует в SwordState. Возвращает актуальный активный меч
   * (не меняется при отказе).
   */
  set(sword: SwordType): SwordType {
    if (!isSwordUnlocked(sword, this.getCurrentLevel())) {
      // Заблокирован — не переключаем, сигнализируем отказ звуком.
      this.playSound('ui-button', LOCKED_REFUSE_VOLUME);
      return this.swordState.current();
    }
    return this.swordState.set(sword);
  }

  /**
   * Безопасное проигрывание звука: уважает mute-флаг и проверяет наличие
   * ассета. Не падает при ошибках аудио (headless/тесты). По образцу
   * GameScene.playSound / MenuScene.playSound.
   */
  private playSound(key: string, volume: number): void {
    try {
      if (this.scene.registry.get(REG_MUTE) === true) return;
      if (!this.scene.game.cache.audio.exists(key)) return;
      this.scene.sound.play(key, { volume });
    } catch {
      // Аудио недоступно (headless/тесты) — silently ignore.
    }
  }

  /** Циклическое переключение меча. */
  cycle(): SwordType {
    return this.swordState.cycle();
  }

  /**
   * Активирует способность текущего меча.
   *
   * Поведение:
   *   - radiation → SlowmoState.activate(slowmoDurationMs), возвращает true;
   *   - остальные мечи → no-op (фаза 6 добавит комбо-расширение и т.п.), false.
   *
   * @returns true, если способность применена.
   */
  activateAbility(): boolean {
    if (this.destroyed) return false;
    const sword = this.swordState.current();
    const props = getSwordProps(sword);
    if (props.slowmo) {
      this.slowmoState.activate(this.slowmoDurationMs);
      return true;
    }
    return false;
  }

  /**
   * Провайдер лимита целей для SliceSystem. Возвращает maxTargets активного меча
   * (forged=1, welding=1, plasma=3, radiation=1).
   */
  getMaxTargets(): number {
    return getSwordProps(this.swordState.current()).maxTargets;
  }

  /**
   * Провайдер активного меча для SliceSystem. Возвращает SwordType (never null
   * в фазе 5 — всегда есть активный меч). Возвращает SwordType, не null.
   */
  getSwordType(): SwordType {
    return this.swordState.current();
  }

  /** Цвет активного меча (для следа свайпа — trail меняет цвет по мечу). */
  getCurrentColor(): number {
    return getSwordProps(this.swordState.current()).color;
  }

  /**
   * Per-frame апдейт: тикает SlowmoState с delta времени.
   * GameScene вызывает из своего update().
   */
  update(): void {
    if (this.destroyed) return;
    const now = this.scene.time.now;
    let dt = now - this.prevTime;
    this.prevTime = now;
    // На первом кадре или после паузы dt может быть большим/отрицательным —
    // clamp к безопасному диапазону (max 250 мс = 4 fps).
    if (dt < 0) dt = 0;
    if (dt > 250) dt = 250;
    this.slowmoState.update(dt);
  }

  /** Сброс в начальное состояние (для restart игры). */
  reset(): void {
    this.swordState.reset();
    this.slowmoState.reset();
    this.prevTime = this.scene.time.now;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
  }
}
