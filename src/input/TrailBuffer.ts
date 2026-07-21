/**
 * TrailBuffer (фаза 1) — ring buffer точек свайпа.
 *
 * Ядро ввода. Хранит последние N точек свайпа (ограниченный ring buffer),
 * предоставляет сегменты point_prev → point_curr для отрисовки следа (Graphics)
 * и (позже, фаза 3) для slice-детекции. Не зависит от Phaser — чистая логика,
 * отлично тестируется unit-тестами без рендера.
 *
 * Инварианты:
 *   - size никогда не превышает maxSize;
 *   - порядок точек — хронологический (старые → новые);
 *   - N точек дают N-1 сегментов (N < 2 → нет сегментов);
 *   - getSegments/getPoints возвращают иммутабельные снимки (не мутируют буфер).
 *
 * Сложность: addPoint — O(1) амортизированно на кольце; иные операции здесь
 * не нужны (для размеров N ≤ ~50 с head/tail индексами это копейки в 60 Гц).
 */
export interface TrailPoint {
  /** Координата X в игровых координатах. */
  readonly x: number;
  /** Координата Y в игровых координатах. */
  readonly y: number;
  /** Timestamp точки (performance.now / DOMHighResTimeStamp). */
  readonly t: number;
}

/** Сегмент свайпа для отрисовки и (позже) slice-детекции. */
export interface TrailSegment {
  readonly from: TrailPoint;
  readonly to: TrailPoint;
}

export class TrailBuffer {
  /** Фиксированный массив точек (кольцо). */
  private readonly points: TrailPoint[];
  /** Индекс, куда пишется следующая точка (логическое «окно» кольца). */
  private head = 0;
  /** Текущее количество точек в буфере (0 ≤ count ≤ maxSize). */
  private count = 0;

  /**
   * @param maxSize максимальное число хранимых точек. При добавлении сверх этого
   *                числа старейшая точка вытесняется (ring buffer).
   */
  constructor(private readonly maxSize: number) {
    // Защита от невалидного размера: отрицательный или 0 → буфер всегда пуст.
    const safeSize = Math.max(0, Math.floor(maxSize));
    this.points = new Array<TrailPoint>(safeSize);
    this.maxSize = safeSize;
  }

  /** Текущее количество точек. */
  get size(): number {
    return this.count;
  }

  /** Добавляет точку в буфер. При превышении maxSize старейшая вытесняется. */
  addPoint(x: number, y: number, t: number): void {
    if (this.maxSize === 0) {
      // Размер 0 — буфер всегда пуст (нечего хранить).
      return;
    }
    this.points[this.head] = { x, y, t };
    this.head = (this.head + 1) % this.maxSize;
    if (this.count < this.maxSize) {
      this.count++;
    }
  }

  /**
   * Возвращает сегменты point_prev → point_curr в хронологическом порядке.
   * N точек → N-1 сегментов. Не мутирует состояние.
   */
  getSegments(): TrailSegment[] {
    const pts = this.getPoints();
    const segments: TrailSegment[] = [];
    for (let i = 1; i < pts.length; i++) {
      segments.push({ from: pts[i - 1], to: pts[i] });
    }
    return segments;
  }

  /**
   * Возвращает последний добавленный сегмент или null, если сегментов нет
   * (< 2 точек). Подготовка к SliceSystem фазы 3.
   */
  getLastSegment(): TrailSegment | null {
    if (this.count < 2) {
      return null;
    }
    const newIdx = (this.head - 1 + this.maxSize) % this.maxSize;
    const prevIdx = (this.head - 2 + this.maxSize) % this.maxSize;
    return { from: this.points[prevIdx], to: this.points[newIdx] };
  }

  /**
   * Возвращает иммутабельный снимок точек в хронологическом порядке
   * (от старейшей к новой). Не мутирует состояние.
   */
  getPoints(): TrailPoint[] {
    if (this.count === 0) {
      return [];
    }
    const result: TrailPoint[] = new Array(this.count);
    // start — индекс старейшей точки в кольце.
    const start = (this.head - this.count + this.maxSize) % this.maxSize;
    for (let i = 0; i < this.count; i++) {
      result[i] = this.points[(start + i) % this.maxSize];
    }
    return result;
  }

  /** Очищает буфер. Вызывается по pointerup / pointercancel. */
  clear(): void {
    this.head = 0;
    this.count = 0;
    // Сам массив не зануляем — count ограничивает чтение.
  }
}
