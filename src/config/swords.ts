import type { SwordType } from '../events/types';

/**
 * Конфигурация мечей (заглушка фазы 0). Полный конфиг — фаза 5.
 */
export interface SwordConfig {
  readonly type: SwordType;
  /** Человекочитаемое имя для UI. */
  readonly label: string;
  /** Длительность slowmo в мс (только для 'radiation'). */
  readonly slowmoDurationMs: number;
  /** TimeScale во время slowmo. */
  readonly slowmoScale: number;
}

/** Реестр мечей. Плейсхолдер. */
export const SWORDS: Readonly<Record<SwordType, SwordConfig>> = {
  forged: { type: 'forged', label: 'Кованый', slowmoDurationMs: 0, slowmoScale: 1 },
  welding: { type: 'welding', label: 'Сварка', slowmoDurationMs: 0, slowmoScale: 1 },
  plasma: { type: 'plasma', label: 'Плазма', slowmoDurationMs: 0, slowmoScale: 1 },
  radiation: { type: 'radiation', label: 'Радиация', slowmoDurationMs: 2500, slowmoScale: 0.5 },
};
