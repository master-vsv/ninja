import type Phaser from 'phaser';
import type { EventBus } from '../events/EventBus';
import { eventBus as defaultEventBus } from '../events/EventBus';
import { EVENT, type GameOverReason } from '../events/types';
import type { SliceEvent } from '../events/SliceEvent';
import type { GameOverGate } from '../game/GameOverGate';
import { GameOverGate as DefaultGate } from '../game/GameOverGate';
import type { LifeState } from '../game/LifeState';
import { LifeState as DefaultLifeState } from '../game/LifeState';

/**
 * BombSystem (фаза 4) — тонкая Phaser-обёртка для обработки разреза трубы-бомбы.
 *
 * Назначение (план, фаза 4):
 *   - подписка на 'slice' через EventBus;
 *   - при SliceEvent(isBomb=true):
 *       • взрыв FX (частицы + camera.shake через scene);
 *       • эмит 'game-over' { reason: 'bomb' }, только если GameOverGate.mark
 *         вернул true (идемпотентность — защита от дублирования с LifeSystem);
 *   - reset() делегирует в GameOverGate.
 *
 * FX: camera.shake + взрыв частиц в точке разреза. Все FX-вызовы обёрнуты
 * в try/catch — сбой рендера не должен глушить эмит 'game-over' (gameplay-critical).
 *
 * Архитектура: идемпотентность game-over'а обеспечивается GameOverGate
 * (pure-logic, покрыт unit-тестами). Здесь только wiring.
 *
 * Контракт SliceEvent НЕ меняется между фазами — заглушка фазы 3 заменена
 * реальной логикой.
 */

/** Опции конструктора BombSystem. */
export interface BombSystemDeps {
  /** EventBus для подписки на 'slice'. По умолчанию — глобальный синглтон. */
  readonly eventBus?: EventBus;
  /** Shared идемпотентный вентиль game-over (владеет GameScene). */
  readonly gameOverGate?: GameOverGate;
  /**
   * Shared состояние жизней — разрез трубы отнимает 1 жизнь (НЕ мгновенный
   * game-over). Game-over наступает только при lives=0.
   */
  readonly lifeState?: LifeState;
}

/** Параметры FX взрыва по умолчанию. */
const DEFAULT_SHAKE_DURATION_MS = 400;
const DEFAULT_SHAKE_INTENSITY = 0.025; // сильнее обычного slice-shake
const DEFAULT_EXPLOSION_PARTICLES = 50;
/**
 * Задержка перед game-over после взрыва трубы (мс). Даёт игроку УВИДЕТЬ взрыв
 * (частицы + screen-shake), прежде чем GameOver-оверлей перекроет кадр.
 * Без задержки — «мгновенный переход в game over», взрыв не виден.
 */
const DEFAULT_BOMB_GAMEOVER_DELAY_MS = 850;
const DEFAULT_EXPLOSION_SOUND_KEY = 'bomb';

export class BombSystem {
  private readonly eventBus: EventBus;
  private readonly _gameOverGate: GameOverGate;
  private readonly _lifeState: LifeState;
  private readonly offSlice: () => void;
  /** Счётчик срабатываний (для отладки/тестов). */
  bombHitCount = 0;
  private destroyed = false;

  constructor(
    protected readonly scene: Phaser.Scene,
    deps: BombSystemDeps = {},
  ) {
    this.eventBus = deps.eventBus ?? defaultEventBus;
    this._gameOverGate = deps.gameOverGate ?? new DefaultGate();
    this._lifeState = deps.lifeState ?? new DefaultLifeState();

    this.offSlice = this.eventBus.on(EVENT.slice, (payload) => {
      this.handleSlice(payload as SliceEvent);
    });
  }

  /** Доступ к shared GameOverGate. */
  get gameOverGate(): GameOverGate {
    return this._gameOverGate;
  }

  /** Сброс gate (для restart игры). Делегирует в shared state. */
  reset(): void {
    this._gameOverGate.reset();
  }

  /** Обработка SliceEvent: если isBomb — взрыв + game-over emit. */
  private handleSlice(event: SliceEvent): void {
    if (this.destroyed) return;
    if (!event.isBomb) return;

    this.bombHitCount++;

    // FX: частицы + camera.shake + звук взрыва. Ошибки рендера/аудио не должны
    // ронять flow игры.
    this.spawnExplosionFx(event);
    this.shakeCamera();
    this.playExplosionSound();

    // Взрыв трубы отнимает 1 жизнь (НЕ мгновенный game-over).
    // Game-over наступает только когда жизни достигнут 0.
    const result = this._lifeState.loseLife();

    // ЗАДЕРЖКА перед game-over — дать проиграться взрыву. Эмитим только если
    // жизни закончились (result.gameOver). Gate.markGameOver идемпотентен.
    this.scene.time.delayedCall(DEFAULT_BOMB_GAMEOVER_DELAY_MS, () => {
      if (this.destroyed) return;
      if (result.gameOver) {
        const reason: GameOverReason = 'bomb';
        if (this._gameOverGate.markGameOver(reason)) {
          this.eventBus.emit(EVENT.gameOver, { reason });
        }
      }
    });
  }

  /**
   * Взрыв в точке разреза: центральный огненный шар + радиальный разлёт осколков.
   * Реализован через Graphics + tweens (НЕ ParticleEmitter) — Phaser particles
   * ненадёжно рендерятся на Canvas renderer (WSL/software), а Graphics+tweens
   * работают везде. Осколки — цветные круги, разлетающиеся радиально с fade.
   */
  private spawnExplosionFx(event: SliceEvent): void {
    try {
      const cx = (event.slice.from.x + event.slice.to.x) / 2;
      const cy = (event.slice.from.y + event.slice.to.y) / 2;
      const shardColors = [0xffaa33, 0xff5533, 0xffdd66, 0xffffff];
      const shardCount = DEFAULT_EXPLOSION_PARTICLES;

      // Радиальный разлёт осколков (fillRect — надёжнее fillCircle на Canvas).
      for (let i = 0; i < shardCount; i++) {
        const g = this.scene.add.graphics();
        g.fillStyle(shardColors[i % shardColors.length], 1);
        const r = 9 + Math.random() * 8;
        g.fillRect(-r, -r, r * 2, r * 2);
        g.x = cx;
        g.y = cy;
        g.setDepth(20);
        const angle = (i / shardCount) * Math.PI * 2 + Math.random() * 0.3;
        const dist = 90 + Math.random() * 110;
        this.scene.tweens.add({
          targets: g,
          x: cx + Math.cos(angle) * dist,
          y: cy + Math.sin(angle) * dist,
          alpha: { from: 1, to: 0 },
          scale: { from: 1.2, to: 0.3 },
          duration: 550 + Math.random() * 250,
          onComplete: () => g.destroy(),
        });
      }

      // Ударная волна — расширяющееся кольцо (strokeRect с tween scale + fade).
      const shock = this.scene.add.graphics();
      shock.lineStyle(4, 0xffdd66, 1);
      shock.strokeRect(-40, -40, 80, 80);
      shock.x = cx;
      shock.y = cy;
      shock.setDepth(22);
      this.scene.tweens.add({
        targets: shock,
        alpha: { from: 1, to: 0 },
        scale: { from: 0.3, to: 3.5 },
        duration: 480,
        ease: 'Cubic.out',
        onComplete: () => shock.destroy(),
      });

      // Центральный огненный шар — крупная вспышка с расширением и fade (fillRect).
      const ball = this.scene.add.graphics();
      ball.fillStyle(0xffcc44, 1);
      ball.fillRect(-50, -50, 100, 100);
      ball.fillStyle(0xffffff, 0.9);
      ball.fillRect(-26, -26, 52, 52);
      ball.lineStyle(4, 0xffffff, 0.9);
      ball.strokeRect(-50, -50, 100, 100);
      ball.x = cx;
      ball.y = cy;
      ball.setDepth(21);
      this.scene.tweens.add({
        targets: ball,
        alpha: { from: 1, to: 0 },
        scale: { from: 0.5, to: 2.8 },
        duration: 460,
        ease: 'Cubic.out',
        onComplete: () => ball.destroy(),
      });
    } catch {
      // Headless/тесты — Graphics/tweens могут отсутствовать, не падаем.
    }
  }

  /** Сильный screen-shake камеры для взрыва (заметнее обычного slice-shake). */
  private shakeCamera(): void {
    try {
      this.scene.cameras.main.shake(
        DEFAULT_SHAKE_DURATION_MS,
        DEFAULT_SHAKE_INTENSITY,
      );
    } catch {
      // Camera может отсутствовать в тестах — не падаем.
    }
  }

  /**
   * Проигрывает звук взрыва ('bomb', volume 0.6).
   * Соблюдает mute-флаг из game.registry 'ndt:mute' и проверяет наличие ассета.
   * Все ошибки аудио глушатся — в headless/тестах sound может отсутствовать.
   */
  private playExplosionSound(): void {
    try {
      const game = this.scene.game;
      // Respect mute: если звук выключен игроком — не играем.
      if (game.registry.get('ndt:mute') === true) return;
      // Проверяем наличие ассета в cache (PreloadScene мог не загрузить).
      if (!game.cache.audio.exists(DEFAULT_EXPLOSION_SOUND_KEY)) return;
      this.scene.sound.play(DEFAULT_EXPLOSION_SOUND_KEY, { volume: 0.6 });
    } catch {
      // Headless/тесты — scene.sound/game.registry могут отсутствовать, не падаем.
    }
  }

  /** Уничтожение: отписка от событий. Идемпотентен. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.offSlice();
  }
}

/**
 * Имя аудио-ассета взрыва (экспортируем для PreloadScene в будущем).
 * В MVP звук не загружается —BombSystem FX ограничивается частицами + shake.
 */
export const BOMB_SOUND_KEY = DEFAULT_EXPLOSION_SOUND_KEY;
