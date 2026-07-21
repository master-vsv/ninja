import { describe, it, expect } from 'vitest';
import { CoalescedResolver, type CoalescedSource } from '../input/CoalescedResolver';

/**
 * Тесты чистого резолвера coalesced-событий (фаза 1, риск №7 в плане).
 *
 * Safari iOS < 14.5 не реализует PointerEvent.getCoalescedEvents(). Используем
 * feature detection: если метод есть и возвращает непустой массив — расширяем
 * им точки свайпа; иначе fallback на обычный pointermove (одна точка на событие).
 *
 * Тестируется без DOM/Phaser — на моках с тем же интерфейсом.
 */
describe('CoalescedResolver', () => {
  it('fallback: при отсутствии getCoalescedEvents возвращает [single point]', () => {
    const r = new CoalescedResolver();
    const src: CoalescedSource = { x: 10, y: 20, t: 100 };
    expect(r.isSupported(src)).toBe(false);
    const points = r.resolve(src);
    expect(points).toEqual([{ x: 10, y: 20, t: 100 }]);
    expect(points.length).toBe(1);
  });

  it('fallback: при пустом массиве coalesced events тоже возвращаем single point', () => {
    const r = new CoalescedResolver();
    const src: CoalescedSource = {
      x: 1,
      y: 2,
      t: 3,
      getCoalescedEvents: () => [],
    };
    expect(r.isSupported(src)).toBe(true);
    // Браузер может сообщить о поддержке, но вернуть пустой массив — fallback.
    expect(r.resolve(src)).toEqual([{ x: 1, y: 2, t: 3 }]);
  });

  it('возвращает расширенный массив, если coalesced events есть', () => {
    const r = new CoalescedResolver();
    const src: CoalescedSource = {
      x: 100,
      y: 100,
      t: 1000,
      getCoalescedEvents: () => [
        { x: 10, y: 10, t: 100 },
        { x: 20, y: 20, t: 200 },
        { x: 30, y: 30, t: 300 },
      ],
    };
    const points = r.resolve(src);
    expect(points).toEqual([
      { x: 10, y: 10, t: 100 },
      { x: 20, y: 20, t: 200 },
      { x: 30, y: 30, t: 300 },
    ]);
  });

  it('каждый вызов getCoalescedEvents заново извлекает точки (никакого кеша)', () => {
    const r = new CoalescedResolver();
    let callCount = 0;
    const src: CoalescedSource = {
      x: 0,
      y: 0,
      t: 0,
      getCoalescedEvents: () => {
        callCount++;
        return [{ x: callCount, y: 0, t: 0 }];
      },
    };
    r.resolve(src);
    r.resolve(src);
    expect(callCount).toBe(2);
  });

  it('isSupported: true только когда getCoalescedEvents — функция', () => {
    const r = new CoalescedResolver();
    const withMethod: CoalescedSource = {
      x: 0,
      y: 0,
      t: 0,
      getCoalescedEvents: () => [],
    };
    const withoutMethod: CoalescedSource = { x: 0, y: 0, t: 0 };
    expect(r.isSupported(withMethod)).toBe(true);
    expect(r.isSupported(withoutMethod)).toBe(false);
  });

  it('не падает если getCoalescedEvents не функция (защита от странных полей)', () => {
    const r = new CoalescedResolver();
    const src = {
      x: 1,
      y: 2,
      t: 3,
      getCoalescedEvents: 'not a function' as unknown,
    };
    expect(r.isSupported(src as CoalescedSource)).toBe(false);
    expect(r.resolve(src as CoalescedSource)).toEqual([{ x: 1, y: 2, t: 3 }]);
  });

  it('resolve всегда возвращает новый массив (immutability)', () => {
    const r = new CoalescedResolver();
    const src: CoalescedSource = { x: 1, y: 2, t: 3 };
    const a = r.resolve(src);
    const b = r.resolve(src);
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });

  it('точки в resolve приведены к {x,y,t} (нет лишних полей)', () => {
    const r = new CoalescedResolver();
    const src: CoalescedSource = {
      x: 0,
      y: 0,
      t: 0,
      getCoalescedEvents: () => [
        // Намеренно передаём «жирный» объект — резолвер должен оставить только {x,y,t}.
        { x: 1, y: 2, t: 3, extra: 'irrelevant' } as unknown as CoalescedSource,
      ],
    };
    const points = r.resolve(src);
    expect(points[0]).toEqual({ x: 1, y: 2, t: 3 });
    expect(Object.keys(points[0]).sort()).toEqual(['t', 'x', 'y']);
  });

  it('merge: один и тот же резолвер обрабатывает разные источники', () => {
    const r = new CoalescedResolver();
    const withC: CoalescedSource = {
      x: 0,
      y: 0,
      t: 0,
      getCoalescedEvents: () => [{ x: 1, y: 1, t: 1 }],
    };
    const withoutC: CoalescedSource = { x: 2, y: 2, t: 2 };
    expect(r.resolve(withC)).toEqual([{ x: 1, y: 1, t: 1 }]);
    expect(r.resolve(withoutC)).toEqual([{ x: 2, y: 2, t: 2 }]);
  });
});
