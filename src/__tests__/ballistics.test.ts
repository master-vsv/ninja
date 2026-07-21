import { describe, it, expect } from 'vitest';
import {
  computeLaunchVelocity,
  simulateArc,
  type BallisticInput,
} from '../spawn/Ballistics';
import { PHYSICS_CONFIG } from '../config/physics';

/**
 * Тесты Ballistics (фаза 2) — pure-logic баллистический калькулятор.
 *
 * Покрываем:
 *   - стартовая скорость ненулевая;
 *   - vy<0 при старте вверх (подъём = уменьшение Y);
 *   - симуляция полёта шагами подтверждает дугу, достигающую peakHeight;
 *   - разные targetHeight → разные velocity;
 *   - vx задаётся при targetX ≠ startX;
 *   - ошибки при невалидных входах.
 */

const G = PHYSICS_CONFIG.gravityY; // 1 px/frame²

/** Конструктивный сценарий: старт снизу экрана, цель выше на 500px. */
const BASIC: BallisticInput = {
  startX: 640,
  startY: 720,
  peakHeight: 220,
  targetX: 640,
  gravity: G,
};

describe('ballistics/computeLaunchVelocity', () => {
  it('возвращает ненулевую скорость', () => {
    const v = computeLaunchVelocity(BASIC);
    expect(Math.abs(v.vx) + Math.abs(v.vy)).toBeGreaterThan(0);
  });

  it('vy < 0 при старте вверх (экранная СК: Y растёт вниз)', () => {
    const v = computeLaunchVelocity(BASIC);
    expect(v.vy).toBeLessThan(0);
  });

  it('vx = 0 при targetX по умолчанию (= startX) — вертикальная дуга', () => {
    const v = computeLaunchVelocity({ ...BASIC, targetX: undefined });
    expect(v.vx).toBe(0);
  });

  it('vx ≠ 0 при targetX ≠ startX', () => {
    const v = computeLaunchVelocity({ ...BASIC, targetX: 940 });
    // Смещение +300px — vx должен быть положительным.
    expect(v.vx).toBeGreaterThan(0);
  });

  it('vx имеет правильный знак при targetX < startX', () => {
    const v = computeLaunchVelocity({ ...BASIC, targetX: 340 });
    expect(v.vx).toBeLessThan(0);
  });

  it('разные peakHeight → разные |vy| (выше цель → больше скорость)', () => {
    const lower = computeLaunchVelocity({ ...BASIC, peakHeight: 420 });
    const higher = computeLaunchVelocity({ ...BASIC, peakHeight: 120 });
    // |vy| больше у higher — цель выше (startY - peakHeight больше).
    expect(Math.abs(higher.vy)).toBeGreaterThan(Math.abs(lower.vy));
  });

  it('бросает при gravity ≤ 0', () => {
    expect(() =>
      computeLaunchVelocity({ ...BASIC, gravity: 0 }),
    ).toThrowError(/gravity/);
    expect(() =>
      computeLaunchVelocity({ ...BASIC, gravity: -1 }),
    ).toThrowError(/gravity/);
  });

  it('бросает при peakHeight ≥ startY (цель не выше старта)', () => {
    expect(() =>
      computeLaunchVelocity({ ...BASIC, peakHeight: 720 }),
    ).toThrowError(/peakHeight/);
    expect(() =>
      computeLaunchVelocity({ ...BASIC, peakHeight: 1000 }),
    ).toThrowError(/peakHeight/);
  });

  it('по умолчанию gravity берётся из PHYSICS_CONFIG', () => {
    // Та же скорость, что и с явным gravity: G.
    const a = computeLaunchVelocity({ ...BASIC, gravity: undefined });
    const b = computeLaunchVelocity({ ...BASIC, gravity: G });
    expect(a).toEqual(b);
  });

  it('аналитическая проверка: |vy|² = 2*g*dyUp', () => {
    const v = computeLaunchVelocity(BASIC);
    const dyUp = BASIC.startY - BASIC.peakHeight;
    expect(v.vy * v.vy).toBeCloseTo(-(2 * G * dyUp * -1), 6); // vy² = 2*g*dyUp
    expect(Math.abs(v.vy)).toBeCloseTo(Math.sqrt(2 * G * dyUp), 6);
  });
});

describe('ballistics/simulateArc (подтверждение дуги)', () => {
  // Мелкий dt для tight-проверки формулы: симуляция сходится к непрерывной
  // формуле при dt → 0. При dt=1 была бы систематическая Δ ≈ 0.5*g*t*dt
  // (совпадает с Matter Verlet), что мешает точечной проверке.
  const DT = 0.01;

  it('с рассчитанной скоростью объект достигает peakHeight с допуском 1px', () => {
    const input: BallisticInput = {
      startX: 100,
      startY: 720,
      peakHeight: 200,
      gravity: G,
    };
    const v = computeLaunchVelocity(input);
    // Симуляция полёта от старта с рассчитанной скоростью.
    const pts = simulateArc(
      { x: input.startX, y: input.startY },
      v,
      { gravity: G, groundY: 10_000, dt: DT },
    );
    // Минимальный Y в траектории — пиковая высота (на экране: чем меньше Y, тем выше).
    const minY = Math.min(...pts.map((p) => p.y));
    expect(minY).toBeGreaterThanOrEqual(input.peakHeight - 1);
    expect(minY).toBeLessThanOrEqual(input.peakHeight + 1);
  });

  it('в пике vy ≈ 0 (объект перестаёт подниматься)', () => {
    const input: BallisticInput = {
      startX: 200,
      startY: 720,
      peakHeight: 220,
      gravity: G,
    };
    const v = computeLaunchVelocity(input);
    const pts = simulateArc(
      { x: input.startX, y: input.startY },
      v,
      { gravity: G, groundY: 10_000, dt: DT },
    );
    // Кадр с минимальным Y.
    let minIdx = 0;
    for (let i = 1; i < pts.length; i++) {
      if (pts[i].y < pts[minIdx].y) minIdx = i;
    }
    // В пике vy ≈ 0 (semi-implicit Euler: vy += g*dt; y += vy*dt).
    expect(pts[minIdx].vy).toBeGreaterThanOrEqual(-G * DT * 1.5);
    expect(pts[minIdx].vy).toBeLessThanOrEqual(G * DT * 1.5);
  });

  it('объект возвращается ниже старта (дуга замкнулась под гравитацией)', () => {
    const input: BallisticInput = {
      startX: 300,
      startY: 720,
      peakHeight: 300,
      gravity: G,
    };
    const v = computeLaunchVelocity(input);
    const pts = simulateArc(
      { x: input.startX, y: input.startY },
      v,
      { gravity: G, groundY: 10_000, dt: DT },
    );
    // Последняя точка — ушли за groundY (или ушли в бесконечность).
    const last = pts[pts.length - 1];
    expect(last.y).toBeGreaterThan(input.startY);
  });

  it('с targetX объект приходит в цель к моменту пика (допуск 2px)', () => {
    const input: BallisticInput = {
      startX: 200,
      startY: 720,
      peakHeight: 220,
      targetX: 800,
      gravity: G,
    };
    const v = computeLaunchVelocity(input);
    const pts = simulateArc(
      { x: input.startX, y: input.startY },
      v,
      { gravity: G, groundY: 10_000, dt: DT },
    );
    // Кадр пика по Y.
    let minIdx = 0;
    for (let i = 1; i < pts.length; i++) {
      if (pts[i].y < pts[minIdx].y) minIdx = i;
    }
    expect(pts[minIdx].x).toBeGreaterThanOrEqual(input.targetX! - 2);
    expect(pts[minIdx].x).toBeLessThanOrEqual(input.targetX! + 2);
  });

  it('симуляция останавливается по достижении groundY', () => {
    const v = computeLaunchVelocity({
      startX: 0,
      startY: 720,
      peakHeight: 300,
      gravity: G,
    });
    const pts = simulateArc({ x: 0, y: 720 }, v, {
      gravity: G,
      groundY: 1000,
      dt: 1,
    });
    // Последняя точка либо за groundY, либо граничит.
    expect(pts[pts.length - 1].y).toBeGreaterThanOrEqual(1000 - G);
  });
});
