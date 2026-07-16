import { describe, it, expect, afterEach } from 'vitest';
import { FXSystem } from '../systems/FXSystem';
import { eventBus } from '../events/EventBus';
import { EVENT, type SwordType } from '../events/types';
import type { SliceEvent } from '../events/SliceEvent';

/**
 * Wiring-тесты FXSystem (фаза 5 — уникальные эффекты мечей).
 *
 * Контракт FXSystem.handleSlice:
 *   - звук разреза выбирается по типу меча (НЕ для бомбы);
 *   - уникальный визуальный эффект по event.swordType через Graphics + tweens;
 *   - микро screen-shake (camera.shake).
 *
 * ВАЖНО про Canvas: эффекты реализованы через Graphics + tweens, а НЕ через
 * Phaser ParticleEmitter (ненадёжно на Canvas renderer). Эти тесты подтверждают,
 * что на каждый slice создаются именно Graphics-объекты (scene.add.graphics) и
 * tweens, без вызова scene.add.particles.
 *
 * Цвета мечей (палитра CYBER):
 *   - forged:    cyan 0x00f0ff;
 *   - welding:   orange/yellow fire tints (0xff8a00, 0xffe24a, 0xff5a00);
 *   - plasma:    magenta 0xff2bd6 (+ белый core);
 *   - radiation: neon-green 0x39ff14.
 *
 * Scene stub содержит минимальные add.graphics / tweens.add / cameras.main.shake /
 * sound.play / game.registry / game.cache.audio — FXSystem вызывает их в try/catch.
 *
 * Изоляция: FXSystem хардкодит глобальный eventBus-синглтон, поэтому в afterEach
 * вызывается eventBus.shutdown() — подписки не накапливаются между тестами.
 */

/** Цвета мечей (продублированы из FXSystem для проверок без импорта приватных констант). */
const FORGED_CYAN = 0x00f0ff;
const PLASMA_MAGENTA = 0xff2bd6;
const RADIATION_GREEN = 0x39ff14;
const WELDING_FIRE_TINTS = [0xff8a00, 0xffe24a, 0xff5a00];

/** Состояние mock-сцены: счётчики вызовов FX и собранные цвета. */
interface SceneState {
  /** Кол-во созданных Graphics-объектов (scene.add.graphics). */
  graphicsCount: number;
  /** Кол-во уничтоженных Graphics (через tween onComplete в проде; в тестах — destroy). */
  destroyedCount: number;
  /** Кол-во запущенных tweens (scene.tweens.add). */
  tweenCount: number;
  /** Кол-во вызовов camera.shake. */
  shakeCount: number;
  /** Цвета, переданные в graphics.fillStyle (собираются для проверки палитры меча). */
  fillColors: number[];
  /** Цвета, переданные в graphics.lineStyle (молния/вспышка-линия). */
  lineColors: number[];
  /** Записи проигранных звуков {key, volume}. */
  soundPlays: Array<{ key: string; volume: number }>;
  /** Mute-флаг из game.registry 'ndt:mute'. */
  muted: boolean;
  /** Считается ли аудио-ассет присутствующим в cache. */
  audioExists: boolean;
  /** Эмуляция отсутствия add.graphics (для теста устойчивости). */
  graphicsThrow: boolean;
  /** Эмуляция throw в camera.shake (для теста устойчивости). */
  shakeThrow: boolean;
}

/**
 * Минимальный stub Phaser.Scene с add.graphics / tweens / cameras / sound /
 * game.registry / game.cache для FXSystem. Graphics-stub собирает переданные
 * цвета в state.fillColors / state.lineColors.
 */
function makeSceneStub(
  overrides: Partial<SceneState> = {},
): { scene: unknown; state: SceneState } {
  const state: SceneState = {
    graphicsCount: 0,
    destroyedCount: 0,
    tweenCount: 0,
    shakeCount: 0,
    fillColors: [],
    lineColors: [],
    soundPlays: [],
    muted: false,
    audioExists: true,
    graphicsThrow: false,
    shakeThrow: false,
    ...overrides,
  };

  /** Фабрика Graphics-stub: все методы рисования no-op, цвета собираются в state. */
  const makeGraphics = () => {
    if (state.graphicsThrow) {
      throw new Error('test: graphics missing');
    }
    state.graphicsCount++;
    return {
      fillStyle: (color: number) => {
        state.fillColors.push(color);
      },
      fillRect: () => {},
      lineStyle: (_width: number, color: number) => {
        state.lineColors.push(color);
      },
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      strokePath: () => {},
      strokeRect: () => {},
      setDepth: () => {},
      setVisible: () => {},
      destroy: () => {
        state.destroyedCount++;
      },
      x: 0,
      y: 0,
      alpha: 1,
      scale: 1,
    };
  };

  const scene = {
    add: { graphics: makeGraphics },
    tweens: {
      // В тестах tween не завершается мгновенно (эмуляция реального анимационного
      // tween) — просто считаем запуски. Graphics остаются «живыми» в mock-сцене.
      add: () => {
        state.tweenCount++;
      },
    },
    cameras: {
      main: {
        shake: () => {
          if (state.shakeThrow) {
            throw new Error('test: camera missing');
          }
          state.shakeCount++;
        },
      },
    },
    sound: {
      play: (key: string, opts: { volume: number }) => {
        state.soundPlays.push({ key, volume: opts.volume });
      },
    },
    game: {
      registry: {
        get: (k: string) => (k === 'ndt:mute' && state.muted ? true : undefined),
      },
      cache: { audio: { exists: () => state.audioExists } },
    },
  };

  return { scene, state };
}

/** Создаёт SliceEvent с минимумом нужных полей и заданным swordType. */
function makeSliceEvent(
  swordType: SwordType | null,
  isBomb = false,
): SliceEvent {
  return {
    id: 'test-1',
    timestamp: performance.now(),
    bodyId: 1,
    kind: isBomb ? 'pipe' : 'bolt',
    isBomb,
    slice: {
      from: { x: 0, y: 0 } as never,
      to: { x: 100, y: 0 } as never,
      angle: 0,
    },
    swordType,
    fragments: [],
  };
}

// Глобальный eventBus переиспользуется между тестами — очищаем подписки после каждого.
afterEach(() => {
  eventBus.shutdown();
});

describe('FXSystem / маршрутизация уникальных эффектов по swordType', () => {
  it('forged использует cyan палитру (fillStyle + lineStyle)', () => {
    const { scene, state } = makeSceneStub();
    new FXSystem(scene as never);
    eventBus.emit(EVENT.slice, makeSliceEvent('forged'));
    // 7 осколков нарисованы fillStyle(cyan).
    expect(state.fillColors).toContain(FORGED_CYAN);
    // Тонкая вспышка-линия вдоль среза нарисована lineStyle(cyan).
    expect(state.lineColors).toContain(FORGED_CYAN);
  });

  it('welding использует огненные orange/yellow tints', () => {
    const { scene, state } = makeSceneStub();
    new FXSystem(scene as never);
    eventBus.emit(EVENT.slice, makeSliceEvent('welding'));
    // Хотя бы один из fire-tints присутствует в fillStyle-цветах.
    const hasFireTint = state.fillColors.some((c) => WELDING_FIRE_TINTS.includes(c));
    expect(hasFireTint).toBe(true);
  });

  it('plasma использует magenta молнию (lineStyle) + magenta вспышки (fillStyle)', () => {
    const { scene, state } = makeSceneStub();
    new FXSystem(scene as never);
    eventBus.emit(EVENT.slice, makeSliceEvent('plasma'));
    // Magenta молния — lineStyle(PLASMA_MAGENTA).
    expect(state.lineColors).toContain(PLASMA_MAGENTA);
    // Magenta вспышки — fillStyle(PLASMA_MAGENTA).
    expect(state.fillColors).toContain(PLASMA_MAGENTA);
  });

  it('radiation использует neon-green палитру (fillStyle)', () => {
    const { scene, state } = makeSceneStub();
    new FXSystem(scene as never);
    eventBus.emit(EVENT.slice, makeSliceEvent('radiation'));
    expect(state.fillColors).toContain(RADIATION_GREEN);
  });

  it('swordType=null fallback на cyan-стиль (как forged)', () => {
    const { scene, state } = makeSceneStub();
    new FXSystem(scene as never);
    eventBus.emit(EVENT.slice, makeSliceEvent(null));
    expect(state.fillColors).toContain(FORGED_CYAN);
    expect(state.lineColors).toContain(FORGED_CYAN);
  });
});

describe('FXSystem / структура эффектов (количество Graphics + tweens)', () => {
  it('forged: 7 осколков + 1 линия = 8 Graphics, 8 tweens', () => {
    const { scene, state } = makeSceneStub();
    new FXSystem(scene as never);
    eventBus.emit(EVENT.slice, makeSliceEvent('forged'));
    expect(state.graphicsCount).toBe(8);
    expect(state.tweenCount).toBe(8);
  });

  it('welding: 12 искр + 4 языка пламени = 16 Graphics', () => {
    const { scene, state } = makeSceneStub();
    new FXSystem(scene as never);
    eventBus.emit(EVENT.slice, makeSliceEvent('welding'));
    expect(state.graphicsCount).toBe(16);
    expect(state.tweenCount).toBe(16);
  });

  it('plasma: 2 молнии (magenta + белый core) + 5 вспышек = 7 Graphics', () => {
    const { scene, state } = makeSceneStub();
    new FXSystem(scene as never);
    eventBus.emit(EVENT.slice, makeSliceEvent('plasma'));
    expect(state.graphicsCount).toBe(7);
    expect(state.tweenCount).toBe(7);
  });

  it('radiation: 1 glow + 9 капель = 10 Graphics', () => {
    const { scene, state } = makeSceneStub();
    new FXSystem(scene as never);
    eventBus.emit(EVENT.slice, makeSliceEvent('radiation'));
    expect(state.graphicsCount).toBe(10);
    expect(state.tweenCount).toBe(10);
  });

  it('эффекты используют ТОЛЬКО Graphics (scene.add.particles не задействован)', () => {
    // stub scene не имеет add.particles вовсе — если бы FXSystem его вызывал,
    // бросило бы TypeError и handleSlice упал бы (но он обёрнут в try/catch,
    // и shake/sound всё равно считаются). Проверяем, что Graphics создаются.
    const { scene, state } = makeSceneStub();
    new FXSystem(scene as never);
    eventBus.emit(EVENT.slice, makeSliceEvent('forged'));
    expect(state.graphicsCount).toBeGreaterThan(0);
    expect(state.shakeCount).toBe(1);
  });
});

describe('FXSystem / handleSlice общее поведение', () => {
  it('каждый slice вызывает микро screen-shake', () => {
    const { scene, state } = makeSceneStub();
    new FXSystem(scene as never);
    eventBus.emit(EVENT.slice, makeSliceEvent('forged'));
    expect(state.shakeCount).toBe(1);
  });

  it('slice разными мечами — shake вызывается каждый раз', () => {
    const { scene, state } = makeSceneStub();
    new FXSystem(scene as never);
    eventBus.emit(EVENT.slice, makeSliceEvent('forged'));
    eventBus.emit(EVENT.slice, makeSliceEvent('plasma'));
    eventBus.emit(EVENT.slice, makeSliceEvent('radiation'));
    expect(state.shakeCount).toBe(3);
  });

  it('bomb-slice (isBomb=true): звук разреза НЕ играется', () => {
    const { scene, state } = makeSceneStub();
    new FXSystem(scene as never);
    eventBus.emit(EVENT.slice, makeSliceEvent('forged', true));
    expect(state.soundPlays.length).toBe(0);
  });

  it('bomb-slice: FX (fallback forged) + shake всё равно отрабатывают', () => {
    const { scene, state } = makeSceneStub();
    new FXSystem(scene as never);
    eventBus.emit(EVENT.slice, makeSliceEvent('forged', true));
    // FX рисуется (cyan), shake трясёт — взрыв бомбы тоже «звучит» визуально.
    expect(state.graphicsCount).toBe(8);
    expect(state.shakeCount).toBe(1);
  });
});

describe('FXSystem / звук разреза по типу меча', () => {
  it('forged → slice-* (чистый разрез)', () => {
    const { scene, state } = makeSceneStub();
    new FXSystem(scene as never);
    eventBus.emit(EVENT.slice, makeSliceEvent('forged'));
    expect(state.soundPlays.length).toBe(1);
    expect(state.soundPlays[0].key.startsWith('slice-')).toBe(true);
  });

  it('welding → swipe-* (огненный свайп)', () => {
    const { scene, state } = makeSceneStub();
    new FXSystem(scene as never);
    eventBus.emit(EVENT.slice, makeSliceEvent('welding'));
    expect(state.soundPlays.length).toBe(1);
    expect(state.soundPlays[0].key.startsWith('swipe-')).toBe(true);
  });

  it('plasma → combo-* (электрический разряд)', () => {
    const { scene, state } = makeSceneStub();
    new FXSystem(scene as never);
    eventBus.emit(EVENT.slice, makeSliceEvent('plasma'));
    expect(state.soundPlays.length).toBe(1);
    expect(state.soundPlays[0].key.startsWith('combo')).toBe(true);
  });

  it('radiation → swipe-* (тяжёлый свайп)', () => {
    const { scene, state } = makeSceneStub();
    new FXSystem(scene as never);
    eventBus.emit(EVENT.slice, makeSliceEvent('radiation'));
    expect(state.soundPlays.length).toBe(1);
    expect(state.soundPlays[0].key.startsWith('swipe-')).toBe(true);
  });

  it('mute-флаг из registry глушит звук разреза', () => {
    const { scene, state } = makeSceneStub({ muted: true });
    new FXSystem(scene as never);
    eventBus.emit(EVENT.slice, makeSliceEvent('forged'));
    expect(state.soundPlays.length).toBe(0);
    // FX и shake не зависят от mute — игра не теряет juice.
    expect(state.graphicsCount).toBe(8);
    expect(state.shakeCount).toBe(1);
  });

  it('отсутствие аудио-ассета в cache → звук не играется', () => {
    const { scene, state } = makeSceneStub({ audioExists: false });
    new FXSystem(scene as never);
    eventBus.emit(EVENT.slice, makeSliceEvent('forged'));
    expect(state.soundPlays.length).toBe(0);
  });

  it('громкость звука разреза = 0.4', () => {
    const { scene, state } = makeSceneStub();
    new FXSystem(scene as never);
    eventBus.emit(EVENT.slice, makeSliceEvent('forged'));
    expect(state.soundPlays[0].volume).toBe(0.4);
  });
});

describe('FXSystem / destroy', () => {
  it('destroy отписывается — повторный slice не создаёт Graphics', () => {
    const { scene, state } = makeSceneStub();
    const sys = new FXSystem(scene as never);
    sys.destroy();

    eventBus.emit(EVENT.slice, makeSliceEvent('forged'));
    expect(state.graphicsCount).toBe(0);
    expect(state.shakeCount).toBe(0);
  });

  it('destroy идемпотентен', () => {
    const { scene } = makeSceneStub();
    const sys = new FXSystem(scene as never);
    expect(() => {
      sys.destroy();
      sys.destroy();
    }).not.toThrow();
  });

  it('slice после destroy не падает и не эмитит звук', () => {
    const { scene, state } = makeSceneStub();
    const sys = new FXSystem(scene as never);
    sys.destroy();

    expect(() => eventBus.emit(EVENT.slice, makeSliceEvent('plasma'))).not.toThrow();
    expect(state.soundPlays.length).toBe(0);
  });
});

describe('FXSystem / устойчивость FX к отсутствию scene-методов', () => {
  it('throw в scene.add.graphics → handleSlice не падает (try/catch в emitSwordFx)', () => {
    const { scene, state } = makeSceneStub({ graphicsThrow: true });
    new FXSystem(scene as never);
    // emitSwordFx обёрнут в try/catch — сбой Graphics гасится, не роняя handleSlice.
    expect(() => eventBus.emit(EVENT.slice, makeSliceEvent('forged'))).not.toThrow();
    // Звук и shake идут ДО/ПОСЛЕ FX независимо — shake должен был вызваться.
    expect(state.shakeCount).toBe(1);
    expect(state.soundPlays.length).toBe(1);
  });

  it('throw в camera.shake → handleSlice не падает (try/catch в shakeCamera)', () => {
    const { scene, state } = makeSceneStub({ shakeThrow: true });
    new FXSystem(scene as never);
    expect(() => eventBus.emit(EVENT.slice, makeSliceEvent('forged'))).not.toThrow();
    // FX и звук отработали, несмотря на throw в shake.
    expect(state.graphicsCount).toBe(8);
    expect(state.soundPlays.length).toBe(1);
  });
});
