import { describe, it, expect } from 'vitest';
import { TrailBuffer } from '../input/TrailBuffer';

/**
 * Тесты чистого ring-buffer'а точек свайпа (фаза 1).
 *
 * TrailBuffer — ядро ввода: хранит последние N точек свайпа (ограниченный ring buffer),
 * даёт сегменты для отрисовки и (позже) slice-детекции. Не зависит от Phaser.
 *
 * Ключевые свойства:
 *   - добавление точек;
 *   - ring buffer ограничивает размер (вытесняет старые при превышении N);
 *   - N точек → N-1 сегментов;
 *   - getLastSegment() возвращает последний сегмент или null;
 *   - clear() опустошает буфер;
 *   - детерминированность.
 */
describe('TrailBuffer', () => {
  it('начинается пустым', () => {
    const buf = new TrailBuffer(5);
    expect(buf.size).toBe(0);
    expect(buf.getSegments()).toEqual([]);
    expect(buf.getLastSegment()).toBeNull();
    expect(buf.getPoints()).toEqual([]);
  });

  it('добавляет точки инкрементально', () => {
    const buf = new TrailBuffer(5);
    buf.addPoint(0, 0, 0);
    expect(buf.size).toBe(1);
    buf.addPoint(10, 0, 1);
    expect(buf.size).toBe(2);
  });

  it('N точек → N-1 сегментов, в порядке добавления', () => {
    const buf = new TrailBuffer(5);
    buf.addPoint(0, 0, 0);
    buf.addPoint(10, 0, 1);
    buf.addPoint(20, 0, 2);
    buf.addPoint(30, 0, 3);
    const segments = buf.getSegments();
    expect(segments.length).toBe(3);
    expect(segments[0].from.x).toBe(0);
    expect(segments[0].to.x).toBe(10);
    expect(segments[1].from.x).toBe(10);
    expect(segments[1].to.x).toBe(20);
    expect(segments[2].from.x).toBe(20);
    expect(segments[2].to.x).toBe(30);
  });

  it('ring buffer ограничивает размер: при превышении N вытесняет старые', () => {
    const buf = new TrailBuffer(3);
    buf.addPoint(0, 0, 0);
    buf.addPoint(10, 0, 1);
    buf.addPoint(20, 0, 2);
    buf.addPoint(30, 0, 3); // вытесняет (0,0)
    expect(buf.size).toBe(3);
    expect(buf.getPoints().map((p) => p.x)).toEqual([10, 20, 30]);
  });

  it('ring buffer продолжает корректно после многократного переполнения', () => {
    const buf = new TrailBuffer(3);
    for (let i = 0; i < 8; i++) {
      buf.addPoint(i * 10, 0, i);
    }
    // Должны остаться последние 3 точки: 50, 60, 70.
    expect(buf.size).toBe(3);
    expect(buf.getPoints().map((p) => p.x)).toEqual([50, 60, 70]);
    const segments = buf.getSegments();
    expect(segments.length).toBe(2);
    expect(segments[0].from.x).toBe(50);
    expect(segments[0].to.x).toBe(60);
    expect(segments[1].from.x).toBe(60);
    expect(segments[1].to.x).toBe(70);
  });

  it('getLastSegment: 0 точек → null', () => {
    const buf = new TrailBuffer(5);
    expect(buf.getLastSegment()).toBeNull();
  });

  it('getLastSegment: 1 точка → null (нет сегментов)', () => {
    const buf = new TrailBuffer(5);
    buf.addPoint(0, 0, 0);
    expect(buf.getLastSegment()).toBeNull();
  });

  it('getLastSegment: возвращает последний добавленный сегмент', () => {
    const buf = new TrailBuffer(5);
    buf.addPoint(0, 0, 0);
    buf.addPoint(10, 0, 1);
    let last = buf.getLastSegment();
    expect(last).not.toBeNull();
    expect(last!.from.x).toBe(0);
    expect(last!.to.x).toBe(10);
    buf.addPoint(20, 5, 2);
    last = buf.getLastSegment();
    expect(last!.from).toEqual({ x: 10, y: 0, t: 1 });
    expect(last!.to).toEqual({ x: 20, y: 5, t: 2 });
  });

  it('getLastSegment корректен после переполнения ring buffer', () => {
    const buf = new TrailBuffer(2);
    buf.addPoint(0, 0, 0);
    buf.addPoint(10, 0, 1);
    buf.addPoint(20, 0, 2); // вытесняет (0,0)
    const last = buf.getLastSegment();
    expect(last!.from.x).toBe(10);
    expect(last!.to.x).toBe(20);
  });

  it('clear() опустошает буфер полностью', () => {
    const buf = new TrailBuffer(5);
    buf.addPoint(0, 0, 0);
    buf.addPoint(10, 0, 1);
    buf.clear();
    expect(buf.size).toBe(0);
    expect(buf.getSegments()).toEqual([]);
    expect(buf.getLastSegment()).toBeNull();
    expect(buf.getPoints()).toEqual([]);
  });

  it('после clear можно снова наполнять буфер', () => {
    const buf = new TrailBuffer(3);
    buf.addPoint(0, 0, 0);
    buf.clear();
    buf.addPoint(100, 100, 10);
    buf.addPoint(200, 100, 11);
    expect(buf.size).toBe(2);
    expect(buf.getPoints().map((p) => p.x)).toEqual([100, 200]);
  });

  it('getSegments() не мутирует состояние (иммутабельный снимок)', () => {
    const buf = new TrailBuffer(5);
    buf.addPoint(0, 0, 0);
    buf.addPoint(10, 0, 1);
    const s1 = buf.getSegments();
    const s2 = buf.getSegments();
    expect(s1).not.toBe(s2); // разные массивы
    expect(s1).toEqual(s2); // одинаковое содержимое
    expect(buf.size).toBe(2); // состояние не изменилось
  });

  it('getPoints() не мутирует состояние (иммутабельный снимок)', () => {
    const buf = new TrailBuffer(5);
    buf.addPoint(0, 0, 0);
    const p1 = buf.getPoints();
    const p2 = buf.getPoints();
    expect(p1).not.toBe(p2);
    expect(p1).toEqual(p2);
  });

  it('точки хранят координаты и timestamp без искажений', () => {
    const buf = new TrailBuffer(5);
    buf.addPoint(11, 22, 33);
    buf.addPoint(44, 55, 66);
    const points = buf.getPoints();
    expect(points[0]).toEqual({ x: 11, y: 22, t: 33 });
    expect(points[1]).toEqual({ x: 44, y: 55, t: 66 });
  });

  it('детерминирован: одинаковая последовательность addPoint → одинаковое состояние', () => {
    const mk = () => {
      const b = new TrailBuffer(4);
      b.addPoint(0, 0, 0);
      b.addPoint(1, 1, 1);
      b.addPoint(2, 2, 2);
      b.addPoint(3, 3, 3);
      b.addPoint(4, 4, 4); // переполнение
      return {
        points: b.getPoints(),
        segments: b.getSegments(),
      };
    };
    expect(mk()).toEqual(mk());
  });

  it('maxSize=1: хранит только последнюю точку, сегментов нет', () => {
    const buf = new TrailBuffer(1);
    buf.addPoint(0, 0, 0);
    buf.addPoint(10, 0, 1);
    expect(buf.size).toBe(1);
    expect(buf.getSegments()).toEqual([]);
    expect(buf.getLastSegment()).toBeNull();
    expect(buf.getPoints()[0].x).toBe(10);
  });

  it('maxSize=0: буфер всегда пуст (защита от невалидного размера)', () => {
    const buf = new TrailBuffer(0);
    buf.addPoint(0, 0, 0);
    buf.addPoint(10, 0, 1);
    expect(buf.size).toBe(0);
    expect(buf.getSegments()).toEqual([]);
    expect(buf.getPoints()).toEqual([]);
  });

  it('сегменты хранят ссылки на immutable точки {x,y,t}', () => {
    const buf = new TrailBuffer(5);
    buf.addPoint(7, 8, 9);
    buf.addPoint(10, 11, 12);
    const seg = buf.getSegments()[0];
    expect(seg.from).toEqual({ x: 7, y: 8, t: 9 });
    expect(seg.to).toEqual({ x: 10, y: 11, t: 12 });
  });
});
