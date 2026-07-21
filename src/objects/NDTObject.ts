import type Phaser from 'phaser';
import type { NDTObjectKind } from '../events/types';
import type { ObjectConfig } from '../config/objects';

/**
 * NDTObject — фабрика Matter body + sprite из OBJECT_REGISTRY.
 * Заглушка фазы 0. Полная реализация — фаза 2 (спавн) и фаза 4 (контент).
 */
export interface NDTObject {
  readonly kind: NDTObjectKind;
  readonly body: MatterJS.BodyType;
  readonly sprite: Phaser.GameObjects.GameObject;
  readonly config: ObjectConfig;
}

/**
 * TODO фаза 2/4: создать тело из вершин (Matter fromVertices) + текстурный спрайт,
 * связать body ↔ sprite через scene.matter.add.gameObject(...).
 */
export function createNDTObject(
  _scene: Phaser.Scene,
  _kind: NDTObjectKind,
): NDTObject {
  throw new Error('createNDTObject: not implemented until phase 2/4');
}
