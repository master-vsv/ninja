import Phaser from 'phaser';
import { TrailBuffer } from '../input/TrailBuffer';
import { CoalescedResolver, type CoalescedSource } from '../input/CoalescedResolver';
import { AudioUnlockState } from '../input/AudioUnlockState';

/**
 * Опции InputSystem. Все поля опциональны — значения по умолчанию подобраны
 * под ощущения свайпа в arcad-режиме (~20 точек в буфере, белая линия 4px).
 */
export interface InputSystemOptions {
  /** Максимальное число точек свайпа в буфере (ring buffer). */
  readonly maxTrailPoints?: number;
  /** Цвет линии следа (числовой RGB, напр. 0xffffff). */
  readonly trailColor?: number;
  /** Толщина линии следа в пикселях. */
  readonly trailWidth?: number;
  /**
   * Провайдер цвета следа от активного меча (pull-модель). Если задан — цвет
   * следа меняется по выбранному мечу (forged=cyan, welding=yellow, plasma=magenta,
   * radiation=green). Иначе — статичный trailColor.
   */
  readonly getSwordColor?: () => number;
}

/**
 * InputSystem (фаза 1) — device-agnostic модель ввода + отрисовка следа +
 * AudioContext unlock.
 *
 * Назначение:
 *   - единая модель ввода мышь/pen/touch через Pointer Events
 *     (pointerdown / pointermove / pointerup / pointercancel);
 *   - ring buffer точек свайпа через TrailBuffer;
 *   - getCoalescedEvents с fallback для Safari iOS < 14.5 (риск №7) через
 *     CoalescedResolver;
 *   - отрисовка плавного следа через Graphics;
 *   - AudioContext unlock на первом pointerdown (риск №6) через
 *     scene.sound.unlock().
 *
 * Архитектурный принцип: вся чистая логика вынесена в тестируемые модули
 * (TrailBuffer / CoalescedResolver / AudioUnlockState) и покрыта unit-тестами
 * без рендера. Phaser-зависимая часть — тонкая обёртка: подписка на pointer
 * events, адаптация Phaser.Input.Pointer → CoalescedSource, Graphics-отрисовка,
 * вызов this.sound.unlock().
 *
 * В фазе 3 SliceSystem читает точки свайпа напрямую через поле `trail`.
 */
export class InputSystem {
  /** Ring buffer точек свайпа. Доступен для чтения другим системам (SliceSystem). */
  readonly trail: TrailBuffer;

  private readonly coalescedResolver = new CoalescedResolver();
  private readonly audioUnlockState = new AudioUnlockState();
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly trailColor: number;
  private readonly trailWidth: number;
  private readonly getSwordColor?: () => number;
  private destroyed = false;

  constructor(
    protected readonly scene: Phaser.Scene,
    options: InputSystemOptions = {},
  ) {
    this.trail = new TrailBuffer(options.maxTrailPoints ?? 20);
    this.trailColor = options.trailColor ?? 0xffffff;
    this.trailWidth = options.trailWidth ?? 4;
    this.getSwordColor = options.getSwordColor;
    this.graphics = scene.add.graphics();

    // Подписка на Pointer Events — единая device-agnostic модель (мышь/pen/touch).
    // pointercancel свапим на тот же handler, что и pointerup: cleanup трейла.
    const input = scene.input;
    input.on('pointerdown', this.handlePointerDown, this);
    input.on('pointermove', this.handlePointerMove, this);
    input.on('pointerup', this.handlePointerUp, this);
    input.on('pointercancel', this.handlePointerUp, this);
  }

  /** true, если аудио было разблокировано первым pointerdown. */
  get audioUnlocked(): boolean {
    return this.audioUnlockState.isUnlocked;
  }

  /**
   * Сброс состояния для restart игры:
   *   - audio снова locked (повторный unlock при следующем первом pointerdown);
   *   - trail buffer и graphics очищены.
   */
  reset(): void {
    this.audioUnlockState.reset();
    this.trail.clear();
    this.graphics.clear();
  }

  /**
   * Update-хук. В фазе 1 не выполняет работы: след перерисовывается сразу по
   * pointermove (минимальная задержка input → render). SliceSystem в фазе 3
   * читает trail buffer напрямую в update()-фазе сцены.
   */
  update(): void {
    // Auto-clear: если pointer не зажат, а trail ещё не пуст — значит pointerup
    // был пропущен (выход за canvas, потеря фокуса, multi-touch). Очищаем trail
    // и graphics, чтобы «старый след» не разрезал фигуры, которые через него
    // пролетают (SliceSystem каждый кадр проверяет trail segments).
    if (!this.scene.input.activePointer?.isDown) {
      if (this.trail.getSegments().length > 0) {
        this.trail.clear();
        this.graphics.clear();
      }
    }
  }

  /** Отписка от событий и уничтожение Graphics. Безопасен для повторного вызова. */
  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    const input = this.scene.input;
    input.off('pointerdown', this.handlePointerDown, this);
    input.off('pointermove', this.handlePointerMove, this);
    input.off('pointerup', this.handlePointerUp, this);
    input.off('pointercancel', this.handlePointerUp, this);
    this.graphics.destroy();
  }

  // --- Внутренние обработчики pointer events ---

  /** pointerdown: unlock audio на первом тапе + начало нового свайпа. */
  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    // Риск №6: AudioContext unlock на первом pointerdown (мобильные браузеры).
    if (this.audioUnlockState.onPointerDown()) {
      this.scene.sound.unlock();
    }
    // Новый свайп — очищаем след и буфер от прошлого свайпа.
    this.trail.clear();
    this.graphics.clear();
    const source = this.toCoalescedSource(pointer);
    this.trail.addPoint(source.x, source.y, source.t);
  }

  /**
   * pointermove: накапливаем точки (с coalesced, если поддерживается) и рисуем.
   * ВАЖНО: обрабатываем только при зажатой кнопке/пальце (pointer.isDown). Иначе
   * простое движение мыши без клика засоряет trail и рисует «неисчезающий» след
   * (pointerup при этом не приходит → graphics.clear() не вызывается).
   */
  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    if (!pointer.isDown) return;
    const source = this.toCoalescedSource(pointer);
    const points = this.coalescedResolver.resolve(source);
    for (const p of points) {
      this.trail.addPoint(p.x, p.y, p.t);
    }
    this.drawTrail();
  }

  /** pointerup / pointercancel: очищаем след и буфер. */
  private handlePointerUp(_pointer: Phaser.Input.Pointer): void {
    this.trail.clear();
    this.graphics.clear();
  }

  /** Отрисовка плавного следа через Graphics по сегментам из trail buffer. */
  private drawTrail(): void {
    this.graphics.clear();
    const segments = this.trail.getSegments();
    if (segments.length === 0) {
      return;
    }
    // Цвет следа — от активного меча (если задан provider), иначе статичный.
    const color = this.getSwordColor ? this.getSwordColor() : this.trailColor;
    this.graphics.lineStyle(this.trailWidth, color, 0.9);
    this.graphics.beginPath();
    this.graphics.moveTo(segments[0].from.x, segments[0].from.y);
    for (const s of segments) {
      this.graphics.lineTo(s.to.x, s.to.y);
    }
    this.graphics.strokePath();
  }

  /**
   * Адаптер: приводит Phaser.Input.Pointer к интерфейсу CoalescedSource для
   * CoalescedResolver. Coalesced events приходят в DOM-координатах (clientX/Y),
   * а игра работает в FIT-scaled координатах — трансформируем через ScaleManager.
   */
  private toCoalescedSource(pointer: Phaser.Input.Pointer): CoalescedSource {
    const nativeEvent = pointer.event as
      | (PointerEvent & { getCoalescedEvents?: () => PointerEvent[] })
      | null;
    const fn = nativeEvent?.getCoalescedEvents;

    return {
      x: pointer.x,
      y: pointer.y,
      t: nativeEvent?.timeStamp ?? performance.now(),
      getCoalescedEvents:
        typeof fn === 'function'
          ? () => {
              const natives = fn.call(nativeEvent);
              const sm = this.scene.scale;
              return natives.map((ne) => ({
                x: sm.transformX(ne.clientX),
                y: sm.transformY(ne.clientY),
                t: ne.timeStamp,
              }));
            }
          : undefined,
    };
  }
}
