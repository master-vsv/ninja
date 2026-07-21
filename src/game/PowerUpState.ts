import type { PowerUpType } from './PowerUpType';

/**
 * PowerUpState (pure-logic) — state machine активного power-up эффекта.
 *
 * Назначение: хранить текущий активный эффект (activeType) и оставшуюся
 * длительность (remainingMs). Pull-модель: SpawnDirector каждый кадр читает
 * getScaleMultiplier() для wireframe-рендера и getSpeedMultiplier() для
 * стартовой скорости; GameScene тикает update(dtMs) в update().
 *
 * Контракт (по образцу SlowmoState — стабильный, предсказуемый):
 *   - activate(type, durationMs=DEFAULT_DURATION_MS) → активирует эффект;
 *     длительность = max(current remaining, durationMs) — продление, не суммирование;
 *     новый тип ЗАМЕНЯЕТ активный (с сохранением max remaining);
 *   - update(dtMs) → уменьшает remaining, при <=0 → активный эффект сбрасывается;
 *   - getScaleMultiplier(): shrink=0.6, grow=1.4, slow/shield/none=1.0;
 *   - getSpeedMultiplier(): slow=0.5, shrink/grow/shield/none=1.0;
 *   - isShielded getter: true при активном shield-эффекте (для LifeSystem);
 *   - reset() → мгновенный сброс (для restart игры).
 *
 * НЕ зависит от Phaser. Phaser-обёртка — systems/SpawnDirector.ts +
 * scenes/GameScene.ts.
 */

/** Длительность эффекта по умолчанию, мс (ТЗ: 5 секунд). */
export const DEFAULT_POWERUP_DURATION_MS = 5000;

/**
 * Множитель РАЗМЕРА (scale wireframe) по активному типу.
 * shrink=0.6 (ТЗ), grow=1.4 (ТЗ), slow/shield=1.0 (не меняют размер).
 */
const SCALE_MULTIPLIERS: Readonly<Record<PowerUpType, number>> = {
  shrink: 0.6,
  grow: 1.4,
  slow: 1.0,
  shield: 1.0,
};

/**
 * Множитель СКОРОСТИ ПОЛЁТА новых объектов по активному типу.
 * slow=0.5 (ТЗ), shrink/grow/shield=1.0 (не влияют на скорость).
 *
 * Применяется только к НОВЫМ спавнящимся объектам (в SpawnDirector.spawn):
 * менять скорость уже летающих тел через positionPrev — сломало бы
 * position-Verlet интеграцию Matter (риск №9 плана для SlowmoState).
 */
const SPEED_MULTIPLIERS: Readonly<Record<PowerUpType, number>> = {
  shrink: 1.0,
  grow: 1.0,
  slow: 0.5,
  shield: 1.0,
};

/** Результат активации power-up. */
export interface PowerUpActivateResult {
  /** true, если эффект активирован (durationMs > 0). */
  readonly activated: boolean;
  /** Тип активированного эффекта (совпадает с аргументом). */
  readonly type: PowerUpType;
  /** Оставшаяся длительность после активации, мс. */
  readonly remainingMs: number;
}

/**
 * Чистая state-machine power-up эффекта. Тестируется без рендера и без Phaser.
 */
export class PowerUpState {
  private _activeType: PowerUpType | null = null;
  private _remainingMs = 0;

  /** Активный тип эффекта или null, если эффект не действует. */
  get activeType(): PowerUpType | null {
    return this._activeType;
  }

  /** true, если эффект сейчас действует (тип задан и remaining > 0). */
  get isActive(): boolean {
    return this._activeType !== null && this._remainingMs > 0;
  }

  /**
   * true, если активен shield-эффект (временная неуязвимость).
   * Жизни не уменьшаются при упущенных объектах, пока shield активен.
   * LifeSystem проверяет этот флаг перед applyMiss.
   */
  get isShielded(): boolean {
    return this.isActive && this._activeType === 'shield';
  }

  /** Оставшаяся длительность действия, мс (0 если не активно). */
  get remainingMs(): number {
    return this._remainingMs;
  }

  /**
   * Активирует эффект type на durationMs мс.
   *
   * Семантика:
   *   - durationMs <= 0 → no-op (вернёт activated=false с текущим remaining);
   *   - новый тип ЗАМЕНЯЕТ активный (activeType := type);
   *   - длительность = max(current remaining, durationMs) — продление меньшим
   *     не уменьшает оставшееся время (идемпотентность, как в SlowmoState).
   *
   * @returns результат активации {activated, type, remainingMs}.
   */
  activate(
    type: PowerUpType,
    durationMs: number = DEFAULT_POWERUP_DURATION_MS,
  ): PowerUpActivateResult {
    if (durationMs <= 0) {
      return { activated: false, type, remainingMs: this._remainingMs };
    }
    this._activeType = type;
    this._remainingMs = Math.max(this._remainingMs, durationMs);
    return { activated: true, type, remainingMs: this._remainingMs };
  }

  /**
   * Per-frame обновление. dtMs — прошедшее время с прошлого кадра (мс).
   * При истечении remaining → activeType сбрасывается в null.
   */
  update(dtMs: number): void {
    if (this._activeType === null) return;
    if (dtMs <= 0) return;
    this._remainingMs -= dtMs;
    if (this._remainingMs <= 0) {
      this._remainingMs = 0;
      this._activeType = null;
    }
  }

  /** Принудительный сброс эффекта (например, при restart игры). Идемпотентен. */
  reset(): void {
    this._activeType = null;
    this._remainingMs = 0;
  }

  /**
   * Множитель размера wireframe для текущего активного эффекта (1 если неактивен).
   * SpawnDirector применяет к sprite.scale каждого активного объекта.
   */
  getScaleMultiplier(): number {
    return this._activeType === null
      ? 1
      : SCALE_MULTIPLIERS[this._activeType];
  }

  /**
   * Множитель скорости полёта новых объектов для текущего эффекта (1 если неактивен).
   * SpawnDirector применяет к speedMul в spawn() (только новые объекты).
   */
  getSpeedMultiplier(): number {
    return this._activeType === null
      ? 1
      : SPEED_MULTIPLIERS[this._activeType];
  }
}
