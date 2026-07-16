import { describe, it, expect } from 'vitest';
import { WAVES, type WaveConfig } from '../wave/WaveConfig';

/**
 * Тесты WaveConfig / WAVES (фаза 6) — pure-logic параметры волн.
 *
 * Проверяет контракт плана «Параметры волн (метрики)»:
 *   - WAVES содержит >= 5 волн;
 *   - каждая волна имеет валидные поля (см. инварианты ниже);
 *   - монотонный рост сложности: spawnRate и bombPercent не убывают,
 *     speedMultiplier >= 1 (базовая скорость не медленнее W1).
 *
 * Модуль НЕ зависит от Phaser — тестируется в чистом окружении.
 */

/** Инварианты одной волны. */
function assertValidWave(w: WaveConfig, label: string): void {
  expect(w.spawnRate, `${label}.spawnRate > 0`).toBeGreaterThan(0);
  expect(w.bombPercent, `${label}.bombPercent в [0..1]`).toBeGreaterThanOrEqual(0);
  expect(w.bombPercent, `${label}.bombPercent в [0..1]`).toBeLessThanOrEqual(1);
  expect(w.speedMultiplier, `${label}.speedMultiplier >= 1`).toBeGreaterThanOrEqual(1);
  expect(w.waveDuration, `${label}.waveDuration > 0`).toBeGreaterThan(0);
}

describe('WaveConfig / WAVES — базовая структура', () => {
  it('WAVES содержит минимум 5 волн', () => {
    expect(WAVES.length).toBeGreaterThanOrEqual(5);
  });

  it('все волны имеют валидные поля', () => {
    WAVES.forEach((w, i) => assertValidWave(w, `W${i + 1}`));
  });

  it('первая волна — лёгкая (spawnRate <= 1.1, bombPercent <= 0.12)', () => {
    const w1 = WAVES[0];
    expect(w1.spawnRate).toBeLessThanOrEqual(1.1);
    expect(w1.bombPercent).toBeLessThanOrEqual(0.12);
  });

  it('последняя волна — жёсткая (spawnRate >= 1.0, bombPercent >= 0.18)', () => {
    const last = WAVES[WAVES.length - 1];
    expect(last.spawnRate).toBeGreaterThanOrEqual(1.0);
    expect(last.bombPercent).toBeGreaterThanOrEqual(0.18);
  });

  it('W1 — базовая скорость (speedMultiplier === 1.0)', () => {
    expect(WAVES[0].speedMultiplier).toBe(1.0);
  });
});

describe('WaveConfig / WAVES — монотонная эскалация', () => {
  it('spawnRate монотонно не убывает', () => {
    for (let i = 1; i < WAVES.length; i++) {
      expect(WAVES[i].spawnRate, `W${i + 1} >= W${i}`).toBeGreaterThanOrEqual(
        WAVES[i - 1].spawnRate,
      );
    }
  });

  it('bombPercent монотонно не убывает', () => {
    for (let i = 1; i < WAVES.length; i++) {
      expect(WAVES[i].bombPercent, `W${i + 1} >= W${i}`).toBeGreaterThanOrEqual(
        WAVES[i - 1].bombPercent,
      );
    }
  });

  it('speedMultiplier монотонно не убывает', () => {
    for (let i = 1; i < WAVES.length; i++) {
      expect(
        WAVES[i].speedMultiplier,
        `W${i + 1} >= W${i}`,
      ).toBeGreaterThanOrEqual(WAVES[i - 1].speedMultiplier);
    }
  });

  it('между W1 и последней есть заметный рост spawnRate', () => {
    expect(WAVES[WAVES.length - 1].spawnRate).toBeGreaterThan(WAVES[0].spawnRate);
  });

  it('между W1 и последней есть заметный рост bombPercent', () => {
    expect(WAVES[WAVES.length - 1].bombPercent).toBeGreaterThan(WAVES[0].bombPercent);
  });
});

describe('WaveConfig / WAVES — конкретные значения (документация контракта)', () => {
  it('W1.spawnRate ~ 1.0 (аркадный темп, больше объектов)', () => {
    expect(WAVES[0].spawnRate).toBeCloseTo(1.0, 2);
  });

  it('W1.bombPercent === 0.1 (10% труб)', () => {
    expect(WAVES[0].bombPercent).toBe(0.1);
  });

  it('W1.waveDuration — 25 сек', () => {
    expect(WAVES[0].waveDuration).toBe(25);
  });

  it('все waveDuration — положительные', () => {
    WAVES.forEach((w, i) => {
      expect(w.waveDuration, `W${i + 1} > 0`).toBeGreaterThan(0);
    });
  });
});
