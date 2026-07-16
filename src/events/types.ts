/**
 * Общие типы NDT-Ninja.
 * Зафиксированы на фазе 0; расширяются в фазах 3/4/5 без изменения существующих полей.
 */

/**
 * Тип режущего NDT-объекта. Труба ('pipe') — бомба.
 * 5 базовых + 3 новых метода контроля:
 *   - probe     — УЗ-щуп (ультразвуковой контроль, UT);
 *   - magnet    — магнит-подкова (магнитопорошковый контроль, MT);
 *   - penetrant — капля пенетранта (капиллярный контроль, PT).
 * 3 power-up фигуры (спец-объекты с временным эффектом при разрезе):
 *   - shrink — purple ромб: все объекты временно уменьшаются (×0.6, 5 сек);
 *   - grow   — orange пятиугольник: все объекты увеличиваются (×1.4, 5 сек);
 *   - slow   — ice-blue шестиугольник: объекты летят медленнее (×0.5 скорости, 5 сек).
 * 3 NDT-фигуры экипировки (power-up, спавнятся в том же 6%-пуле):
 *   - helmet      — золотая каска: активирует 'shield' (временная неуязвимость, 5 сек);
 *   - goggles     — оранжевые очки: активируют 'grow' (объекты ×1.4, 5 сек);
 *   - weldingMask — ice-blue маска сварщика: активирует 'slow' (скорость ×0.5, 5 сек).
 */
export type NDTObjectKind =
  | 'bolt'
  | 'nut'
  | 'ruler'
  | 'standard'
  | 'pipe'
  | 'probe'
  | 'magnet'
  | 'penetrant'
  | 'shrink'
  | 'grow'
  | 'slow'
  | 'helmet'
  | 'goggles'
  | 'weldingMask';

/** Тип меча. null в MVP (до фазы 5). */
export type SwordType = 'forged' | 'welding' | 'plasma' | 'radiation';

/** Глобальные имена событий EventBus (централизованный список для типизации). */
export const EVENT = {
  /** Событие разреза NDT-объекта. Эмитится SliceSystem, фаза 3. */
  slice: 'slice',
  /** Событие упущенного объекта (вышел за нижний край). Эмитит SpawnDirector, фаза 2. */
  miss: 'miss',
  /** Game over. Эмитят BombSystem/LifeSystem, консамит GameScene, фаза 4. */
  gameOver: 'game-over',
  /**
   * Разрезан power-up объект. Эмитит SliceSystem ВДОГОНКУ к 'slice' (с тем же kind),
   * консамит GameScene → активирует PowerUpState + камера-flash + звук.
   * Payload: { type: PowerUpType }.
   */
  powerUp: 'power-up',
} as const;

export type EventName = (typeof EVENT)[keyof typeof EVENT];

/** Причина перехода в game over. */
export type GameOverReason = 'bomb' | 'no-lives';
