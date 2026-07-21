/**
 * Setup для Vitest: стаб canvas-контекстов.
 *
 * Phaser на этапе ИМПОРТА (device/CanvasFeatures.js -> checkInverseAlpha) вызывает
 *   ctx.fillStyle = '...'
 *   ctx.fillRect(0,0,1,1)
 *   ctx.getImageData(0,0,1,1)   // ожидает { data: [...] } !== null
 *   ctx.putImageData(s1, 1, 0)
 *   ctx.getImageData(1,0,1,1)
 * и сравнивает data[0..3]. JSDOM не реализует getContext без нативного пакета `canvas`
 * (тяжёлая сборка), поэтому подкладываем минимальный стаб через Proxy — этого хватает
 * для импорта Phaser в тестах. Запуск Phaser.Game в тестах фазы 0 не делается.
 */

/** Псевдо-результат ctx.getImageData: {data, width, height}. */
function makeImageDataStub() {
  return {
    data: new Uint8ClampedArray([10, 20, 30, 128]),
    width: 1,
    height: 1,
  };
}

/**
 * Контекст 2D как Proxy: известные свойства хранятся в target (set/get проходят через Reflect),
 * всё остальное (методы) возвращается как callable stub. Спец-кейс для getImageData —
 * возвращает { data: [...] } (Phaser проверяет !== null и сравнивает .data[0..3]).
 */
function create2DStub(): CanvasRenderingContext2D {
  // Заранее заданные scalar-свойства (числа/строки), чтобы get 'fillStyle' до set вернул ''.
  const known: Record<string, unknown> = {
    fillStyle: '',
    strokeStyle: '',
    globalAlpha: 1,
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    miterLimit: 10,
    canvas: null,
  };

  return new Proxy(known, {
    get(target, prop, receiver) {
      if (prop in target) {
        return Reflect.get(target, prop, receiver);
      }
      if (prop === 'getImageData') {
        return () => makeImageDataStub();
      }
      // Любой другой вызов (fillRect, putImageData, drawImage, ...) — no-op.
      return () => undefined;
    },
    set(target, prop, value, receiver) {
      return Reflect.set(target, prop, value, receiver);
    },
  }) as unknown as CanvasRenderingContext2D;
}

if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = function (
    contextId: '2d' | 'webgl' | 'webgl2' | 'experimental-webgl' | string,
  ): CanvasRenderingContext2D | WebGLRenderingContext | null {
    if (contextId === '2d') {
      return create2DStub();
    }
    if (
      contextId === 'webgl' ||
      contextId === 'webgl2' ||
      contextId === 'experimental-webgl'
    ) {
      // Минимальный WebGL-stub: Phaser в тестах не запускает рендер, контекст не нужен.
      return {} as WebGLRenderingContext;
    }
    return null;
  } as HTMLCanvasElement['getContext'];
}
