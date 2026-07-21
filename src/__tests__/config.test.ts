import { describe, it, expect } from 'vitest';
import Phaser from 'phaser';
import {
  createGameConfig,
  gameConfig,
  GAME_WIDTH,
  GAME_HEIGHT,
  GAME_PARENT_ID,
  computeResolution,
} from '../config/game';
import { PHYSICS_CONFIG } from '../config/physics';
import { BootScene } from '../scenes/BootScene';
import { PreloadScene } from '../scenes/PreloadScene';
import { MenuScene } from '../scenes/MenuScene';
import { GameScene } from '../scenes/GameScene';
import { HUDScene } from '../scenes/HUDScene';
import { GameOverScene } from '../scenes/GameOverScene';

/**
 * Проверка GameConfig (фаза 0 — critical spec; фаза 4 добавила HUD + GameOver).
 * Утверждения из плана/архитектуры:
 *   - default physics === 'matter'
 *   - scale mode === FIT
 *   - базовое разрешение 1280×720
 *   - landscape ориентация
 *   - input activePointers === 1
 *   - цепочка сцен: [Boot, Preload, Menu, Game, HUD, GameOver]
 *     (HUD/GameOver — фаза 4, overlay через scene.launch)
 */
describe('config/game', () => {
  it('использует Matter как физику по умолчанию', () => {
    expect(gameConfig.physics?.default).toBe('matter');
  });

  it('базовое разрешение 1280×720', () => {
    expect(GAME_WIDTH).toBe(1280);
    expect(GAME_HEIGHT).toBe(720);
    expect(gameConfig.width).toBe(GAME_WIDTH);
    expect(gameConfig.height).toBe(GAME_HEIGHT);
  });

  it('scale mode FIT', () => {
    expect(gameConfig.scale?.mode).toBe(Phaser.Scale.FIT);
  });

  it('базовое разрешение landscape (width > height)', () => {
    // В Phaser 3.90 ScaleConfig не имеет явного поля orientation —
    // landscape выражается через width > height (1280×720) + CSS media query в index.html.
    expect(GAME_WIDTH).toBeGreaterThan(GAME_HEIGHT);
  });

  it('центрирует игру в контейнере', () => {
    expect(gameConfig.scale?.autoCenter).toBe(Phaser.Scale.CENTER_BOTH);
  });

  it('parent контейнер совпадает с index.html', () => {
    expect(gameConfig.parent).toBe(GAME_PARENT_ID);
    expect(GAME_PARENT_ID).toBe('game-container');
  });

  it('input activePointers === 1 (один меч за раз)', () => {
    // gameConfig.input имеет тип `boolean | InputConfig`; проверяем через type guard.
    const input = gameConfig.input;
    expect(typeof input).toBe('object');
    expect(input).not.toBeNull();
    if (input && typeof input === 'object') {
      expect(input.activePointers).toBe(1);
    }
  });

  it('matter gravity соответствует PHYSICS_CONFIG', () => {
    const matter = gameConfig.physics?.matter as
      | { gravity?: { x?: number; y?: number } }
      | undefined;
    expect(matter?.gravity?.y).toBe(PHYSICS_CONFIG.gravityY);
    expect(matter?.gravity?.x).toBe(PHYSICS_CONFIG.gravityX);
  });

  it('создаёт фабрику с теми же значениями', () => {
    const cfg = createGameConfig();
    expect(cfg.physics?.default).toBe('matter');
    expect(cfg.scale?.mode).toBe(Phaser.Scale.FIT);
    expect(cfg.width).toBe(GAME_WIDTH);
    expect(cfg.height).toBe(GAME_HEIGHT);
  });

  it('содержит цепочку сцен Boot → Preload → Menu → Game (+ HUD, GameOver overlay)', () => {
    // Инстанцировать Phaser.Scene без Phaser.Game нельзя (sys/scene плагин не инициализируется),
    // поэтому проверяем по ссылкам на классы и их именам (vitest не минифицирует).
    const scenes = gameConfig.scene as ReadonlyArray<new () => Phaser.Scene>;
    expect(scenes.length).toBe(6);
    expect(scenes[0]).toBe(BootScene);
    expect(scenes[1]).toBe(PreloadScene);
    expect(scenes[2]).toBe(MenuScene);
    expect(scenes[3]).toBe(GameScene);
    expect(scenes[4]).toBe(HUDScene);
    expect(scenes[5]).toBe(GameOverScene);
    const names = scenes.map((S) => S.name);
    expect(names).toEqual([
      'BootScene',
      'PreloadScene',
      'MenuScene',
      'GameScene',
      'HUDScene',
      'GameOverScene',
    ]);
  });

  it('computeResolution ограничивает cap', () => {
    // В node window нет — функция должна возвращать 1 без падения.
    expect(computeResolution(2)).toBe(1);
    expect(computeResolution(1)).toBe(1);
  });
});
