/**
 * Конфигурация Matter runner.
 * Цель: стабильный шаг физики для предсказуемого слайсинга и предотвращения туннелирования.
 * Тюнится в фазе 3 (после fail-fast gate) и фазе 7 (полировка).
 */
export interface PhysicsConfig {
  /** Фиксированный шаг (true) против плавающего (false). */
  readonly isFixed: boolean;
  /** Дельта шага физики, мс. При isFixed=true должно быть кратно fps. */
  readonly delta: number;
  /** Субшаги. Увеличивать при туннелировании (см. риск №1 в плане). */
  readonly substeps: number;
  /** Гравитация по Y (px/frame²). */
  readonly gravityY: number;
  /** Гравитация по X. Обычно 0. */
  readonly gravityX: number;
  /** Включить debug-рендер Matter. Только dev-режим. */
  readonly debug: boolean;
}

/** Текущая конфигурация физики (фаза 0). Может меняться тюнингом в фазах 3/7. */
export const PHYSICS_CONFIG: PhysicsConfig = {
  isFixed: true,
  delta: 1000 / 60,
  substeps: 4,
  // gravityY=1 калиброван под баллистику (computeLaunchVelocity считает vy в
  // px/frame²; Matter gravity.y — внутренний масштаб, при 1 они синхронизированы).
  // НЕ менять без перебалансировки Ballistics↔Matter — иначе объекты улетают
  // за экран. Скорость объектов регулируется SPEED_MULTIPLIER в SpawnDirector.
  // Slowmo (фаза 5, меч «радиация») — НЕ через timeScale (ломает position-Verlet),
  // а через fake: green-glow + spawnTimer.delay×2 (см. SlowmoState).
  gravityY: 1,
  gravityX: 0,
  debug: false,
};
