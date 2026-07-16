import Phaser from 'phaser';

/**
 * PreloadScene — загрузка ассетов (атласы, аудио, шейдеры).
 * Фаза 0: заглушка. Сразу переходит в MenuScene.
 * В фазе 4: загрузка аудио-ассетов (звуки вынесены в public/sfx/, Vite отдаёт по /sfx/...).
 *
 * Все аудио-ассеты опциональны для игрового процесса: системы играют звуки в
 * try/catch и проверяют наличие через cache — отсутствие ассета НЕ роняет игру.
 */

/**
 * Реестр аудио-ассетов: [ключ загрузки, путь относительно public/].
 * Ключи используются системами (FXSystem, BombSystem, MenuScene, GameOverScene).
 */
const AUDIO_ASSETS: ReadonlyArray<readonly [string, string]> = [
  ['bgm', 'sfx/bgm.mp3'],
  ['slice-1', 'sfx/Clean-Slice-1.wav'],
  ['slice-2', 'sfx/Clean-Slice-2.wav'],
  ['slice-3', 'sfx/Clean-Slice-3.wav'],
  ['swipe-1', 'sfx/Sword-swipe-1.wav'],
  ['swipe-2', 'sfx/Sword-swipe-2.wav'],
  ['swipe-3', 'sfx/Sword-swipe-3.wav'],
  ['bomb', 'sfx/bomb.wav'],
  ['bomb-fuse', 'sfx/bomb-fuse.wav'],
  ['combo', 'sfx/combo.wav'],
  ['combo-1', 'sfx/combo-1.wav'],
  ['combo-2', 'sfx/combo-2.wav'],
  ['combo-3', 'sfx/combo-3.wav'],
  ['game-over', 'sfx/game-over.wav'],
  ['game-start', 'sfx/game-start.wav'],
  ['impact', 'sfx/impact-1.wav'],
  ['new-best', 'sfx/new-best.wav'],
  // Фича «комбо → +жизнь»: звук восстановления жизни при комбо-кратно-5.
  ['extra-life', 'sfx/extra-life.wav'],
  // Фича «баннер разблокировки меча»: звук открытия нового меча при росте уровня.
  ['equip-unlock', 'sfx/equip-unlock.wav'],
  ['ui-button', 'sfx/ui-button.wav'],
  ['throw', 'sfx/throw.wav'],
];

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super({ key: 'PreloadScene' });
  }

  preload(): void {
    // Звуки вынесены в public/sfx/ — Vite отдаёт их по URL /sfx/<file> напрямую.
    // Загружаем все ключи из реестра AUDIO_ASSETS.
    for (const [key, file] of AUDIO_ASSETS) {
      this.load.audio(key, file);
    }
  }

  create(): void {
    this.scene.start('MenuScene');
  }
}
