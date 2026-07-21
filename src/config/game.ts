import Phaser from 'phaser';
import { BootScene } from '../scenes/BootScene';
import { PreloadScene } from '../scenes/PreloadScene';
import { MenuScene } from '../scenes/MenuScene';
import { GameScene } from '../scenes/GameScene';
import { HUDScene } from '../scenes/HUDScene';
import { GameOverScene } from '../scenes/GameOverScene';
import { PHYSICS_CONFIG } from './physics';

/** Базовое (дизайнерское) разрешение игры. */
export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

/** DOM-id контейнера канваса (см. index.html). */
export const GAME_PARENT_ID = 'game-container';

/**
 * Retina-gate (риск №10 в плане):
 * На iPhone SE 2020 (DPR ≥ 2) FIT-scale + высокий DPR может перегрузить fill-rate GPU.
 * Опция: ограничить физическое разрешение канваса сверху. Проверяется на устройстве в фазе 0.
 *
 * Возвращает разрешение, не превышающее cap. По умолчанию cap=2.
 * В фазе 0 — оставлено как функция-помощник; интеграция в GameConfig — после замеров на устройстве.
 */
export function computeResolution(cap = 2): number {
  if (typeof window === 'undefined' || !window.devicePixelRatio) {
    return 1;
  }
  return Math.min(window.devicePixelRatio, cap);
}

/**
 * Phaser GameConfig.
 * - physics default 'matter' (план, фаза 0).
 * - scale mode FIT, базовое разрешение 1280×720, ориентация landscape (план, фаза 0).
 * - input activePointers: 1 (одноразовый свайп — многотач не нужен).
 * - scenes: Boot → Preload → Menu-stub.
 *
 * Функция-фабрика чтобы можно было инжектить dev-настройки (например, debug-физику).
 */
export function createGameConfig(): Phaser.Types.Core.GameConfig {
  return {
    // CANVAS (не AUTO/WebGL): в WSL без GPU-passthrough (нет /dev/dri) WebGL идёт
    // через SwiftShader (software) — грузит CPU, низкий FPS, рывки → «не дуга/не след».
    // Canvas2D для нашего 2D-wireframe на software-rendering быстрее и стабильнее.
    // На хосте с GPU (Windows browser / WSLg) можно вернуть Phaser.AUTO.
    type: Phaser.CANVAS,
    parent: GAME_PARENT_ID,
    // Базовое разрешение ландшафтного дизайна.
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: '#0a0a0a',
    // FIT-scale: сохраняет пропорции, вписывая игру в любой контейнер.
    // Внимание (архитектура, §3): RESIZE на full-screen упирается в fill-rate — отказываемся.
    // Landscape определяется соотношением width > height (1280×720) и дополняется CSS media query
    // в index.html — в ScaleConfig поля orientation нет (убрано в Phaser 3.90 типах).
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      expandParent: true,
    },
    // Matter — основа геймплея (слайсинг, баллистика осколков).
    physics: {
      default: 'matter',
      matter: {
        gravity: { x: PHYSICS_CONFIG.gravityX, y: PHYSICS_CONFIG.gravityY },
        debug: PHYSICS_CONFIG.debug,
        // isFixed + субшаги — защита от туннелирования (риск №1, снимается в фазе 3).
        // Phaser пробрасывает эти поля в Matter runner.
        // Полная инъекция runner-конфига — фаза 2 (SpawnDirector) / фаза 3 (tune gate).
      },
    },
    input: {
      // Одиночный свайп-pointer (основной геймплей).
      // На планшетах разрешаем multipleTouch для future gesture (zoom/rotate),
      // но игра обрабатывает только 1 активный свайп (activePointers: 1).
      activePointers: 1,
      touch: {
        capture: true, // блокируем стандартные браузерные gesture (preventDefault)
      },
    },
    // Цепочка сцен: Boot → Preload → Menu → Game (фаза 2 добавляет GameScene).
    // Фаза 4: HUDScene и GameOverScene зарегистрированы в массиве,
    // запускаются как overlay через scene.launch() из GameScene.
    scene: [BootScene, PreloadScene, MenuScene, GameScene, HUDScene, GameOverScene],
    // На retina можно ограничить resolution — см. computeResolution() выше.
    // Включается после замеров (риск №10): resolution: computeResolution(2),
  };
}

/** Дефолтный GameConfig для main.ts (без переопределений). */
export const gameConfig: Phaser.Types.Core.GameConfig = createGameConfig();
