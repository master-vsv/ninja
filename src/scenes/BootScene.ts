import Phaser from 'phaser';

/**
 * BootScene — минимальная инициализация.
 * Фаза 0: сразу передаёт управление в PreloadScene.
 * В дальнейшем: подключение poly-decomp в window (Matter требует global decomp),
 * инициализация EventBus, базовые настройки рендера.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  create(): void {
    // Минимальная точка входа. Реальная инициализация (global decomp, scaling tune) — фазы 2/3.
    this.scene.start('PreloadScene');
  }
}
