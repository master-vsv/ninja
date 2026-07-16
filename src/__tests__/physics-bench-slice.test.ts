import { describe, it, expect } from 'vitest';
import {
  prepareSliceSchedule,
  checkFailFast,
  FAIL_FAST_THRESHOLDS,
} from '../benchmark/physics-bench-slice';
import type { BenchReport } from '../benchmark/physics-bench';

/**
 * Тесты pure-logic части бенчмарка ступени B (фаза 3).
 *
 * Проверяем:
 *   - prepareSliceSchedule: детерминированность, число элементов, диапазоны;
 *   - checkFailFast: сверка с порогами;
 *   - FAIL_FAST_THRESHOLDS: значения из плана.
 */

const BOUNDS = { width: 1280, height: 720 };

describe('physics-bench-slice / FAIL_FAST_THRESHOLDS', () => {
  it('пороги зафиксированы по плану', () => {
    expect(FAIL_FAST_THRESHOLDS.fpsAvgMin).toBe(55);
    expect(FAIL_FAST_THRESHOLDS.p95FrameTimeMaxMs).toBe(18);
    expect(FAIL_FAST_THRESHOLDS.p95PhysicsStepMaxMs).toBe(6);
    expect(FAIL_FAST_THRESHOLDS.tunnelingMaxPercent).toBe(1);
    expect(FAIL_FAST_THRESHOLDS.inputToSliceMaxFrames).toBe(1);
  });
});

describe('physics-bench-slice / prepareSliceSchedule', () => {
  it('планирует ровно bodyCount спавнов', () => {
    for (const n of [10, 30, 50]) {
      const sched = prepareSliceSchedule({
        durationMs: 30_000,
        bodyCount: n,
        bounds: BOUNDS,
      });
      expect(sched.spawns.length).toBe(n);
    }
  });

  it('спавны отсортированы по времени', () => {
    const sched = prepareSliceSchedule({
      durationMs: 30_000,
      bodyCount: 10,
      bounds: BOUNDS,
    });
    for (let i = 1; i < sched.spawns.length; i++) {
      expect(sched.spawns[i].time).toBeGreaterThanOrEqual(sched.spawns[i - 1].time);
    }
  });

  it('свайпы отсортированы по времени', () => {
    const sched = prepareSliceSchedule({
      durationMs: 30_000,
      bodyCount: 30,
      bounds: BOUNDS,
    });
    for (let i = 1; i < sched.swipes.length; i++) {
      expect(sched.swipes[i].time).toBeGreaterThanOrEqual(sched.swipes[i - 1].time);
    }
  });

  it('детерминирован: одинаковый seed → одинаковое расписание', () => {
    const a = prepareSliceSchedule({
      durationMs: 30_000,
      bodyCount: 30,
      bounds: BOUNDS,
      seed: 42,
    });
    const b = prepareSliceSchedule({
      durationMs: 30_000,
      bodyCount: 30,
      bounds: BOUNDS,
      seed: 42,
    });
    expect(a).toEqual(b);
  });

  it('разный seed → разное расписание', () => {
    const a = prepareSliceSchedule({
      durationMs: 30_000,
      bodyCount: 30,
      bounds: BOUNDS,
      seed: 1,
    });
    const b = prepareSliceSchedule({
      durationMs: 30_000,
      bodyCount: 30,
      bounds: BOUNDS,
      seed: 2,
    });
    expect(a).not.toEqual(b);
  });

  it('по умолчанию фиксируется seed (воспроизводимость)', () => {
    const a = prepareSliceSchedule({ durationMs: 30_000, bodyCount: 30 });
    const b = prepareSliceSchedule({ durationMs: 30_000, bodyCount: 30 });
    expect(a).toEqual(b);
  });

  it('sliceFraction влияет на число свайпов', () => {
    const half = prepareSliceSchedule({
      durationMs: 30_000,
      bodyCount: 30,
      bounds: BOUNDS,
      sliceFraction: 0.5,
    });
    const full = prepareSliceSchedule({
      durationMs: 30_000,
      bodyCount: 30,
      bounds: BOUNDS,
      sliceFraction: 1.0,
    });
    expect(full.swipes.length).toBeGreaterThan(half.swipes.length);
    expect(half.swipes.length).toBe(15); // 30 * 0.5
    expect(full.swipes.length).toBe(30); // 30 * 1.0
  });

  it('N=0 спавнов → пустой массив спавнов, минимум 1 свайп', () => {
    const sched = prepareSliceSchedule({
      durationMs: 30_000,
      bodyCount: 0,
      bounds: BOUNDS,
    });
    expect(sched.spawns.length).toBe(0);
    expect(sched.swipes.length).toBeGreaterThanOrEqual(1);
  });

  it('каждый спавн имеет валидные поля', () => {
    const sched = prepareSliceSchedule({
      durationMs: 30_000,
      bodyCount: 30,
      bounds: BOUNDS,
    });
    for (const sp of sched.spawns) {
      expect(typeof sp.time).toBe('number');
      expect(sp.time).toBeGreaterThanOrEqual(0);
      expect(sp.x).toBeGreaterThan(0);
      expect(sp.x).toBeLessThan(BOUNDS.width);
      expect(['bolt', 'nut', 'ruler', 'standard', 'pipe']).toContain(sp.kind);
    }
  });

  it('каждый свайп горизонтальный и в пределах экрана по Y', () => {
    const sched = prepareSliceSchedule({
      durationMs: 30_000,
      bodyCount: 30,
      bounds: BOUNDS,
    });
    for (const sw of sched.swipes) {
      // Горизонтальный: y-координаты from/to совпадают.
      expect(sw.from.y).toBe(sw.to.y);
      // Y в пределах экрана (с отступами).
      expect(sw.from.y).toBeGreaterThan(50);
      expect(sw.from.y).toBeLessThan(BOUNDS.height - 100);
      // X: от левой грани к правой.
      expect(sw.from.x).toBeLessThan(sw.to.x);
    }
  });

  it('количество элементов зависит от bodyCount', () => {
    const small = prepareSliceSchedule({
      durationMs: 30_000,
      bodyCount: 10,
      bounds: BOUNDS,
    });
    const large = prepareSliceSchedule({
      durationMs: 30_000,
      bodyCount: 50,
      bounds: BOUNDS,
    });
    expect(large.spawns.length).toBeGreaterThan(small.spawns.length);
  });
});

describe('physics-bench-slice / checkFailFast', () => {
  /** Создаёт BenchReport с заданными значениями метрик. */
  function makeReport(opts: {
    fpsAvg: number;
    p95Frame: number;
    p95Physics: number;
  }): BenchReport {
    return {
      bodyCount: 30,
      durationMs: 30_000,
      bounds: { width: 1280, height: 720 },
      fps: { avg: opts.fpsAvg, p95: 50, samples: 1800 },
      frameTime: { avg: 16, p95: opts.p95Frame },
      physicsStep: { avg: 4, p95: opts.p95Physics },
      retinaResolutionCap: null,
      createdAt: '2026-07-14T00:00:00.000Z',
    };
  }

  it('все пороги пройдены → passed=true', () => {
    const report = makeReport({
      fpsAvg: 60,
      p95Frame: 15,
      p95Physics: 5,
    });
    const { passed, checks } = checkFailFast(report);
    expect(passed).toBe(true);
    expect(checks.length).toBe(5);
    for (const c of checks) {
      expect(c.passed).toBe(true);
    }
  });

  it('провален fps → passed=false', () => {
    const report = makeReport({
      fpsAvg: 40, // < 55
      p95Frame: 15,
      p95Physics: 5,
    });
    const { passed, checks } = checkFailFast(report);
    expect(passed).toBe(false);
    const fpsCheck = checks.find((c) => c.name.includes('fps'));
    expect(fpsCheck?.passed).toBe(false);
  });

  it('провален p95 frame time → passed=false', () => {
    const report = makeReport({
      fpsAvg: 60,
      p95Frame: 25, // > 18
      p95Physics: 5,
    });
    const { passed } = checkFailFast(report);
    expect(passed).toBe(false);
  });

  it('провален p95 physics step → passed=false', () => {
    const report = makeReport({
      fpsAvg: 60,
      p95Frame: 15,
      p95Physics: 10, // > 6
    });
    const { passed } = checkFailFast(report);
    expect(passed).toBe(false);
  });

  it('каждая проверка содержит actual/threshold/passed', () => {
    const report = makeReport({ fpsAvg: 60, p95Frame: 15, p95Physics: 5 });
    const { checks } = checkFailFast(report, {
      tunnelingPercent: 0.5,
      inputToSliceFrames: 1,
    });
    for (const c of checks) {
      expect(typeof c.name).toBe('string');
      expect(typeof c.actual).toBe('number');
      expect(typeof c.threshold).toBe('number');
      expect(typeof c.passed).toBe('boolean');
    }
  });

  it('tunneling > порога → провал', () => {
    const report = makeReport({ fpsAvg: 60, p95Frame: 15, p95Physics: 5 });
    const { passed } = checkFailFast(report, { tunnelingPercent: 5 });
    expect(passed).toBe(false);
  });

  it('input→slice > порога → провал', () => {
    const report = makeReport({ fpsAvg: 60, p95Frame: 15, p95Physics: 5 });
    const { passed } = checkFailFast(report, { inputToSliceFrames: 3 });
    expect(passed).toBe(false);
  });
});
