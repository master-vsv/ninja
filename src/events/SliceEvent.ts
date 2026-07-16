import type Phaser from 'phaser';
import type { NDTObjectKind, SwordType } from './types';

/**
 * Событие разреза NDT-объекта. Эмитится SliceSystem, консамится другими системами.
 * Контракт зафиксирован в плане на фазе 3 — НЕ менять поля, только расширять потребителей.
 *
 * В фазе 0 файл существует как контракт; SliceSystem появится в фазе 3.
 */
export interface SliceEvent {
  /** Уникальный id события (uuid). */
  readonly id: string;
  /** performance.now() на момент разреза. */
  readonly timestamp: number;
  /** id Matter-тела исходного объекта. */
  readonly bodyId: number;
  /** Тип объекта. */
  readonly kind: NDTObjectKind;
  /** true только для 'pipe'. */
  readonly isBomb: boolean;
  /** Геометрия реза. */
  readonly slice: {
    readonly from: Phaser.Math.Vector2;
    readonly to: Phaser.Math.Vector2;
    /** Угол реза, радианы. */
    readonly angle: number;
  };
  /** Активный меч. null в MVP (до фазы 5). */
  readonly swordType: SwordType | null;
  /** Фрагменты, созданные BodySplitter. */
  readonly fragments: ReadonlyArray<{
    readonly vertices: ReadonlyArray<Phaser.Math.Vector2>;
    readonly velocity: Phaser.Math.Vector2;
  }>;
}
