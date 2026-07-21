import type { NDTObjectKind } from '../events/types';

/**
 * PowerUpType (pure-logic) — тип временного эффекта power-up фигуры.
 *
 * При разрезе соответствующего NDT-объекта активируется один из эффектов
 * на фиксированную длительность (см. PowerUpState.DEFAULT_DURATION_MS):
 *   - shrink  — все активные объекты уменьшаются в размере (×0.6);
 *   - grow    — все активные объекты увеличиваются в размере (×1.4);
 *   - slow    — новые объекты летят медленнее (×0.5 скорости полёта);
 *   - shield  — временная неуязвимость: упущенные объекты не отнимают жизни.
 *
 * Соответствие kind (NDTObjectKind) ↔ PowerUpType — намеренно РАЗДЕЛЕННЫЕ
 * типы: NDTObjectKind описывает объект спавна, PowerUpType — эффект.
 * Несколько kinds могут активировать один и тот же эффект
 * (goggles и grow активируют 'grow'; weldingMask и slow активируют 'slow').
 *
 * Модуль НЕ зависит от Phaser. Тестируется unit-тестами без рендера.
 */

/** Тип временного эффекта power-up. */
export type PowerUpType = 'shrink' | 'grow' | 'slow' | 'shield';

/**
 * Цвет wireframe + ауры power-up фигуры (для SpawnDirector).
 * shrink=purple, grow=orange, slow=ice-blue, shield=gold — соответствуют ТЗ.
 */
export const POWERUP_COLORS: Readonly<Record<PowerUpType, number>> = {
  shrink: 0xb14dff, // purple
  grow: 0xff8a00, // orange
  slow: 0x00d4ff, // ice-blue
  shield: 0xffd700, // gold
};

/**
 * Power-up kinds как подмножество NDTObjectKind (для spawnRandom).
 * Порядок фиксирован — детерминированный выбор по индексу в spawnRandom.
 *
 * Включает только NDT-экипировку (3 вида):
 *   - helmet (каска) → shield эффект;
 *   - goggles (очки) → grow эффект;
 *   - weldingMask (маска сварщика) → slow эффект.
 * Абстрактные shrink/grow/slow убраны из спавна — пользователь хочет только
 * экипировку с распознаваемыми 3D-формами.
 */
export const POWERUP_KINDS: ReadonlyArray<NDTObjectKind> = [
  'helmet',
  'goggles',
  'weldingMask',
];

/**
 * Map NDTObjectKind → PowerUpType. Содержит ТОЛЬКО экипировку (power-up виды).
 * Используется хелперами isPowerUpKind / kindToPowerUpType.
 *
 * Абстрактные shrink/grow/slow НЕ включены — они не спавнятся, только
 * экипировка: helmet→shield, goggles→grow, weldingMask→slow.
 * Это гарантирует, что power-up эффекты активируются только при разрезе
 * реальных фигур экипировки, а не абстрактных форм.
 */
const KIND_TO_POWERUP: Readonly<Record<string, PowerUpType>> = {
  helmet: 'shield',
  goggles: 'grow',
  weldingMask: 'slow',
};

/**
 * true, если kind — power-up фигура (shrink/grow/slow/helmet/goggles/weldingMask).
 * SliceSystem использует это для решения об эмите 'power-up' события.
 */
export function isPowerUpKind(kind: NDTObjectKind): boolean {
  return KIND_TO_POWERUP[kind] !== undefined;
}

/**
 * Возвращает PowerUpType по kind или null для обычных объектов.
 * Гарантирует непустой результат, если isPowerUpKind(kind) === true.
 */
export function kindToPowerUpType(kind: NDTObjectKind): PowerUpType | null {
  return KIND_TO_POWERUP[kind] ?? null;
}
