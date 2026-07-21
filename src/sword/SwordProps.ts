import type { SwordType } from '../events/types';

/**
 * SwordProps (фаза 5) — pure-logic свойства каждого меча.
 *
 * Возвращает измеримые свойства меча (для тест-сцен плана, раздел «Фаза 5 —
 * геймплей-свойства каждого меча»):
 *   - forged:    базовый ровный разрез (maxTargets=1, без эффектов);
 *   - welding:   поджигает край среза (ignite=true, maxTargets=1);
 *   - plasma:    режет до 3 объектов за один свайп (maxTargets=3);
 *   - radiation: fake-slowmo на 2-3 сек (slowmo=true, maxTargets=1).
 *
 * Цвет — из палитры CYBER (scenes/CyberpunkBackground.ts: cyan #00f0ff,
 * magenta #ff2bd6, yellow #f5d300). Значения ПРОДУБЛИРОВАНЫ здесь числами,
 * чтобы модуль оставался pure-logic (без импорта Phaser). Для radiation
 * добавлен neon-green (нет в палитре CYBER) — это цвет «радиации».
 *
 * Модуль НЕ зависит от Phaser. Phaser-обёртка — systems/SwordSystem.ts.
 */

/** Свойства меча — иммутабельный набор. */
export interface SwordProps {
  /** Тип меча. */
  readonly type: SwordType;
  /**
   * Уровень игрока, с которого меч становится доступен.
   * forged=1 (всегда), welding=2, plasma=3, radiation=4.
   * Меч нельзя выбрать, пока текущий уровень < unlockLevel (см. sword/SwordUnlock.ts).
   */
  readonly unlockLevel: number;
  /** Максимальное число целей за один свайп. forged=1, welding=1, plasma=3, radiation=1. */
  readonly maxTargets: number;
  /** true, если меч поджигает край среза (только welding). */
  readonly ignite: boolean;
  /** true, если меч активирует fake-slowmo (только radiation). */
  readonly slowmo: boolean;
  /** Длительность slowmo в мс (только для radiation). 0 — если slowmo=false. */
  readonly slowmoDurationMs: number;
  /** Цвет меча (для FX/HUD), числовое значение для Graphics.fillStyle. */
  readonly color: number;
  /** CSS-строка цвета (для Text/HUD). */
  readonly colorCss: string;
}

/**
 * Палитра цветов мечей. Значения == CYBER для cyan/magenta/yellow
 * (продублировано, чтобы не тянуть Phaser-зависимость). radiation-green —
 * новый (неон-зелёный) для «радиации».
 */
const SWORD_COLORS = {
  forgedCyan: 0x00f0ff,
  weldingYellow: 0xf5d300,
  plasmaMagenta: 0xff2bd6,
  /** Neon green для radiation (нет в палитре CYBER). */
  radiationGreen: 0x39ff14,
} as const;

const SWORD_COLORS_CSS = {
  forgedCyan: '#00f0ff',
  weldingYellow: '#f5d300',
  plasmaMagenta: '#ff2bd6',
  radiationGreen: '#39ff14',
} as const;

/**
 * Длительность fake-slowmo для radiation, мс.
 * Диапазон плана — 2-3 сек; выбрано 2500 (золотая середина).
 */
export const SLOWMO_DURATION_MS = 2500;

/**
 * Множитель замедления спавна при активном slowmo (fake-slowmo: спавн реже →
 * игрок чувствует «больше времени»). НЕ трогает timeScale → Verlet цел.
 */
export const SLOWMO_SPAWN_DELAY_MULTIPLIER = 2;

/** Реестр свойств всех мечей. */
const PROPS: Readonly<Record<SwordType, SwordProps>> = {
  forged: {
    type: 'forged',
    unlockLevel: 1,
    maxTargets: 1,
    ignite: false,
    slowmo: false,
    slowmoDurationMs: 0,
    color: SWORD_COLORS.forgedCyan,
    colorCss: SWORD_COLORS_CSS.forgedCyan,
  },
  welding: {
    type: 'welding',
    unlockLevel: 2,
    maxTargets: 1,
    ignite: true,
    slowmo: false,
    slowmoDurationMs: 0,
    color: SWORD_COLORS.weldingYellow,
    colorCss: SWORD_COLORS_CSS.weldingYellow,
  },
  plasma: {
    type: 'plasma',
    unlockLevel: 3,
    maxTargets: 3,
    ignite: false,
    slowmo: false,
    slowmoDurationMs: 0,
    color: SWORD_COLORS.plasmaMagenta,
    colorCss: SWORD_COLORS_CSS.plasmaMagenta,
  },
  radiation: {
    type: 'radiation',
    unlockLevel: 4,
    maxTargets: 1,
    ignite: false,
    slowmo: true,
    slowmoDurationMs: SLOWMO_DURATION_MS,
    color: SWORD_COLORS.radiationGreen,
    colorCss: SWORD_COLORS_CSS.radiationGreen,
  },
};

/**
 * Возвращает свойства меча по типу. Иммутабельный объект — безопасно передавать
 * в системы без копирования.
 */
export function getSwordProps(swordType: SwordType): SwordProps {
  return PROPS[swordType];
}

/** Возвращает свойства всех мечей (для HUD: отрисовка 4 иконок). */
export function getAllSwordProps(): ReadonlyArray<SwordProps> {
  return Object.values(PROPS);
}
