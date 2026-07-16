import type { SwordType } from '../events/types';
import { getSwordProps } from './SwordProps';
import { SWORD_CYCLE_ORDER } from './SwordState';

/**
 * SwordUnlock (разблокировка мечей по уровню) — pure-logic проверки доступа.
 *
 * Правила разблокировки (см. SwordProps.unlockLevel):
 *   - forged    доступен с уровня 1 (всегда);
 *   - welding   — с уровня 2;
 *   - plasma    — с уровня 3;
 *   - radiation — с уровня 4.
 *
 * Назначение:
 *   - SwordSystem.set() проверяет unlock перед переключением (no-op если заблокирован);
 *   - HUDScene рисует замок/dim на заблокированных иконках;
 *   - MenuScene/тесты могут consultar список доступных мечей для уровня.
 *
 * Модуль НЕ зависит от Phaser. Уровень поставляется вызывающей стороной
 * (из LevelState, game.registry 'ndt:levelState').
 */

/**
 * Доступен ли меч на указанном уровне игрока.
 *
 * @param swordType тип меча.
 * @param level текущий уровень игрока (>= 1).
 * @returns true, если level >= props.unlockLevel.
 */
export function isSwordUnlocked(swordType: SwordType, level: number): boolean {
  return level >= getSwordProps(swordType).unlockLevel;
}

/**
 * Список мечей, доступных на указанном уровне, в порядке SWORD_CYCLE_ORDER
 * (forged → welding → plasma → radiation).
 *
 * @param level текущий уровень игрока (>= 1).
 */
export function getUnlockedSwords(level: number): SwordType[] {
  return SWORD_CYCLE_ORDER.filter((sword) => isSwordUnlocked(sword, level));
}
