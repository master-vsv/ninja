/**
 * SlowmoState (фаза 5) — pure-logic state machine для FAKE-slowmo.
 *
 * ВНИМАНИЕ (риск №9 плана): НЕ использует scene.time.timeScale ИЛИ
 * engine.timing.timeScale — это ЛОМАЕТ position-Verlet интеграцию Matter
 * (gravity-член acc*dt² масштабируется, а implicit velocity
 * position-positionPrev НЕТ → объекты перестают замедляться gravity и
 * улетают за экран; проверено эмпирически при timeScale 0.7).
 *
 * Поэтому slowmo здесь — это ТОЛЬКО состояние (флаг + remaining-таймер).
 * Визуальные/геймплейные эффекты applied в Phaser-слое:
 *   - green-glow overlay/vignette в FXSystem (2-3 сек, визуальный slowmo);
 *   - расширение spawnTimer.delay × SLOWMO_SPAWN_DELAY_MULTIPLIER в GameScene
 *     (меньше давления → игрок чувствует «больше времени»);
 *   - (фаза 6, заготовка) расширение combo window.
 *
 * Контракт:
 *   - activate(durationMs) → active=true, remaining=durationMs;
 *   - update(dtMs) → уменьшает remaining, при <=0 → active=false;
 *   - идемпотентен: повторный activate ПРОДЛЕВАЕТ (берёт max текущего и нового);
 *   - update с dtMs<=0 — no-op;
 *   - reset() — мгновенный сброс (для restart).
 *
 * Модуль НЕ зависит от Phaser. Phaser-обёртка — systems/SwordSystem.ts.
 */

/** Результат активации slowmo. */
export interface SlowmoActivateResult {
  /** true, если slowmo активирован (durationMs > 0). */
  readonly activated: boolean;
  /** Оставшаяся длительность после активации, мс. */
  readonly remainingMs: number;
}

/**
 * Чистая state-machine fake-slowmo. Тестируется без рендера и без Phaser.
 * GameScene/FXSystem читают `isActive` каждый кадр (pull-модель, без событий).
 */
export class SlowmoState {
  private _remainingMs = 0;
  private _active = false;

  /** true, если slowmo сейчас действует. */
  get isActive(): boolean {
    return this._active;
  }

  /** Оставшаяся длительность действия, мс (0 если не активно). */
  get remainingMs(): number {
    return this._remainingMs;
  }

  /**
   * Активирует slowmo на durationMs мс.
   *
   * Идемпотентен: повторный activate до истечения ПРОДЛЕВАЕТ действие
   * (remaining = max(current remaining, durationMs)) — не складывается.
   *
   * @returns результат активации {activated, remainingMs}.
   */
  activate(durationMs: number): SlowmoActivateResult {
    if (durationMs <= 0) {
      return { activated: false, remainingMs: this._remainingMs };
    }
    this._remainingMs = Math.max(this._remainingMs, durationMs);
    this._active = true;
    return { activated: true, remainingMs: this._remainingMs };
  }

  /**
   * Per-frame обновление. dtMs — прошедшее время с прошлого кадра (мс).
   * При истечении remaining → active=false (副作用).
   */
  update(dtMs: number): void {
    if (!this._active) return;
    if (dtMs <= 0) return;
    this._remainingMs -= dtMs;
    if (this._remainingMs <= 0) {
      this._remainingMs = 0;
      this._active = false;
    }
  }

  /** Принудительный сброс (например, при restart игры). Идемпотентен. */
  reset(): void {
    this._remainingMs = 0;
    this._active = false;
  }
}
