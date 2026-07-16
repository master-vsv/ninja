import Phaser from 'phaser';
import { eventBus } from '../events/EventBus';
import { EVENT, type GameOverReason } from '../events/types';
import { InputSystem } from '../systems/InputSystem';
import { SpawnDirector } from '../systems/SpawnDirector';
import { BodySplitter } from '../systems/BodySplitter';
import { SliceSystem } from '../systems/SliceSystem';
import { BombSystem } from '../systems/BombSystem';
import { ScoreSystem } from '../systems/ScoreSystem';
import { LifeSystem } from '../systems/LifeSystem';
import { FXSystem } from '../systems/FXSystem';
import { SwordSystem } from '../systems/SwordSystem';
import { HapticsSystem } from '../systems/HapticsSystem';
import { Profiler } from '../perf/Profiler';
import { LifeState } from '../game/LifeState';
import { ScoreState } from '../game/ScoreState';
import { ComboState } from '../game/ComboState';
import { LevelState } from '../game/LevelState';
import { GameOverGate } from '../game/GameOverGate';
import { PowerUpState } from '../game/PowerUpState';
import type { PowerUpType } from '../game/PowerUpType';
import { WaveState } from '../wave/WaveState';
import { HUDScene } from './HUDScene';
import { GameOverScene } from './GameOverScene';
import { SLOWMO_SPAWN_DELAY_MULTIPLIER, getSwordProps } from '../sword/SwordProps';
import { getUnlockedSwords } from '../sword/SwordUnlock';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/game';
import type { SwordType } from '../events/types';
import { CYBER, MONO_FONT } from './CyberpunkBackground';

/**
 * GameScene (фаза 4 + расширение фазы 5) — Phaser.Scene-фасад игровой сцены.
 *
 * Назначение:
 *   - создаёт shared state (LifeState, ScoreState, GameOverGate, SwordState,
 *     SlowmoState) и регистрирует его в game.registry (для HUD/GameOver);
 *   - инстанцирует системы: InputSystem, SpawnDirector, BodySplitter, SliceSystem,
 *     FXSystem, BombSystem, ScoreSystem, LifeSystem, SwordSystem (все с shared state);
 *   - запускает HUD оверлей через scene.launch('HUDScene');
 *   - подключает SpawnDirector к простому интервалу спавна (волны — фаза 6);
 *   - ЕДИНСТВЕННЫЙ консамер 'game-over': при событии pause('GameScene') +
 *     launch('GameOverScene'). Идемпотентность обеспечивается GameOverGate
 *     на стороне эмитентов — повторные эмиты не дойдут до handler'а дважды
 *     (handler сам защищён флагом isGameOverPending);
 *   - в update() пробрасывает вызовы в системы (Input, Spawn, BodySplitter,
 *     Slice, SwordSystem, FXSystem).
 *
 * Фаза 5: добавлен SwordSystem + fake-slowmo интеграция со spawnTimer
 * (delay × SLOWMO_SPAWN_DELAY_MULTIPLIER при isActive). НЕ использует timeScale.
 * Фаза 6: волны (WaveConfig) вместо фиксированного интервала.
 * Фаза 7: Profiler (recordFrame/drawCalls) + опциональный debug-оверлей (F3) +
 * HapticsSystem (navigator.vibrate на slice/bomb/gameover, мобайл-only).
 *
 * Цепочка: MenuScene → scene.start('GameScene'). Старт игры — кнопкой Play в Menu.
 */
export class GameScene extends Phaser.Scene {
  /** Ключ сцены. */
  static readonly KEY = 'GameScene';

  private inputSystem?: InputSystem;
  private spawner?: SpawnDirector;
  private bodySplitter?: BodySplitter;
  private sliceSystem?: SliceSystem;
  private fxSystem?: FXSystem;
  private bombSystem?: BombSystem;
  private scoreSystem?: ScoreSystem;
  private lifeSystem?: LifeSystem;
  private swordSystem?: SwordSystem;
  /** Фаза 7: вибро-отклики на slice/bomb/gameover (мобайл-only, noop без API). */
  private hapticsSystem?: HapticsSystem;
  /** Фаза 7: метрики производительности (fps/p95/drawCalls). */
  private profiler?: Profiler;
  /** Timestamp предыдущего кадра для расчёта frame time (performance.now). */
  private lastFrameTime = 0;
  /** Debug-оверлей (F3) с метриками профайлера. */
  private debugOverlay?: Phaser.GameObjects.Text;
  /** Видимость debug-оверлея (toggle по F3). */
  private debugVisible = false;
  private spawnTimer?: Phaser.Time.TimerEvent;
  /**
   * Фича «баннер разблокировки меча»: крупный overlay-Text, показываемый на ~2 сек
   * при росте уровня, если открылся новый меч. Храним ссылку для замены/сброса
   * при повторных level-up и корректного cleanup при shutdown.
   */
  private swordUnlockBanner?: Phaser.GameObjects.Text;

  /** Shared pure-logic состояние (переживает один игровой цикл). */
  private lifeState?: LifeState;
  private scoreState?: ScoreState;
  private comboState?: ComboState;
  /** Состояние уровня (LEVEL N) — отображение в HUD, не влияет на геймплей. */
  private levelState?: LevelState;
  private waveState?: WaveState;
  private gameOverGate?: GameOverGate;
  /**
   * Состояние активного power-up эффекта (shrink/grow/slow). Pull-модель:
   * SpawnDirector читает getScaleMultiplier/getSpeedMultiplier каждый кадр.
   * Активируется через событие 'power-up' от SliceSystem при разрезе спец-фигуры.
   */
  private powerUpState?: PowerUpState;

  /** Отписки от EventBus — сохраняются для корректного shutdown. */
  private readonly unsubs: Array<() => void> = [];
  /** Защита от повторного shutdown. */
  private shutDownHandled = false;
  /** Защита от повторной обработки 'game-over' (бэкап флага gate). */
  private isGameOverPending = false;

  constructor() {
    super({ key: GameScene.KEY });
  }

  create(): void {
    this.shutDownHandled = false;
    this.isGameOverPending = false;

    // Shared pure-logic состояние — ОДИН экземпляр на игру.
    // Кладём в game.registry для HUD/GameOver (без жёсткой типизации через any).
    this.lifeState = new LifeState();
    this.scoreState = new ScoreState();
    this.comboState = new ComboState();
    this.waveState = new WaveState();
    this.levelState = new LevelState();
    this.gameOverGate = new GameOverGate();
    // PowerUpState: pull-модель из SpawnDirector (scale/speed multiplier).
    this.powerUpState = new PowerUpState();
    HUDScene.registerLifeState(this.registry, this.lifeState);
    HUDScene.registerScoreState(this.registry, this.scoreState);
    HUDScene.registerComboState(this.registry, this.comboState);
    HUDScene.registerWaveState(this.registry, this.waveState);
    HUDScene.registerLevelState(this.registry, this.levelState);
    HUDScene.registerPowerUpState(this.registry, this.powerUpState);

    // SwordSystem (фаза 5) — инстанциируем ДО SliceSystem/FXSystem, чтобы
    // передать им shared swordState/slowmoState через геттеры.
    this.swordSystem = new SwordSystem(this);
    HUDScene.registerSwordSystem(this.registry, this.swordSystem);

    // InputSystem (фаза 1): pointer events, trail buffer, audio unlock.
    this.inputSystem = new InputSystem(this, {
      // Цвет следа свайпа — от активного меча (forged=cyan, welding=yellow, plasma=magenta, radiation=green).
      getSwordColor: () => this.swordSystem?.getCurrentColor() ?? 0xffffff,
    });

    // SpawnDirector (фаза 2 + расширение фазы 6): спавн NDT-объектов + деспавн
    // + emit 'miss'. Фаза 6: getWaveConfig pull-модель — bombPercent и
    // speedMultiplier берутся из текущей волны.
    // Power-up: getPowerUpState — scale/speed multiplier для spawn/draw.
    this.spawner = new SpawnDirector(this, {
      eventBus,
      getWaveConfig: () => this.waveState?.getCurrent(),
      getPowerUpState: () => this.powerUpState,
    });

    // BodySplitter (фаза 3): разрезает Matter-тела через PolyK + poly-decomp.
    this.bodySplitter = new BodySplitter(this);

    // SliceSystem (фаза 3 + расширение фазы 5): связывает InputSystem.trail +
    // SpawnDirector + BodySplitter. Геттеры из SwordSystem применяют свойства
    // активного меча: maxTargets (plasma=3) и swordType (заполняется в SliceEvent).
    this.sliceSystem = new SliceSystem(this, {
      trail: this.inputSystem.trail,
      spawner: this.spawner,
      bodySplitter: this.bodySplitter,
      eventBus,
      getMaxTargets: () => this.swordSystem?.getMaxTargets() ?? Infinity,
      getSwordType: () => this.swordSystem?.getSwordType() ?? null,
    });

    // FXSystem (фаза 3, MIN-JUICE + расширение фазы 5): звук/частицы/screen-shake +
    // welding-огонь + green-glow overlay при fake-slowmo (slowmoState pull-модель).
    this.fxSystem = new FXSystem(this, {
      slowmoState: this.swordSystem.slowmoState,
    });

    // Life/Score/Bomb — реальные системы фазы 4 (заменили stubs фазы 3).
    // Все используют shared state из game.registry (через DI).
    this.lifeSystem = new LifeSystem(this, {
      eventBus,
      lifeState: this.lifeState,
      gameOverGate: this.gameOverGate,
      // Shield (каска): упущенные объекты не отнимают жизни при активном shield.
      getPowerUpState: () => this.powerUpState,
    });
    this.scoreSystem = new ScoreSystem(this, {
      eventBus,
      scoreState: this.scoreState,
      comboState: this.comboState,
      // Фича «комбо → +жизнь»: ScoreSystem восстанавливает жизнь при комбо-кратно-5.
      lifeState: this.lifeState,
    });
    this.bombSystem = new BombSystem(this, {
      eventBus,
      gameOverGate: this.gameOverGate,
      lifeState: this.lifeState,
    });

    // Фаза 7: HapticsSystem — вибро-отклики на slice/bomb/gameover.
    // canVibrate feature-detect внутри HapticsState; без navigator.vibrate — noop.
    this.hapticsSystem = new HapticsSystem(this, { eventBus });

    // Фаза 7: Profiler — каркас для замера fps/p95/drawCalls.
    this.profiler = new Profiler();
    this.lastFrameTime = performance.now();

    // ЕДИНСТВЕННЫЙ консамер 'game-over': pause + launch overlay.
    // Идемпотентность на стороне GameScene: флаг isGameOverPending дублирует gate
    // на случай race condition между эмитом и обработкой.
    this.unsubs.push(
      eventBus.on(EVENT.gameOver, (payload) => {
        const p = payload as { reason: GameOverReason };
        this.handleGameOver(p.reason);
      }),
    );

    // Power-up: при разрезе спец-фигуры активируем временный эффект (5 сек)
    // + камера-flash (вспышка экрана) + звук. SliceSystem эмитит 'power-up'
    // вдогонку к 'slice' (объект режется как обычный — очки начисляются отдельно).
    this.unsubs.push(
      eventBus.on(EVENT.powerUp, (payload) => {
        const p = payload as { type: PowerUpType };
        this.handlePowerUp(p.type);
      }),
    );

    // Фаза 6: spawnTimer.delay динамически = 1000 / waveConfig.spawnRate.
    // Старый фиксированный spawnIntervalMs (2500) больше не используется;
    // оставлен только как fallback, если WaveState недоступен.
    const initialWave = this.waveState.getCurrent();
    const initialDelay = 1000 / initialWave.spawnRate;
    this.spawnTimer = this.time.addEvent({
      delay: initialDelay,
      loop: true,
      callback: () => this.spawner?.spawnRandom(),
    });

    // HUD оверлей — параллельная сцена поверх GameScene.
    this.scene.launch(HUDScene.KEY);

    // Фаза 7: F3 — toggle debug-оверлея с метриками профайлера (fps/p95/drawCalls).
    // Оверлей создаётся лениво при первом нажатии (минимум объектов по умолчанию).
    this.input.keyboard?.on('keydown-F3', () => this.toggleDebugOverlay());

    // Корректный cleanup при shutdown сцены (scene.stop / scene.start).
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.handleShutdown, this);
  }

  override update(): void {
    // Фаза 7: замер frame time (performance.now дельта) — ДО систем, чтобы
    // захватить полный кадр (включая системы и render предыдущего кадра).
    const now = performance.now();
    if (this.lastFrameTime > 0) {
      this.profiler?.recordFrame(now - this.lastFrameTime);
    }
    this.lastFrameTime = now;

    this.inputSystem?.update();
    this.spawner?.update();
    // PowerUpState тикаем ДО систем: SpawnDirector в этом кадре уже работает
    // с обновлённым состоянием (множители scale/speed актуальны).
    this.powerUpState?.update(this.game.loop.delta);
    this.bodySplitter?.update();
    // SwordSystem тиких SlowmoState ДО SliceSystem: fake-slowmo применяется
    // к spawnTimer после, а SliceSystem в этом кадре работает с уже обновлённым
    // состоянием меча/лимита целей.
    this.swordSystem?.update();
    this.sliceSystem?.update();
    // FXSystem.update() управляет green-glow overlay (pull-модель SlowmoState).
    this.fxSystem?.update();
    // Фаза 6: прогрессия волн (dtSec из основного цикла Phaser).
    this.waveState?.update(this.game.loop.delta / 1000);
    // Фаза 6: обновляем combo window (timeout по nowMs).
    this.scoreSystem?.update(this.time.now);
    // Уровень = floor(score/1000)+1. Только отображение, не влияет на геймплей.
    // При повышении — звуковой сигнал (визуальную вспышку делает HUDScene).
    if (this.levelState && this.scoreState) {
      // prevLevel фиксируем ДО update — нужен для определения вновь открытого меча.
      const prevLevel = this.levelState.level;
      const res = this.levelState.update(this.scoreState.score);
      if (res.leveledUp) {
        this.playSound('new-best', 0.6);
        // При повышении уровня — полное восстановление жизней.
        this.lifeState?.reset();
        // Фича «баннер разблокировки меча»: если на новом уровне открылся меч,
        // которого не было на prevLevel — показываем крупный overlay-баннер.
        const before = getUnlockedSwords(prevLevel);
        const after = getUnlockedSwords(res.newLevel);
        const newlyUnlocked = after.find((s) => !before.includes(s));
        if (newlyUnlocked) {
          this.showSwordUnlockBanner(newlyUnlocked);
        }
      }
    }
    // Применяем spawnTimer.delay = (1000 / wave.spawnRate) × slowmoMul.
    this.applySpawnTimerDelay();

    // Фаза 7: draw calls из renderer.renderCount (отражает предыдущий кадр).
    this.profiler?.setDrawCalls(this.readRenderCount());
    // Обновляем debug-оверлей, если виден.
    if (this.debugVisible) this.updateDebugOverlay();
  }

  /**
   * Фаза 7: чтение renderer.renderCount (WebGL) для аудита draw calls.
   * CanvasRenderer не имеет renderCount — возвращаем 0. Guard на случай отсутствия renderer.
   * Цель план: <50 mobile / <200 desktop.
   */
  private readRenderCount(): number {
    try {
      const renderer = this.game.renderer as { renderCount?: number } | undefined;
      return typeof renderer?.renderCount === 'number'
        ? renderer.renderCount
        : 0;
    } catch {
      return 0;
    }
  }

  /** Фаза 7: toggle debug-оверлея с метриками профайлера по F3. */
  private toggleDebugOverlay(): void {
    this.debugVisible = !this.debugVisible;
    if (this.debugVisible) {
      this.ensureDebugOverlay();
      this.debugOverlay?.setVisible(true);
      this.updateDebugOverlay();
    } else {
      this.debugOverlay?.setVisible(false);
    }
  }

  /** Лениво создаёт debug-оверлей (Phaser Text, левый-нижний угол, CYBER-стиль). */
  private ensureDebugOverlay(): void {
    if (this.debugOverlay) return;
    try {
      const text = this.add
        .text(12, 60, '', {
          fontFamily: MONO_FONT,
          fontSize: '12px',
          color: CYBER.cyanCss,
          backgroundColor: '#05050fcc',
          padding: { x: 6, y: 4 },
        })
        .setOrigin(0, 0)
        .setShadow(0, 0, CYBER.cyanCss, 4, true, true);
      text.setDepth(60);
      text.setScrollFactor(0);
      this.debugOverlay = text;
    } catch {
      // Headless/тесты — add.text может отсутствовать, не падаем.
    }
  }

  /** Обновляет содержимое debug-оверлея из snapshot профайлера. */
  private updateDebugOverlay(): void {
    if (!this.debugOverlay || !this.profiler) return;
    const s = this.profiler.snapshot();
    const line = `FPS ${s.fps.toFixed(0)} | p95 ${s.p95FrameMs.toFixed(1)}ms | phys ${s.p95PhysicsStepMs.toFixed(1)}ms | draw ${s.drawCalls} | pool ${this.bodySplitter?.poolSize ?? 0}`;
    this.debugOverlay.setText(line);
  }

  /**
   * Безопасное проигрывание звука: уважает mute-флаг и проверяет наличие ассета.
   * Не падает при ошибках аудио. По образцу GameOverScene.playSound.
   */
  private playSound(key: string, volume: number): void {
    try {
      if (this.registry.get('ndt:mute') === true) return;
      if (!this.game.cache.audio.exists(key)) return;
      this.sound.play(key, { volume });
    } catch {
      // Аудио недоступно (headless/тесты) — silently ignore.
    }
  }

  /**
   * Фича «баннер разблокировки меча»: крупный overlay-Text по центру экрана
   * на ~2 сек. Цвет и glow — от разблокированного меча. Анимация: alpha in/out
   * (yoyo) + pop-in масштабом (Back.easeOut). Удаляется через delayedCall(2000).
   *
   * Идемпотентен при повторных level-up: предыдущий баннер уничтожается,
   * его tween'ы убираются. Баннер рендерится в display-списке GameScene
   * (под HUDScene-оверлеем) — по центру экрана, без конфликта с HUD сверху/снизу.
   *
   * @param swordType тип вновь разблокированного меча.
   */
  private showSwordUnlockBanner(swordType: SwordType): void {
    // Сброс предыдущего баннера (tween + объект), если level-up пришёл повторно.
    if (this.swordUnlockBanner) {
      this.tweens.killTweensOf(this.swordUnlockBanner);
      this.swordUnlockBanner.destroy();
      this.swordUnlockBanner = undefined;
    }

    const props = getSwordProps(swordType);
    const banner = this.add
      .text(
        GAME_WIDTH / 2,
        GAME_HEIGHT / 2,
        `SWORD UNLOCKED: ${swordType.toUpperCase()}`,
        {
          fontFamily: MONO_FONT,
          fontSize: '40px',
          color: props.colorCss,
          fontStyle: 'bold',
        },
      )
      .setOrigin(0.5)
      .setDepth(100)
      .setAlpha(0)
      .setScale(0.6);
    banner.setShadow(0, 0, props.colorCss, 24, true, true);
    this.swordUnlockBanner = banner;

    // alpha in → hold → out (yoyo с hold даёт полный цикл за ~2 сек).
    this.tweens.add({
      targets: banner,
      alpha: { from: 0, to: 1 },
      duration: 250,
      yoyo: true,
      hold: 1500,
      ease: 'Cubic.easeOut',
    });
    // Pop-in масштабом: эффект «пульса» при появлении баннера.
    this.tweens.add({
      targets: banner,
      scale: { from: 0.6, to: 1 },
      duration: 300,
      ease: 'Back.easeOut',
    });

    this.time.delayedCall(2000, () => {
      if (this.swordUnlockBanner === banner) {
        this.swordUnlockBanner = undefined;
      }
      banner.destroy();
    });

    this.playSound('equip-unlock', 0.6);
  }

  /**
   * Обработка power-up эффекта при разрезе спец-фигуры:
   *   - активация PowerUpState (5 сек действия, продление/смена типа по контракту);
   *   - вспышка экрана через camera.flash (короткая, цвет-нейтральная);
   *   - звуковой сигнал (переиспользуем 'new-best' как универсальный позитивный cue).
   *
   * @param type тип активируемого эффекта (shrink/grow/slow).
   */
  private handlePowerUp(type: PowerUpType): void {
    this.powerUpState?.activate(type);
    // Вспышка экрана: короткая, без цвета (power-up цвет уже виден на фигуре/ауре).
    try {
      this.cameras.main.flash(200, 255, 255, 255);
    } catch {
      // Headless/тесты — cameras могут быть недоступны, не падаем.
    }
    this.playSound('new-best', 0.6);
  }

  /**
   * Динамический spawnTimer.delay: волна + fake-slowmo (риск №9 — БЕЗ timeScale).
   *
   * Фаза 6: delay = (1000 / waveConfig.spawnRate) × (slowmoActive ?
   * SLOWMO_SPAWN_DELAY_MULTIPLIER : 1). Slowmo применяется ПОВЕРХ волны —
   * идемпотентно: каждый кадр перевычисляется полное значение, флаг состояния
   * не нужен (не накапливается ×2 ×2 ×2...).
   *
   * ВАЖНО: Phaser-типы объявляют TimerEvent.delay как readonly, но в runtime
   * свойство изменяемое и Phaser учитывает новое значение в следующем тике.
   * Cast убирает ложное ограничение типов, не меняя поведения.
   */
  private applySpawnTimerDelay(): void {
    if (!this.spawnTimer || !this.waveState) return;
    const wave = this.waveState.getCurrent();
    const slowmoActive = this.swordSystem?.slowmoState.isActive ?? false;
    const slowmoMul = slowmoActive ? SLOWMO_SPAWN_DELAY_MULTIPLIER : 1;
    const newDelay = (1000 / wave.spawnRate) * slowmoMul;
    // Cast для обхода readonly-типа (runtime-свойство изменяемое).
    const mutableTimer = this.spawnTimer as unknown as { delay: number };
    if (mutableTimer.delay !== newDelay) {
      mutableTimer.delay = newDelay;
    }
  }

  /**
   * Обработка game-over: pause GameScene + launch GameOver overlay.
   * Идемпотентна — повторные эмиты (даже если прошли gate) блокируются флагом.
   */
  private handleGameOver(reason: GameOverReason): void {
    if (this.isGameOverPending) return;
    this.isGameOverPending = true;

    // Регистрируем причину для GameOverScene (для отображения игроку).
    GameOverScene.registerReason(this.registry, reason);

    // Останавливаем спавн.
    this.spawnTimer?.remove();
    this.spawnTimer = undefined;

    // Полный STOP GameScene (не pause). Pause оставляет сцену в PAUSED-статусе,
    // из-за чего ни scene.start, ни scene.restart, ни resume+stop+start не
    // реактивируют Clock корректно (Phaser batching конфликтует) → после restart
    // сцена «замерзает» (isActive=true, но time не тикает, спавн не работает).
    // Stop вызывает SHUTDOWN → handleShutdown уничтожает системы + Clock;
    // restart тогда = чистый scene.start = гарантированный fresh create().
    // Потеря: замороженный кадр под GameOver-оверлеем — компенсируется cyberpunk-фоном.
    this.scene.stop(GameScene.KEY);
    // Launch GameOverScene поверх.
    this.scene.launch(GameOverScene.KEY);
  }

  /** Завершение работы: отписки, таймеры, уничтожение систем. Идемпотентен. */
  private handleShutdown = (): void => {
    if (this.shutDownHandled) return;
    this.shutDownHandled = true;
    this.spawnTimer?.remove();
    this.spawnTimer = undefined;
    // Фича «баннер разблокировки меча»: Phaser уничтожает children сцены при
    // shutdown, но ссылка на баннер остаётся — сбрасываем, чтобы при restart
    // не вызвать destroy() на уже уничтоженном объекте.
    this.swordUnlockBanner = undefined;
    for (const off of this.unsubs) off();
    this.unsubs.length = 0;
    // Порядок: SliceSystem → BodySplitter → spawner (spawner владеет телами).
    this.sliceSystem?.destroy();
    this.sliceSystem = undefined;
    this.fxSystem?.destroy();
    this.fxSystem = undefined;
    this.bombSystem?.destroy();
    this.bombSystem = undefined;
    this.scoreSystem?.destroy();
    this.scoreSystem = undefined;
    this.lifeSystem?.destroy();
    this.lifeSystem = undefined;
    this.swordSystem?.destroy();
    this.swordSystem = undefined;
    // Фаза 7: HapticsSystem отписывается от slice/game-over.
    this.hapticsSystem?.destroy();
    this.hapticsSystem = undefined;
    this.bodySplitter?.destroy();
    this.bodySplitter = undefined;
    this.inputSystem?.destroy();
    this.inputSystem = undefined;
    this.spawner?.destroy();
    this.spawner = undefined;
  };
}
