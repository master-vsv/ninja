import { PHYSICS_CONFIG } from '../config/physics';

/**
 * Ballistics (фаза 2) — баллистический калькулятор, чистая логика.
 *
 * Назначение: расчёт стартовой скорости (vx, vy) для дуги, чтобы объект,
 * стартуя снизу экрана, достигал заданной пиковой высоты (по Y) и (опционально)
 * целевой X-координаты в момент пика. После пика объект падает под гравитацией.
 *
 * НЕ импортирует Phaser. Покрывается unit-тестами (включая симуляцию полёта
 * шагами — проверяет, что расчетная скорость действительно даёт дугу,
 * достигающую peakHeight).
 *
 * Физическая модель (Matter position-Verlet, единицы — px/frame):
 *   vy_{t+1} = vy_t + g           // g = gravityY > 0 (вниз)
 *   y_{t+1}  = y_t + vy_{t+1}     // экранная СК: Y растёт вниз
 *
 * В вершине дуги vy = 0. Из уравнения:
 *   vy_peak² = vy_start² + 2 * g * (peakY - startY)
 *            = vy_start² - 2 * g * (startY - peakY)   (startY > peakY — старт ниже пика)
 * При vy_peak = 0:
 *   |vy_start| = sqrt(2 * g * dyUp),  dyUp = startY - peakY > 0
 *   vy_start  = -|vy_start|          (отрицательная — подъём = уменьшение Y)
 *
 * Время достижения пика (в кадрах):
 *   t_peak = |vy_start| / g = sqrt(2 * dyUp / g)
 *
 * Горизонтальная скорость: если targetX задан — приходим в него к моменту пика:
 *   vx = (targetX - startX) / t_peak
 * Если targetX не задан — vx = 0 (вертикальная дуга).
 */

/** Входные параметры баллистического расчёта. */
export interface BallisticInput {
  /** Стартовая позиция X (игровая СК). */
  readonly startX: number;
  /** Стартовая позиция Y (игровая СК). */
  readonly startY: number;
  /**
   * Целевая пиковая высота: Y-координата вершины дуги. Должна быть МЕНЬШЕ
   * startY (выше на экране), иначе бросок.
   */
  readonly peakHeight: number;
  /**
   * Целевая X-координата в момент пика. По умолчанию = startX (вертикальная
   * дуга без горизонтального смещения).
   */
  readonly targetX?: number;
  /**
   * Гравитация вдоль Y, px/frame². По умолчанию из PHYSICS_CONFIG.gravityY.
   * Должна быть > 0.
   */
  readonly gravity?: number;
}

/** Рассчитанная стартовая скорость. */
export interface BallisticVelocity {
  /** px/frame по X. */
  readonly vx: number;
  /** px/frame по Y. Отрицательная при подъёме (Y растёт вниз). */
  readonly vy: number;
}

/**
 * Рассчитывает стартовую скорость для баллистической дуги.
 *
 * @throws Error если gravity ≤ 0.
 * @throws Error если peakHeight ≥ startY (цель не выше старта — дуги нет).
 */
export function computeLaunchVelocity(input: BallisticInput): BallisticVelocity {
  const gravity = input.gravity ?? PHYSICS_CONFIG.gravityY;
  if (!(gravity > 0)) {
    throw new Error(`Ballistics: gravity must be positive, got ${gravity}`);
  }
  const dyUp = input.startY - input.peakHeight;
  if (dyUp <= 0) {
    throw new Error(
      `Ballistics: peakHeight ${input.peakHeight} must be above startY ${input.startY}`,
    );
  }
  // |vy_start| из уравнения vy_peak² = vy_start² - 2*g*dyUp при vy_peak=0.
  const vyAbs = Math.sqrt(2 * gravity * dyUp);
  // Знак отрицательный — подъём = уменьшение Y.
  const vy = -vyAbs;
  // Время достижения пика, кадры.
  const tPeak = vyAbs / gravity;
  // Горизонтальная скорость: достигаем targetX к моменту пика.
  const targetX = input.targetX ?? input.startX;
  const vx = tPeak > 0 ? (targetX - input.startX) / tPeak : 0;
  return { vx, vy };
}

/**
 * Симуляция полёта шагами (semi-implicit Euler, единицы px/frame).
 *
 * Предназначение:
 *   - self-check внутри unit-тестов (подтверждает, что рассчитанная скорость
 *     действительно даёт дугу, достигающую peakHeight);
 *   - пригодится SpawnDirector в будущем для предсказания зон приземления.
 *
 * Шаг (dt=1 по умолчанию): vy += g*dt; y += vy*dt; x += vx*dt. Останавливается
 * при y ≥ groundY (объект упал ниже уровня земли) либо после maxSteps шагов.
 *
 * Замечание о дискретизации: при dt=1 (1 шаг = 1 кадр) симуляция накопит
 * ~0.5*g*t*dt систематического отклонения от непрерывной формулы — это
 * нормально и совпадает с поведением Matter (Verlet). Для точной аналитической
 * проверки формула-vs-симуляция используйте мелкий dt (0.01 или меньше).
 *
 * НЕ импортирует Phaser.
 */
export interface SimPoint {
  /** Индекс шага (0 = старт). */
  readonly step: number;
  readonly x: number;
  readonly y: number;
  readonly vy: number;
}

export interface SimulateOptions {
  /** Гравитация, px/frame². По умолчанию PHYSICS_CONFIG.gravityY. */
  readonly gravity?: number;
  /** Y-координата «земли» — симуляция останавливается, когда y ≥ groundY. */
  readonly groundY: number;
  /** Шаг по времени в кадрах. По умолчанию 1 (= 1 кадр). */
  readonly dt?: number;
  /** Защитный лимит числа шагов. */
  readonly maxSteps?: number;
}

/**
 * Симулирует полёт объекта с заданной стартовой позицией и скоростью.
 * Возвращает массив точек траектории (включая стартовую).
 */
export function simulateArc(
  start: { readonly x: number; readonly y: number },
  velocity: { readonly vx: number; readonly vy: number },
  options: SimulateOptions,
): SimPoint[] {
  const gravity = options.gravity ?? PHYSICS_CONFIG.gravityY;
  const dt = options.dt ?? 1;
  const maxSteps = options.maxSteps ?? 10_000;
  const points: SimPoint[] = [];
  let x = start.x;
  let y = start.y;
  let vy = velocity.vy;
  let step = 0;
  points.push({ step, x, y, vy });
  while (y < options.groundY && step < maxSteps) {
    step++;
    vy += gravity * dt;
    y += vy * dt;
    x += velocity.vx * dt;
    points.push({ step, x, y, vy });
    // Защита от эксплода скорости — выходим, если ушли далеко за рамки.
    if (!Number.isFinite(y) || !Number.isFinite(x)) break;
  }
  return points;
}
