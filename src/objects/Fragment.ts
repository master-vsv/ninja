import type Phaser from 'phaser';

/**
 * Fragment — осколок (тело + спрайт + маска), TTL.
 * Заглушка фазы 0. Полная реализация — фаза 3 (BodySplitter создаёт фрагменты).
 */
export interface Fragment {
  readonly body: MatterJS.BodyType;
  readonly sprite: Phaser.GameObjects.GameObject;
  /** Мс до авто-деспавна. */
  ttlMs: number;
}

/**
 * TODO фаза 3: создание фрагмента с текстурной маской по вершинам,
 * установка импульса разлёта, TTL-деспавн.
 */
export function createFragment(_scene: Phaser.Scene): Fragment {
  throw new Error('createFragment: not implemented until phase 3');
}
