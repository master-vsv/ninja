import { describe, it, expect } from 'vitest';
import { WaveState } from '../wave/WaveState';
import { WAVES } from '../wave/WaveConfig';

/**
 * Тесты WaveState (фаза 6) — pure-logic state-machine прогрессии волн.
 *
 * Покрывает:
 *   - начальное состояние: index=0, elapsed=0;
 *   - getCurrent() возвращает WAVES[index];
 *   - update(dtSec) накапливает elapsed;
 *   - при elapsed >= waveDuration → переход на следующую волну, elapsed=0;
 *   - update(dtSec <= 0) — no-op;
 *   - isMaxWave() корректно определяет последнюю волну;
 *   - на максимальной волне update не выходит за пределы массива;
 *   - reset() сбрасывает на W1.
 *
 * Модуль НЕ зависит от Phaser.
 */

describe('WaveState / начальное состояние', () => {
  it('currentWaveIndex === 0', () => {
    const s = new WaveState();
    expect(s.currentWaveIndex).toBe(0);
  });

  it('elapsedSec === 0', () => {
    const s = new WaveState();
    expect(s.elapsedSec).toBe(0);
  });

  it('getCurrent() возвращает W1', () => {
    const s = new WaveState();
    expect(s.getCurrent()).toBe(WAVES[0]);
  });

  it('isMaxWave() === false на W1 (если волн > 1)', () => {
    const s = new WaveState();
    expect(WAVES.length).toBeGreaterThan(1);
    expect(s.isMaxWave()).toBe(false);
  });
});

describe('WaveState.update — накопление времени', () => {
  it('update(dtSec) накапливает elapsed', () => {
    const s = new WaveState();
    s.update(5);
    expect(s.elapsedSec).toBe(5);
    s.update(3);
    expect(s.elapsedSec).toBe(8);
  });

  it('не переходит на следующую волну до истечения waveDuration', () => {
    const s = new WaveState();
    const w1 = WAVES[0];
    s.update(w1.waveDuration - 1);
    expect(s.currentWaveIndex).toBe(0);
    expect(s.getCurrent()).toBe(WAVES[0]);
  });

  it('update(0) — no-op', () => {
    const s = new WaveState();
    s.update(0);
    expect(s.elapsedSec).toBe(0);
    expect(s.currentWaveIndex).toBe(0);
  });

  it('update(отрицательное) — no-op', () => {
    const s = new WaveState();
    s.update(-10);
    expect(s.elapsedSec).toBe(0);
    expect(s.currentWaveIndex).toBe(0);
  });
});

describe('WaveState.update — переход волн', () => {
  it('при elapsed >= waveDuration → переход на W2, elapsed=0', () => {
    const s = new WaveState();
    const w1 = WAVES[0];
    s.update(w1.waveDuration);
    expect(s.currentWaveIndex).toBe(1);
    expect(s.elapsedSec).toBe(0);
    expect(s.getCurrent()).toBe(WAVES[1]);
  });

  it('большой dt (> waveDuration) → переход ровно на следующую, elapsed=0', () => {
    const s = new WaveState();
    const w1 = WAVES[0];
    s.update(w1.waveDuration + 5);
    expect(s.currentWaveIndex).toBe(1);
    expect(s.elapsedSec).toBe(0);
  });

  it('последовательные переходы через несколько волн', () => {
    const s = new WaveState();
    // W1 → W2.
    s.update(WAVES[0].waveDuration);
    expect(s.currentWaveIndex).toBe(1);
    // W2 → W3.
    s.update(WAVES[1].waveDuration);
    expect(s.currentWaveIndex).toBe(2);
    // W3 → W4.
    s.update(WAVES[2].waveDuration);
    expect(s.currentWaveIndex).toBe(3);
  });

  it('фрагментарный dt накапливается и переходит при суммарном >= duration', () => {
    const s = new WaveState();
    const w1 = WAVES[0];
    const quarter = w1.waveDuration / 4;
    s.update(quarter);
    s.update(quarter);
    s.update(quarter);
    expect(s.currentWaveIndex).toBe(0);
    s.update(quarter); // суммарно = waveDuration → переход
    expect(s.currentWaveIndex).toBe(1);
    expect(s.elapsedSec).toBe(0);
  });
});

describe('WaveState / максимальная волна', () => {
  it('isMaxWave() true на последней волне', () => {
    const s = new WaveState();
    // Прокручиваем все волны, кроме последней.
    for (let i = 0; i < WAVES.length - 1; i++) {
      s.update(WAVES[i].waveDuration);
    }
    expect(s.currentWaveIndex).toBe(WAVES.length - 1);
    expect(s.isMaxWave()).toBe(true);
  });

  it('на максимальной волне update не выходит за пределы массива', () => {
    const s = new WaveState();
    // Дойти до последней.
    for (let i = 0; i < WAVES.length - 1; i++) {
      s.update(WAVES[i].waveDuration);
    }
    expect(s.isMaxWave()).toBe(true);
    // Несколько update на максимальной — остаёмся на ней.
    s.update(WAVES[WAVES.length - 1].waveDuration);
    s.update(WAVES[WAVES.length - 1].waveDuration);
    expect(s.currentWaveIndex).toBe(WAVES.length - 1);
    expect(s.getCurrent()).toBe(WAVES[WAVES.length - 1]);
  });

  it('очень большой dt на максимальной волне — index не растёт', () => {
    const s = new WaveState();
    for (let i = 0; i < WAVES.length - 1; i++) {
      s.update(WAVES[i].waveDuration);
    }
    s.update(100000);
    expect(s.currentWaveIndex).toBe(WAVES.length - 1);
  });
});

describe('WaveState.reset', () => {
  it('reset сбрасывает на W1 (index=0, elapsed=0)', () => {
    const s = new WaveState();
    s.update(WAVES[0].waveDuration);
    s.update(5);
    expect(s.currentWaveIndex).toBe(1);
    s.reset();
    expect(s.currentWaveIndex).toBe(0);
    expect(s.elapsedSec).toBe(0);
    expect(s.getCurrent()).toBe(WAVES[0]);
  });

  it('reset идемпотентен', () => {
    const s = new WaveState();
    s.reset();
    s.reset();
    expect(s.currentWaveIndex).toBe(0);
    expect(s.elapsedSec).toBe(0);
  });

  it('после reset прогрессия снова работает', () => {
    const s = new WaveState();
    s.update(WAVES[0].waveDuration);
    expect(s.currentWaveIndex).toBe(1);
    s.reset();
    s.update(WAVES[0].waveDuration);
    expect(s.currentWaveIndex).toBe(1);
  });
});
