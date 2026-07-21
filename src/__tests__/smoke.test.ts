import { describe, it, expect } from 'vitest';

/**
 * Smoke-тест: подтверждает что Vitest поднялся и базовые конструкции TS работают.
 * Требование фазы 0: «smoke-тест подтверждающий что фреймворк работает».
 */
describe('vitest smoke', () => {
  it('выполняет базовое арифметическое выражение', () => {
    expect(1 + 1).toBe(2);
  });

  it('поддерживает строгую типизацию через транспайл (без ошибок типов)', () => {
    const list: number[] = [1, 2, 3];
    expect(list.reduce((a, b) => a + b, 0)).toBe(6);
  });

  it('поддерживает async/await', async () => {
    const value = await Promise.resolve('ndt-ninja');
    expect(value).toBe('ndt-ninja');
  });
});
