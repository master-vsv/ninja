import type { NDTObjectKind } from '../events/types';
import type { MissEvent } from '../events/MissEvent';

/**
 * DespawnChecker (фаза 2) — детектор ухода объекта за нижний край экрана.
 *
 * Чистая логика: НЕ зависит от Phaser, покрывается unit-тестами. Phaser-обёртка
 * (SpawnDirector) вызывает isBelowBounds() в update() для каждого активного
 * тела и при true формирует MissEvent через createMissEvent().
 *
 * Контракт MissEvent: труба-бомба (isBomb=true), упущенная за нижний край,
 * штрафа не несёт (мина, не цель) — но событие всё равно эмитится, чтобы
 * консамер (LifeSystem в фазе 4) сам решал, штрафовать или нет.
 */

/** Границы игровой области (используется только bottom для детекции деспавна). */
export interface DespawnBounds {
  readonly top: number;
  readonly bottom: number;
}

/** Данные объекта для формирования MissEvent. */
export interface DespawnInput {
  readonly bodyId: number;
  readonly kind: NDTObjectKind;
  readonly isBomb: boolean;
  /** Текущая Y-координата тела (нужна только для решения о деспавне). */
  readonly y: number;
}

/**
 * Проверяет, ушёл ли объект за нижний край экрана.
 *
 * @param y текущая Y-координата тела.
 * @param bottom Y нижней границы экрана.
 * @param margin запас в пикселях — тело должно уйти ниже на эту величину,
 *               чтобы считаться деспавн (избегает ложных срабатываний на
 *               касании границы). Может быть 0.
 * @returns true, если y > bottom + margin.
 */
export function isBelowBounds(
  y: number,
  bounds: Pick<DespawnBounds, 'bottom'>,
  margin: number,
): boolean {
  return y > bounds.bottom + margin;
}

/**
 * Фабрика MissEvent из данных объекта. Сохраняет isBomb (для трубы-бомбы),
 * чтобы LifeSystem в фазе 4 мог различать штрафные и нештрафные промахи.
 */
export function createMissEvent(input: DespawnInput): MissEvent {
  return {
    bodyId: input.bodyId,
    kind: input.kind,
    isBomb: input.isBomb,
  };
}
