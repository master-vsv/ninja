import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/game';

/**
 * Палитра Cyberpunk Neon.
 *
 * Содержит как числовые значения (для Graphics.fillStyle / lineStyle / Rectangle),
 * так и CSS-строки (для Phaser.GameObjects.Text style.color и Text.setShadow).
 *
 * Назначение цветов:
 *   - cyan    — основной акцент (заголовки, счёт, glow);
 *   - magenta — вторичный (каймы кнопок, alert, Game Over);
 *   - yellow  — hi-score / рекорд / акценты.
 */
export const CYBER = {
  /** Глубокий тёмно-синий-чёрный (базовый фон). */
  bgDeep: 0x05050f,
  /** Тёмно-синий (панели HUD/overlay). */
  bgPanel: 0x0a0a18,
  /** Тёмно-серый для боковых панелей. */
  bgPanelSoft: 0x1a1a2e,
  /** Основной неон-cyan. */
  cyan: 0x00f0ff,
  /** Вторичный неон-magenta. */
  magenta: 0xff2bd6,
  /** Электрик-yellow (hi-score). */
  yellow: 0xf5d300,

  // CSS-строки для Text.style.color и setShadow.
  cyanCss: '#00f0ff',
  magentaCss: '#ff2bd6',
  yellowCss: '#f5d300',
  /** Тёмно-cyan для подзаголовков/причин (dim акцент). */
  dimCyanCss: '#1e6e78',
  /** Светло-белый с лёгким cyan-оттенком (основной текст кнопок). */
  whiteCss: '#e8f7ff',
  /** Приглушённый серо-cyan (служебные подписи). */
  mutedCss: '#4a5566',
} as const;

/** Моноширинный font-family для всех надписей в Cyberpunk-стиле. */
export const MONO_FONT = "'Consolas', 'Courier New', monospace";

/** Шаг grid-сетки, px. */
const GRID_STEP = 40;
/** Шаг scanlines, px (полоса + пропуск). */
const SCAN_STEP = 4;
/** Число парящих частиц (звёзд) в динамическом фоне. */
const PARTICLE_COUNT = 40;
/** Скорость скольжения grid, px/мс (множитель time). */
const GRID_SCROLL_SPEED = 0.03;

/** Опции фона-компонента. */
export interface CyberpunkBgOptions {
  /** Заливать тёмный базовый слой на весь холст (Menu/GameOver — true, HUD — false). */
  fillBase?: boolean;
  /** Alpha grid-линий. */
  gridAlpha?: number;
  /** Alpha scanlines. */
  scanAlpha?: number;
  /** Динамическая анимация grid + парящие частицы (true для основных сцен, false для HUD-overlay). */
  animated?: boolean;
}

/** Парящая частица-звезда (дрейф вверх + мерцание). */
interface BgParticle {
  x: number;
  y: number;
  speed: number; // px/кадр (дрейф вверх)
  size: number;
  alpha: number;
  phase: number; // фаза мерцания
  color: number; // cyan ИЛИ magenta
}

/**
 * CyberpunkBackground — переиспользуемый неоновый фон (статичный или динамический).
 *
 * Рисует на одном Graphics:
 *   - опциональный тёмный базовый слой (fillBase=true);
 *   - grid-сетку (cyan линии) — при animated=true линии СКОЛЬЗЯТ (offset по time),
 *     создавая эффект движения;
 *   - горизонтальные scanlines (CRT-эффект);
 *   - при animated=true — парящие мерцающие частицы-звёзды (cyan/magenta).
 *
 * Динамический режим подписывается на PRE_UPDATE сцены и перерисовывает Graphics
 * каждый кадр. Отписка при SHUTDOWN — утечки нет. Сцены НЕ нужно wiring в update().
 *
 * Использование: CyberpunkBackground.add(scene) в начале create(). Для overlay-сцен
 * (HUD) — { fillBase:false, gridAlpha:0.04, animated:false }.
 */
export class CyberpunkBackground {
  /**
   * Создаёт Graphics с фоном (depth 0). При animated=true — перерисовывается
   * каждый кадр (движущаяся grid + частицы). Возвращает graphics для тонкой настройки.
   */
  static add(
    scene: Phaser.Scene,
    opts: CyberpunkBgOptions = {},
  ): Phaser.GameObjects.Graphics {
    const fillBase = opts.fillBase ?? true;
    const gridAlpha = opts.gridAlpha ?? 0.15;
    const scanAlpha = opts.scanAlpha ?? 0.05;
    const animated = opts.animated ?? true;

    const g = scene.add.graphics();

    // Парящие частицы — только для динамического режима.
    const particles: BgParticle[] = animated ? createParticles() : [];

    /**
     * Перерисовка фона. offset — смещение grid (для анимации скольжения),
     * time — время сцены (мс, для мерцания частиц).
     */
    const draw = (offset: number, time: number): void => {
      g.clear();

      // Тёмный базовый слой.
      if (fillBase) {
        g.fillStyle(CYBER.bgDeep, 1);
        g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
      }

      // Grid-сетка со смещением (скольжение для динамики).
      g.lineStyle(1, CYBER.cyan, gridAlpha);
      const startX = -GRID_STEP + offset;
      const startY = -GRID_STEP + offset;
      for (let x = startX; x <= GAME_WIDTH + GRID_STEP; x += GRID_STEP) {
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, GAME_HEIGHT);
        g.strokePath();
      }
      for (let y = startY; y <= GAME_HEIGHT + GRID_STEP; y += GRID_STEP) {
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(GAME_WIDTH, y);
        g.strokePath();
      }

      // Scanlines (CRT/VHS).
      if (scanAlpha > 0) {
        g.fillStyle(0x000000, scanAlpha);
        for (let y = 0; y < GAME_HEIGHT; y += SCAN_STEP * 2) {
          g.fillRect(0, y, GAME_WIDTH, SCAN_STEP);
        }
      }

      // Парящие частицы-звёзды (дрейф вверх + мерцание синусом).
      if (animated) {
        for (const p of particles) {
          // Дрейф вверх (с пересчётом через time для стабильности при fps-провалах).
          p.y -= p.speed;
          if (p.y < -2) {
            p.y = GAME_HEIGHT + 2;
            p.x = Math.random() * GAME_WIDTH;
          }
          const twinkle = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(time * 0.004 + p.phase));
          g.fillStyle(p.color, p.alpha * twinkle);
          g.fillRect(p.x, p.y, p.size, p.size);
        }
      }
    };

    // Первичная отрисовка.
    draw(0, 0);

    // Динамический режим: перерисовка каждый кадр по PRE_UPDATE.
    if (animated) {
      const onUpdate = (_time: number, delta: number): void => {
        // offset растёт пропорционально delta (стабильно при любом fps).
        const off = (delta * GRID_SCROLL_SPEED) % GRID_STEP;
        // Накапливаем смещение в замыкании.
        acc += off;
        draw(acc % GRID_STEP, scene.time.now);
      };
      let acc = 0;
      scene.events.on(Phaser.Scenes.Events.PRE_UPDATE, onUpdate);
      // Отписка при shutdown сцены — иначе утечка listener + references.
      scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        scene.events.off(Phaser.Scenes.Events.PRE_UPDATE, onUpdate);
      });
    }

    g.setDepth(0);
    return g;
  }
}

/**
 * Создаёт N парящих частиц со случайными позициями/скоростями/цветами.
 * Цвета: cyan (основной) + изредка magenta (контраст-акцент).
 */
function createParticles(): BgParticle[] {
  const out: BgParticle[] = [];
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    out.push({
      x: Math.random() * GAME_WIDTH,
      y: Math.random() * GAME_HEIGHT,
      speed: 0.15 + Math.random() * 0.5,
      size: 1 + Math.random() * 2,
      alpha: 0.3 + Math.random() * 0.5,
      phase: Math.random() * Math.PI * 2,
      // 15% частиц — magenta (контраст), остальные cyan.
      color: Math.random() < 0.15 ? CYBER.magenta : CYBER.cyan,
    });
  }
  return out;
}

/**
 * Дополняет число leading нулями до длины length.
 * Используется для неоновых счётчиков: score → "000042", hi → "0042".
 */
export function zpad(value: number, length: number): string {
  const n = Math.max(0, Math.floor(value));
  return n.toString().padStart(length, '0');
}
