/**
 * Profiler (фаза 7) — pure-logic метрики производительности.
 *
 * Назначение (план, фаза 7 «целевые устройства + метрика fps»):
 *   - скользящее окно frame time (recordFrame каждый кадр);
 *   - средний fps за окно;
 *   - p95 frame time (целевой порог ≤ 16.67мс);
 *   - p95 physics step (порог ≤ 6мс);
 *   - drawCalls — сеттер из Phaser renderer.renderCount (порог <50 mobile / <200 desktop);
 *   - snapshot() — сводный отчёт (для debug-оверлея F3 в GameScene).
 *
 * Замер реальные p95 на устройстве — за пределами CI, но каркас заложен здесь.
 * GameScene подключает Profiler: recordFrame(performance.now() дельта) в update(),
 * setDrawCalls(renderer.renderCount) в post-render.
 *
 * Модуль НЕ зависит от Phaser — только числа. Тестируется в чистом окружении.
 */

/** Размер скользящего окна по умолчанию (~2 секунды при 60fps). */
const DEFAULT_WINDOW_SIZE = 120;

/** Сводный отчёт метрик (для debug-оверлея). */
export interface ProfilerSnapshot {
  /** Средний fps за окно. */
  readonly fps: number;
  /** 95-й перцентиль frame time, мс. */
  readonly p95FrameMs: number;
  /** 95-й перцентиль physics step, мс. */
  readonly p95PhysicsStepMs: number;
  /** Draw calls из renderer.renderCount (снимок последнего setDrawCalls). */
  readonly drawCalls: number;
  /** Число накопленных frame-семплов в окне. */
  readonly sampleCount: number;
}

export class Profiler {
  /** Скользящее окно frame time, мс. */
  private readonly frameTimes: number[] = [];
  /** Скользящее окно physics step, мс. */
  private readonly physicsSteps: number[] = [];
  private readonly _windowSize: number;
  /** Последнее значение draw calls из renderer. */
  private drawCalls = 0;

  /**
   * @param windowSize размер скользящего окна семплов. По умолчанию 120.
   */
  constructor(windowSize: number = DEFAULT_WINDOW_SIZE) {
    this._windowSize = Math.max(1, Math.floor(windowSize));
  }

  /** Размер скользящего окна. */
  get windowSize(): number {
    return this._windowSize;
  }

  /** Число накопленных frame-семплов в окне. */
  get sampleCount(): number {
    return this.frameTimes.length;
  }

  /**
   * Записать время кадра (мс). Поддерживает скользящее окно: при превышении
   * windowSize старые семплы вытесняются (FIFO).
   */
  recordFrame(frameTimeMs: number): void {
    this.pushBounded(this.frameTimes, frameTimeMs);
  }

  /** Записать время шага физики (мс). То же скользящее окно. */
  recordPhysicsStep(ms: number): void {
    this.pushBounded(this.physicsSteps, ms);
  }

  /**
   * Средний fps за окно. 0 если нет данных или среднее frame time == 0.
   * fps = 1000 / avg(frameTime).
   */
  getFps(): number {
    if (this.frameTimes.length === 0) return 0;
    const sum = this.frameTimes.reduce((a, b) => a + b, 0);
    const avg = sum / this.frameTimes.length;
    return avg > 0 ? 1000 / avg : 0;
  }

  /** 95-й перцентиль frame time (мс). 0 если нет данных. */
  getP95Frame(): number {
    return percentile(this.frameTimes, 0.95);
  }

  /** 95-й перцентиль physics step (мс). 0 если нет данных. */
  getP95PhysicsStep(): number {
    return percentile(this.physicsSteps, 0.95);
  }

  /**
   * Сеттер draw calls из Phaser renderer.renderCount.
   * Отрицательные clamp на 0, дробные округляются.
   */
  setDrawCalls(count: number): void {
    this.drawCalls = Math.max(0, Math.floor(count));
  }

  /** Последнее значение draw calls. */
  getDrawCalls(): number {
    return this.drawCalls;
  }

  /** Сводный отчёт метрик (для debug-оверлея F3 в GameScene). */
  snapshot(): ProfilerSnapshot {
    return {
      fps: this.getFps(),
      p95FrameMs: this.getP95Frame(),
      p95PhysicsStepMs: this.getP95PhysicsStep(),
      drawCalls: this.drawCalls,
      sampleCount: this.frameTimes.length,
    };
  }

  /** Полная очистка метрик (frame, physics, drawCalls). Идемпотентен. */
  reset(): void {
    this.frameTimes.length = 0;
    this.physicsSteps.length = 0;
    this.drawCalls = 0;
  }

  /** Вспомогательное: добавить в скользящее окно с FIFO-вытеснением. */
  private pushBounded(arr: number[], value: number): void {
    arr.push(value);
    if (arr.length > this._windowSize) {
      arr.shift();
    }
  }
}

/**
 * Вычисление p-го перцентиля (0..1) массива чисел.
 * Используется nearest-rank метод (простой, без интерполяции — достаточно для аудита).
 * @returns 0 если массив пуст.
 */
function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  if (values.length === 1) return values[0];
  // Копируем и сортируем по возрастанию — исходный массив не мутируем.
  const sorted = [...values].sort((a, b) => a - b);
  const clamped = Math.min(1, Math.max(0, p));
  // Nearest-rank: индекс = ceil(clamped * n) - 1, clamped в [0,1].
  const rank = Math.max(1, Math.ceil(clamped * sorted.length));
  const idx = Math.min(sorted.length - 1, rank - 1);
  return sorted[idx];
}
