import { describe, it, expect } from 'vitest';
import { Profiler } from '../perf/Profiler';

/**
 * Тесты Profiler (фаза 7) — pure-logic метрик производительности.
 *
 * Назначение (план, фаза 7): каркас для замера fps / p95 frame time / draw calls.
 *   - recordFrame(ms) — копит frame time в скользящем окне;
 *   - recordPhysicsStep(ms) — копит physics step;
 *   - getFps() — средний fps за окно;
 *   - getP95Frame() — 95-й перцентиль frame time;
 *   - setDrawCalls/getDrawCalls — сеттер из Phaser renderer.renderCount;
 *   - snapshot() — отчёт; reset() — очистка.
 *
 * Модуль НЕ зависит от Phaser — тестируется в чистом окружении.
 */

describe('Profiler / конструктор и окно', () => {
  it('по умолчанию windowSize > 0', () => {
    const p = new Profiler();
    expect(p.windowSize).toBeGreaterThan(0);
  });

  it('кастомный windowSize сохраняется', () => {
    const p = new Profiler(60);
    expect(p.windowSize).toBe(60);
  });

  it('windowSize clamp на >=1', () => {
    const p = new Profiler(0);
    expect(p.windowSize).toBe(1);
  });

  it('начальный sampleCount=0', () => {
    const p = new Profiler();
    expect(p.sampleCount).toBe(0);
  });
});

describe('Profiler / recordFrame и getFps', () => {
  it('getFps=0 без данных', () => {
    const p = new Profiler();
    expect(p.getFps()).toBe(0);
  });

  it('frame=16.67ms → fps≈60', () => {
    const p = new Profiler(120);
    for (let i = 0; i < 60; i++) p.recordFrame(16.67);
    expect(p.getFps()).toBeCloseTo(60, 0);
  });

  it('frame=33.33ms → fps≈30', () => {
    const p = new Profiler(120);
    for (let i = 0; i < 60; i++) p.recordFrame(33.33);
    expect(p.getFps()).toBeCloseTo(30, 0);
  });

  it('frame=0 не роняет getFps (возвращает 0)', () => {
    const p = new Profiler(60);
    p.recordFrame(0);
    expect(p.getFps()).toBe(0);
  });

  it('recordFrame накапливает sampleCount', () => {
    const p = new Profiler(120);
    p.recordFrame(16);
    p.recordFrame(17);
    expect(p.sampleCount).toBe(2);
  });

  it('окно ограничено windowSize (старые семплы вытесняются)', () => {
    const p = new Profiler(3);
    p.recordFrame(10);
    p.recordFrame(20);
    p.recordFrame(30);
    p.recordFrame(40);
    expect(p.sampleCount).toBe(3);
  });

  it('скользящее окно пересчитывает fps по последним семплам', () => {
    const p = new Profiler(2);
    // Два «быстрых» кадра (60fps), затем два «медленных» (30fps).
    p.recordFrame(16.67);
    p.recordFrame(16.67);
    expect(p.getFps()).toBeCloseTo(60, 0);
    p.recordFrame(33.33);
    p.recordFrame(33.33);
    expect(p.getFps()).toBeCloseTo(30, 0);
  });
});

describe('Profiler / getP95Frame', () => {
  it('getP95Frame=0 без данных', () => {
    const p = new Profiler();
    expect(p.getP95Frame()).toBe(0);
  });

  it('p95 >= медианы для равномерного распределения', () => {
    const p = new Profiler(120);
    for (let i = 1; i <= 20; i++) p.recordFrame(i);
    const p95 = p.getP95Frame();
    const median = 10.5;
    expect(p95).toBeGreaterThanOrEqual(median);
  });

  it('p95捕捉ывает всплеск: при стабильных 16ms + один 50ms → p95 >= 16', () => {
    const p = new Profiler(120);
    for (let i = 0; i < 19; i++) p.recordFrame(16);
    p.recordFrame(50);
    expect(p.getP95Frame()).toBeGreaterThanOrEqual(16);
  });

  it('p95 не превосходит максимум семплов', () => {
    const p = new Profiler(120);
    for (let i = 1; i <= 20; i++) p.recordFrame(i);
    expect(p.getP95Frame()).toBeLessThanOrEqual(20);
  });
});

describe('Profiler / drawCalls', () => {
  it('начальный getDrawCalls=0', () => {
    const p = new Profiler();
    expect(p.getDrawCalls()).toBe(0);
  });

  it('setDrawCalls сохраняет значение', () => {
    const p = new Profiler();
    p.setDrawCalls(42);
    expect(p.getDrawCalls()).toBe(42);
  });

  it('setDrawCalls clamp на 0 для отрицательных', () => {
    const p = new Profiler();
    p.setDrawCalls(-5);
    expect(p.getDrawCalls()).toBe(0);
  });

  it('setDrawCalls округляет дробные', () => {
    const p = new Profiler();
    p.setDrawCalls(12.7);
    expect(p.getDrawCalls()).toBe(12);
  });
});

describe('Profiler / recordPhysicsStep', () => {
  it('getP95PhysicsStep=0 без данных', () => {
    const p = new Profiler();
    expect(p.getP95PhysicsStep()).toBe(0);
  });

  it('recordPhysicsStep копит данные для p95', () => {
    const p = new Profiler(120);
    for (let i = 0; i < 10; i++) p.recordPhysicsStep(3);
    p.recordPhysicsStep(8);
    expect(p.getP95PhysicsStep()).toBeGreaterThan(0);
    expect(p.getP95PhysicsStep()).toBeLessThanOrEqual(8);
  });
});

describe('Profiler / snapshot', () => {
  it('snapshot возвращает fps/p95Frame/drawCalls/sampleCount', () => {
    const p = new Profiler(60);
    for (let i = 0; i < 30; i++) p.recordFrame(16.67);
    p.setDrawCalls(15);
    const snap = p.snapshot();
    expect(snap).toHaveProperty('fps');
    expect(snap).toHaveProperty('p95FrameMs');
    expect(snap).toHaveProperty('drawCalls');
    expect(snap).toHaveProperty('sampleCount');
    expect(snap.fps).toBeCloseTo(60, 0);
    expect(snap.drawCalls).toBe(15);
    expect(snap.sampleCount).toBe(30);
  });

  it('snapshot на пустом профайлере: fps=0, sampleCount=0', () => {
    const p = new Profiler();
    const snap = p.snapshot();
    expect(snap.fps).toBe(0);
    expect(snap.p95FrameMs).toBe(0);
    expect(snap.sampleCount).toBe(0);
  });
});

describe('Profiler / reset', () => {
  it('reset очищает frame times', () => {
    const p = new Profiler(60);
    for (let i = 0; i < 10; i++) p.recordFrame(16);
    p.reset();
    expect(p.sampleCount).toBe(0);
    expect(p.getFps()).toBe(0);
  });

  it('reset очищает physics steps', () => {
    const p = new Profiler(60);
    p.recordPhysicsStep(5);
    p.reset();
    expect(p.getP95PhysicsStep()).toBe(0);
  });

  it('reset сбрасывает drawCalls', () => {
    const p = new Profiler(60);
    p.setDrawCalls(42);
    p.reset();
    expect(p.getDrawCalls()).toBe(0);
  });
});
