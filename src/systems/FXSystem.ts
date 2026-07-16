import Phaser from 'phaser';
import type { EventBus } from '../events/EventBus';
import { eventBus as defaultEventBus } from '../events/EventBus';
import { EVENT, type SwordType } from '../events/types';
import type { SliceEvent } from '../events/SliceEvent';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/game';
import type { SlowmoState } from '../sword/SlowmoState';
import { sliceNormal, type Vec2 } from '../slice/Geometry';

/**
 * FXSystem (фаза 3 — MIN-JUICE + расширение фазы 5 для мечей).
 *
 * Реагирует на SliceEvent:
 *   - звук разреза (свой пул по типу меча), ЕСЛИ ассет загружен;
 *   - уникальный визуальный эффект по event.swordType;
 *   - микро screen-shake (camera shake ≤4px, 80мс).
 *
 * Расширение фазы 5 (уникальные эффекты мечей):
 *   - forged:    cyan осколки + тонкая cyan вспышка-линия вдоль среза;
 *   - welding:   оранжевые/жёлтые искры с «падением» + горящие «языки» вдоль среза;
 *   - plasma:    magenta молния (зигзаг) + белый core + magenta вспышки;
 *   - radiation: green glow-аура в точке реза + green капли с trickle.
 *
 * ВАЖНО про Canvas: Phaser ParticleEmitter НЕ рендерится на Canvas renderer
 * (WSL/software). Все эффекты — через Graphics + tweens (fillRect/strokePath +
 * scene.tweens.add), по образцу BombSystem.spawnExplosionFx. this.scene.add.particles
 * НЕ используется.
 *
 * Без жёсткой зависимости от аудио-ассетов: звук опционален, не падать если нет.
 * Все FX-вызовы обёрнуты в try/catch — headless/тесты без scene.add не роняют игру.
 *
 * ВАЖНО: fake-slowmo НЕ использует scene.time.timeScale (ломает Verlet, риск №9).
 * Только визуальный green-glow + замедление спавна (см. GameScene).
 */

/** Опции конструктора FXSystem. */
export interface FXSystemOptions {
  /** Длительность screen-shake, мс. По умолчанию 80. */
  readonly shakeDurationMs?: number;
  /** Интенсивность screen-shake (доля от 1.0). По умолчанию 0.004 (≈4px при 1000px). */
  readonly shakeIntensity?: number;
  /**
   * Shared SlowmoState для отрисовки green-glow overlay при fake-slowmo.
   * Если не задан — overlay не показывается (обратная совместимость).
   */
  readonly slowmoState?: SlowmoState;
}

/** Дефолты — зафиксированы планом фазы 3 (juice: ≤4px shake, 80мс). */
const DEFAULT_SHAKE_DURATION_MS = 80;
const DEFAULT_SHAKE_INTENSITY = 0.004;

/** Neon-green для radiation overlay и FX. */
const RADIATION_GREEN = 0x39ff14;
/** Палитра CYBER (продублирована числами — без импорта Phaser-зависимой сцены). */
const FORGED_CYAN = 0x00f0ff;
const PLASMA_MAGENTA = 0xff2bd6;
/** Orange/red оттенки огня для welding. */
const WELDING_FIRE_TINTS = [0xff8a00, 0xffe24a, 0xff5a00] as const;

/**
 * Пулы ключей звука по мечу. На каждый slice выбирается случайный ключ из пула —
 * вариативность звука делает повторяющиеся разрезы менее монотонными.
 * Звук play'ится только если ассет загружен (PreloadScene) и звук не muted.
 */
const SLICE_SOUND_KEYS = ['slice-1', 'slice-2', 'slice-3'] as const;
const SWIPE_SOUND_KEYS = ['swipe-1', 'swipe-2', 'swipe-3'] as const;
const PLASMA_SOUND_KEYS = ['combo-1', 'combo-2', 'combo-3'] as const;
/** Fallback для swordType=null (не должно случаться в проде, но для устойчивости). */
const FALLBACK_SOUND_KEYS = [
  'slice-1',
  'slice-2',
  'slice-3',
  'swipe-1',
  'swipe-2',
  'swipe-3',
] as const;

/** Громкость звука разреза (немного громче, чем раньше — под уникальные эффекты). */
const SLICE_SOUND_VOLUME = 0.4;
/** Z-глубина для FX-объектов (выше фрагментов, ниже slowmo overlay). */
const FX_DEPTH = 20;

export class FXSystem {
  private readonly eventBus: EventBus;
  private readonly offSlice: () => void;
  private readonly shakeDurationMs: number;
  private readonly shakeIntensity: number;
  /** SlowmoState для green-glow overlay (опционально — фаза 5). */
  private readonly slowmoState?: SlowmoState;
  /** Green-glow overlay (создаётся лениво при первом update со slowmo). */
  private slowmoOverlay?: Phaser.GameObjects.Graphics;
  /** Кэш состояния overlay (чтобы не передвигать каждый кадр без нужды). */
  private slowmoOverlayVisible = false;
  private destroyed = false;

  constructor(
    protected readonly scene: Phaser.Scene,
    options: FXSystemOptions = {},
  ) {
    this.eventBus = defaultEventBus;
    this.shakeDurationMs = options.shakeDurationMs ?? DEFAULT_SHAKE_DURATION_MS;
    this.shakeIntensity = options.shakeIntensity ?? DEFAULT_SHAKE_INTENSITY;
    this.slowmoState = options.slowmoState;

    this.offSlice = this.eventBus.on(EVENT.slice, (payload) => {
      this.handleSlice(payload as SliceEvent);
    });
  }

  /**
   * Per-frame апдейт (фаза 5): управляет green-glow overlay при fake-slowmo.
   * GameScene вызывает из своего update(). Без slowmoState — no-op.
   */
  update(): void {
    if (this.destroyed) return;
    this.updateSlowmoOverlay();
  }

  /** Обработка SliceEvent: звук + уникальный FX меча + screen-shake. */
  private handleSlice(event: SliceEvent): void {
    if (this.destroyed) return;
    // 1. Звук разреза — НЕ для бомбы (взрыв бомбы обрабатывается в BombSystem
    //    отдельным 'bomb'-звуком, здесь только slice/swipe/combo для обычных).
    if (!event.isBomb) {
      this.playSwordSound(event.swordType);
    }
    // 2. Уникальный визуальный эффект по типу меча (Graphics + tweens).
    this.emitSwordFx(event);
    // 3. Screen-shake (микро, ≤4px).
    this.shakeCamera();
  }

  /**
   * Выбирает звук разреза по типу меча и проигрывает случайной вариант из пула.
   *  - forged:    slice-1/2/3 (чистый разрез);
   *  - welding:   swipe-1/2/3 (огненный свайп);
   *  - plasma:    combo-1/2/3 (электрический разряд);
   *  - radiation: swipe-1/2/3 (тяжёлый свайп);
   *  - null/проч: fallback pool slice+swipe (обратная совместимость).
   * Не падает при отсутствии ассета или ошибки аудио.
   */
  private playSwordSound(swordType: SwordType | null): void {
    let keys: ReadonlyArray<string>;
    switch (swordType) {
      case 'forged':
        keys = SLICE_SOUND_KEYS;
        break;
      case 'welding':
      case 'radiation':
        keys = SWIPE_SOUND_KEYS;
        break;
      case 'plasma':
        keys = PLASMA_SOUND_KEYS;
        break;
      default:
        keys = FALLBACK_SOUND_KEYS;
        break;
    }
    const key = keys[Math.floor(Math.random() * keys.length)];
    this.playSound(key, SLICE_SOUND_VOLUME);
  }

  /**
   * Маршрутизатор уникальных визуальных эффектов по типу меча.
   * Все эффекты — через Graphics + tweens (НЕ Phaser ParticleEmitter, который
   * ненадёжно рендерится на Canvas renderer). Каждый emit-метод обёрнут в
   * try/catch отдельно, чтобы сбой одного эффекта не гасил остальные.
   *
   * swordType=null → fallback на cyan-стиль (как у forged).
   */
  private emitSwordFx(event: SliceEvent): void {
    if (this.destroyed) return;
    try {
      switch (event.swordType) {
        case 'forged':
          this.emitForged(event);
          break;
        case 'welding':
          this.emitWelding(event);
          break;
        case 'plasma':
          this.emitPlasma(event);
          break;
        case 'radiation':
          this.emitRadiation(event);
          break;
        default:
          // swordType=null или неизвестное значение — cyan-стиль (как forged).
          this.emitForged(event);
          break;
      }
    } catch {
      // Headless/тесты — Graphics/tweens могут отсутствовать, не падаем.
    }
  }

  /**
   * forged (cyan) — чистый ровный разрез.
   *   - 7 cyan осколков-квадратов, разлёт вдоль нормали реза (с чередованием
   *     стороны) + случайное смещение вдоль линии, fade (alpha→0, scale→0.3,
   *     ~300мс);
   *   - тонкая cyan вспышка-линия вдоль среза (strokePath from→to, alpha fade 200мс).
   */
  private emitForged(event: SliceEvent): void {
    const { from, to } = event.slice;
    const cx = (from.x + to.x) / 2;
    const cy = (from.y + to.y) / 2;
    const n = sliceNormal(from, to);
    const tangent: Vec2 = { x: -n.y, y: n.x };

    // Cyan осколки-квадраты.
    const shardCount = 7;
    for (let i = 0; i < shardCount; i++) {
      const g = this.scene.add.graphics();
      g.fillStyle(FORGED_CYAN, 1);
      const s = 5 + Math.random() * 4;
      g.fillRect(-s, -s, s * 2, s * 2);
      g.x = cx;
      g.y = cy;
      g.setDepth(FX_DEPTH);
      // Чередуем сторону от нормали + лёгкий разброс вдоль линии реза.
      const sign = i % 2 === 0 ? 1 : -1;
      const dist = 40 + Math.random() * 50;
      const lateral = (Math.random() - 0.5) * 40;
      const dx = n.x * dist * sign + tangent.x * lateral;
      const dy = n.y * dist * sign + tangent.y * lateral;
      this.scene.tweens.add({
        targets: g,
        x: cx + dx,
        y: cy + dy,
        alpha: { from: 1, to: 0 },
        scale: { from: 1, to: 0.3 },
        duration: 600 + Math.random() * 120,
        ease: 'Cubic.out',
        onComplete: () => g.destroy(),
      });
    }

    // Тонкая cyan вспышка-линия вдоль среза.
    const line = this.scene.add.graphics();
    line.lineStyle(2, FORGED_CYAN, 1);
    line.beginPath();
    line.moveTo(from.x - cx, from.y - cy);
    line.lineTo(to.x - cx, to.y - cy);
    line.strokePath();
    line.x = cx;
    line.y = cy;
    line.setDepth(FX_DEPTH + 1);
    this.scene.tweens.add({
      targets: line,
      alpha: { from: 1, to: 0 },
      duration: 500,
      ease: 'Cubic.out',
      onComplete: () => line.destroy(),
    });
  }

  /**
   * welding (orange/yellow) — огненный.
   *   - 12 оранжевых/жёлтых искр (tint 0xff8a00/0xffe24a/0xff5a00), разлёт +
   *     «падение» (gravity-подобный tween y-ускорение), lifespan ~600мс;
   *   - 4 горящих «языка пламени» вдоль линии среза (вертикальные fillRect,
   *     scale-up + alpha fade, 500-700мс).
   */
  private emitWelding(event: SliceEvent): void {
    const { from, to } = event.slice;
    const cx = (from.x + to.x) / 2;
    const cy = (from.y + to.y) / 2;
    const n = sliceNormal(from, to);
    const tangent: Vec2 = { x: -n.y, y: n.x };

    // Искры: разлёт + падение (gravity-подобный tween по y к концу).
    const sparkCount = 12;
    for (let i = 0; i < sparkCount; i++) {
      const g = this.scene.add.graphics();
      g.fillStyle(WELDING_FIRE_TINTS[i % WELDING_FIRE_TINTS.length], 1);
      const s = 4 + Math.random() * 4;
      g.fillRect(-s, -s, s * 2, s * 2);
      g.x = cx;
      g.y = cy;
      g.setDepth(FX_DEPTH);
      const sign = i % 2 === 0 ? 1 : -1;
      const dist = 35 + Math.random() * 55;
      const lateral = (Math.random() - 0.5) * 70;
      const dx = n.x * dist * sign + tangent.x * lateral;
      const dy = n.y * dist * sign + tangent.y * lateral;
      // Gravity: дополнительное смещение по y вниз к концу tween.
      const gravity = 50 + Math.random() * 60;
      this.scene.tweens.add({
        targets: g,
        x: cx + dx,
        y: cy + dy + gravity,
        alpha: { from: 1, to: 0 },
        scale: { from: 1.1, to: 0.2 },
        duration: 1100 + Math.random() * 200,
        ease: 'Cubic.in',
        onComplete: () => g.destroy(),
      });
    }

    // Горящий край: 4 «языка пламени» вдоль линии среза.
    const flameCount = 4;
    for (let i = 0; i < flameCount; i++) {
      const t = (i + 0.5) / flameCount;
      const px = from.x + (to.x - from.x) * t;
      const py = from.y + (to.y - from.y) * t;
      const g = this.scene.add.graphics();
      g.fillStyle(0xff8a00, 0.95);
      g.fillRect(-3, -12, 6, 24);
      g.fillStyle(0xffe24a, 0.8);
      g.fillRect(-2, -8, 4, 16);
      g.x = px;
      g.y = py;
      g.setDepth(FX_DEPTH + 1);
      this.scene.tweens.add({
        targets: g,
        scale: { from: 0.5, to: 1.6 },
        alpha: { from: 1, to: 0 },
        duration: 1000 + Math.random() * 400,
        ease: 'Cubic.out',
        onComplete: () => g.destroy(),
      });
    }
  }

  /**
   * plasma (magenta) — энергомолнии.
   *   - magenta «молния» по линии среза: зигзагообразная ломаная (6 сегментов,
   *     random-отклонения от прямой), magenta strokePath + белый core (тоньше),
   *     alpha fade за 250мс;
   *   - 5 magenta энергетических «вспышек» по линии молнии, быстрый разлёт + fade.
   */
  private emitPlasma(event: SliceEvent): void {
    const { from, to } = event.slice;
    const cx = (from.x + to.x) / 2;
    const cy = (from.y + to.y) / 2;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    // Нормаль для боковых отклонений зигзага.
    const nx = -dy / len;
    const ny = dx / len;

    // Молния: outer magenta + inner белый core. Каждая — отдельная Graphics с fade.
    const segments = 6;
    const drawBolt = (color: number, lineWidth: number, alpha: number, depth: number): void => {
      const g = this.scene.add.graphics();
      g.lineStyle(lineWidth, color, alpha);
      g.beginPath();
      g.moveTo(from.x - cx, from.y - cy);
      for (let i = 1; i <= segments; i++) {
        const t = i / segments;
        const baseX = from.x + dx * t - cx;
        const baseY = from.y + dy * t - cy;
        // Последний сегмент всегда на конце (иначе молния «не дойдёт» до to).
        const offset = i === segments ? 0 : (Math.random() - 0.5) * 30;
        g.lineTo(baseX + nx * offset, baseY + ny * offset);
      }
      g.strokePath();
      g.x = cx;
      g.y = cy;
      g.setDepth(depth);
      this.scene.tweens.add({
        targets: g,
        alpha: { from: alpha, to: 0 },
        duration: 550,
        ease: 'Cubic.out',
        onComplete: () => g.destroy(),
      });
    };
    drawBolt(PLASMA_MAGENTA, 4, 0.9, FX_DEPTH);
    drawBolt(0xffffff, 2, 1, FX_DEPTH + 1);

    // Magenta вспышки по линии молнии (быстрый разлёт + fade).
    const flashCount = 5;
    for (let i = 0; i < flashCount; i++) {
      const g = this.scene.add.graphics();
      g.fillStyle(PLASMA_MAGENTA, 1);
      const s = 5 + Math.random() * 4;
      g.fillRect(-s, -s, s * 2, s * 2);
      const t = Math.random();
      const baseX = from.x + dx * t;
      const baseY = from.y + dy * t;
      g.x = baseX;
      g.y = baseY;
      g.setDepth(FX_DEPTH + 2);
      const ang = Math.random() * Math.PI * 2;
      const dist = 30 + Math.random() * 40;
      this.scene.tweens.add({
        targets: g,
        x: baseX + Math.cos(ang) * dist,
        y: baseY + Math.sin(ang) * dist,
        alpha: { from: 1, to: 0 },
        scale: { from: 1, to: 0.2 },
        duration: 550,
        ease: 'Cubic.out',
        onComplete: () => g.destroy(),
      });
    }
  }

  /**
   * radiation (green) — радиоактивный.
   *   - green glow-аура в точке разреза: полупрозрачный green квадрат (alpha 0.3),
   *     scale-up + alpha fade за 400мс;
   *   - 9 green «капель» (fillRect), медленный разлёт + trickle (плавное падение
   *     по y к концу tween), alpha fade за ~500мс.
   */
  private emitRadiation(event: SliceEvent): void {
    const { from, to } = event.slice;
    const cx = (from.x + to.x) / 2;
    const cy = (from.y + to.y) / 2;
    const n = sliceNormal(from, to);
    const tangent: Vec2 = { x: -n.y, y: n.x };

    // Green glow-аура в точке разреза (полупрозрачный квадрат, scale-up + fade).
    const glow = this.scene.add.graphics();
    glow.fillStyle(RADIATION_GREEN, 0.3);
    glow.fillRect(-30, -30, 60, 60);
    glow.x = cx;
    glow.y = cy;
    glow.setDepth(FX_DEPTH - 1);
    this.scene.tweens.add({
      targets: glow,
      alpha: { from: 0.6, to: 0 },
      scale: { from: 0.4, to: 2.2 },
      duration: 900,
      ease: 'Cubic.out',
      onComplete: () => glow.destroy(),
    });

    // Green капли: медленный разлёт + trickle (плавное падение).
    const dropCount = 9;
    for (let i = 0; i < dropCount; i++) {
      const g = this.scene.add.graphics();
      g.fillStyle(RADIATION_GREEN, 1);
      const s = 4 + Math.random() * 3;
      g.fillRect(-s, -s, s * 2, s * 2);
      g.x = cx;
      g.y = cy;
      g.setDepth(FX_DEPTH);
      const sign = i % 2 === 0 ? 1 : -1;
      const dist = 30 + Math.random() * 40;
      const lateral = (Math.random() - 0.5) * 50;
      const dxv = n.x * dist * sign + tangent.x * lateral;
      const dyv = n.y * dist * sign + tangent.y * lateral;
      const trickle = 30 + Math.random() * 30;
      this.scene.tweens.add({
        targets: g,
        x: cx + dxv,
        y: cy + dyv + trickle,
        alpha: { from: 1, to: 0 },
        duration: 1000 + Math.random() * 120,
        ease: 'Cubic.out',
        onComplete: () => g.destroy(),
      });
    }
  }

  /**
   * Фаза 5: green-glow overlay/vignette при активном fake-slowmo.
   * Pull-модель: каждый кадр читает SlowmoState.isActive.
   * Overlay — полупрозрачный зелёный vignette по краям экрана.
   */
  private updateSlowmoOverlay(): void {
    if (!this.slowmoState) return;
    const active = this.slowmoState.isActive;
    if (active && !this.slowmoOverlayVisible) {
      this.showSlowmoOverlay();
      this.slowmoOverlayVisible = true;
    } else if (!active && this.slowmoOverlayVisible) {
      this.hideSlowmoOverlay();
      this.slowmoOverlayVisible = false;
    }
  }

  /** Создаёт и показывает green-glow overlay (vignette). */
  private showSlowmoOverlay(): void {
    if (this.slowmoOverlay) {
      this.slowmoOverlay.setVisible(true);
      return;
    }
    try {
      const g = this.scene.add.graphics();
      // Полупрозрачный зелёный vignette: несколько концентрических прямоугольников
      // с увеличивающейся alpha к краям экрана (имитация vignette).
      const steps = 6;
      for (let i = 0; i < steps; i++) {
        const t = i / (steps - 1);
        const alpha = 0.02 + 0.08 * t;
        const inset = (1 - t) * 80;
        g.fillStyle(RADIATION_GREEN, alpha);
        g.fillRect(
          inset,
          inset,
          GAME_WIDTH - inset * 2,
          GAME_HEIGHT - inset * 2,
        );
      }
      // Верхняя прозрачная зона для HUD (чтобы не перекрывать счёт/жизни).
      g.setDepth(50);
      this.slowmoOverlay = g;
    } catch {
      // В headless/тестах может не быть scene.add — игнорируем.
    }
  }

  /** Прячет green-glow overlay. */
  private hideSlowmoOverlay(): void {
    if (!this.slowmoOverlay) return;
    this.slowmoOverlay.setVisible(false);
  }

  /** Микро screen-shake камеры. ≤4px, 80мс — не сильно отвлекает. */
  private shakeCamera(): void {
    try {
      this.scene.cameras.main.shake(this.shakeDurationMs, this.shakeIntensity);
    } catch {
      // В тестах camera может отсутствовать — не падаем.
    }
  }

  /**
   * Универсальный хелпер проигрывания звука.
   * Соблюдает mute-флаг и проверяет наличие ассета в cache.
   * Все ошибки аудио глушатся — игра не должна падать из-за звука.
   */
  private playSound(key: string, volume: number): void {
    // Mute-флаг из game.registry (устанавливается в MenuScene, фаза 4).
    if (this.isMuted()) return;
    if (!this.soundExists(key)) return;
    try {
      this.scene.sound.play(key, { volume });
    } catch {
      // Любая ошибка аудио — не роняем игру. Звук опционален.
    }
  }

  /** Читает mute-флаг из game.registry (фаза 4: MenuScene переключает). */
  private isMuted(): boolean {
    try {
      return this.scene.game.registry.get('ndt:mute') === true;
    } catch {
      return false;
    }
  }

  /** Проверка наличия звукового ассета в Phaser audio-cache по ключу. */
  private soundExists(key: string): boolean {
    try {
      return this.scene.game.cache.audio.exists(key);
    } catch {
      return false;
    }
  }

  /** Уничтожение: отписка от событий + удаление overlay. Идемпотентен. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.offSlice();
    if (this.slowmoOverlay) {
      try {
        this.slowmoOverlay.destroy();
      } catch {
        // игнорируем — уже уничтожен.
      }
      this.slowmoOverlay = undefined;
    }
    this.slowmoOverlayVisible = false;
  }
}
