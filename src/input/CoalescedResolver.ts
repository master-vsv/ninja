import type { TrailPoint } from './TrailBuffer';

/**
 * CoalescedResolver (фаза 1, риск №7 в плане).
 *
 * Safari iOS < 14.5 не реализует `PointerEvent.getCoalescedEvents()`. Чтобы
 * на быстрых свайпах не было разрывов (≥ 2 свайпа/сек, длина ≥ 400px —
 * checkpoint фазы 1), мы должны извлекать промежуточные точки через
 * coalesced events там, где они поддерживаются, и fallback'ить на обычный
 * pointermove там, где нет.
 *
 * Стратегия — feature detection:
 *   - если у события есть `getCoalescedEvents` (функция) и он возвращает
 *     непустой массив — используем эти точки;
 *   - иначе fallback: одна точка (само событие pointermove).
 *
 * Чистая логика (без Phaser/DOM) — отлично тестируется. Phaser-зависимый
 * адаптер, приводящий `Phaser.Input.Pointer` к `CoalescedSource`, живёт в
 * `systems/InputSystem.ts`.
 */
export interface CoalescedSource {
  readonly x: number;
  readonly y: number;
  readonly t: number;
  /** Опциональный метод браузера для извлечения промежуточных событий. */
  readonly getCoalescedEvents?: () => ReadonlyArray<CoalescedSource>;
}

export class CoalescedResolver {
  /**
   * Поддерживается ли getCoalescedEvents для данного источника.
   * Feature detection: true только если метод существует и это функция.
   */
  isSupported(source: CoalescedSource): boolean {
    return typeof source.getCoalescedEvents === 'function';
  }

  /**
   * Разрешает точки свайпа из события.
   * Возвращает массив точек (от 1 до N), готовых к addPoint в TrailBuffer.
   *
   * - При наличии coalesced events и непустом массиве — возвращает их;
   * - иначе fallback на [single point] (само событие).
   */
  resolve(source: CoalescedSource): TrailPoint[] {
    if (this.isSupported(source)) {
      const coalesced = source.getCoalescedEvents!();
      if (coalesced && coalesced.length > 0) {
        // Приводим к {x,y,t}, отбрасывая лишние поля (immutable снимок).
        return coalesced.map((e) => ({ x: e.x, y: e.y, t: e.t }));
      }
    }
    return [{ x: source.x, y: source.y, t: source.t }];
  }
}
