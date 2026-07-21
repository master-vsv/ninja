import { describe, it, expect, vi } from 'vitest';
import { SliceSystem } from '../systems/SliceSystem';
import { TrailBuffer } from '../input/TrailBuffer';
import { EventBus } from '../events/EventBus';
import { EVENT } from '../events/types';
import type { SwordType } from '../events/types';
import type { SpawnDirector } from '../systems/SpawnDirector';
import type { BodySplitter, FragmentData } from '../systems/BodySplitter';

/**
 * Wiring-тесты SliceSystem (фаза 3).
 *
 * Цель: проверить тонкую Phaser-обёртку без реального Phaser.Game:
 *   - берёт последний сегмент из TrailBuffer;
 *   - итерирует getActiveBodies() из SpawnDirector;
 *   - при пересечении вызывает BodySplitter.sliceBody;
 *   - эмитит SliceEvent в EventBus;
 *   - обновляет SpawnDirector.removeSlicedBody.
 *
 * Стабы: scene не используется напрямую (только в типах), spawner/bodySplitter — mock'и.
 */

/** Минимальный ActiveBody из SpawnDirector. */
interface MockActiveBody {
  readonly bodyId: number;
  readonly kind: 'bolt' | 'nut' | 'ruler' | 'standard' | 'pipe';
  readonly isBomb: boolean;
  readonly body: {
    readonly id: number;
    readonly label: string;
    readonly vertices: ReadonlyArray<{ x: number; y: number }>;
    readonly position: { x: number; y: number };
  };
}

/** Создаёт квадратное тело в world-координатах с центром (cx, cy). */
function makeSquareBody(
  bodyId: number,
  cx: number,
  cy: number,
  halfSize: number,
  kind: MockActiveBody['kind'] = 'bolt',
  label = 'ndt-bolt',
): MockActiveBody {
  return {
    bodyId,
    kind,
    isBomb: kind === 'pipe',
    body: {
      id: bodyId,
      label,
      position: { x: cx, y: cy },
      vertices: [
        { x: cx - halfSize, y: cy - halfSize },
        { x: cx + halfSize, y: cy - halfSize },
        { x: cx + halfSize, y: cy + halfSize },
        { x: cx - halfSize, y: cy + halfSize },
      ],
    },
  };
}

/** Mock SpawnDirector с ручным управлением active bodies. */
function makeMockSpawner(initial: MockActiveBody[]): {
  // Структурный mock-тип: не привязываемся жёстко к SpawnDirector
  // (MockActiveBody без sprite достаточно — SliceSystem его не использует).
  spawner: {
    getActiveBodies: () => readonly MockActiveBody[];
    removeSlicedBody: (bodyId: number) => boolean;
    activeCount: number;
  };
  state: {
    removedBodyIds: number[];
  };
} {
  const state = { removedBodyIds: [] as number[] };
  const active = new Map<number, MockActiveBody>();
  for (const ab of initial) active.set(ab.bodyId, ab);

  return {
    spawner: {
      getActiveBodies: () => Array.from(active.values()),
      removeSlicedBody: (bodyId: number) => {
        if (!active.has(bodyId)) return false;
        active.delete(bodyId);
        state.removedBodyIds.push(bodyId);
        return true;
      },
      activeCount: active.size,
    },
    state,
  };
}

/** Mock BodySplitter: возвращает готовый набор фрагментов по флагам. */
function makeMockBodySplitter(
  returnFragments: boolean,
): Pick<BodySplitter, 'sliceBody'> & {
  state: { calls: number };
} {
  const state = { calls: 0 };
  return {
    sliceBody: vi.fn((_body, _line) => {
      state.calls++;
      if (!returnFragments) return null;
      const fragments: FragmentData[] = [
        {
          vertices: [
            { x: -5, y: -5 },
            { x: 5, y: -5 },
            { x: 5, y: 0 },
            { x: -5, y: 0 },
          ],
          velocity: { x: 0, y: 3.5 },
        },
        {
          vertices: [
            { x: -5, y: 0 },
            { x: 5, y: 0 },
            { x: 5, y: 5 },
            { x: -5, y: 5 },
          ],
          velocity: { x: 0, y: -3.5 },
        },
      ];
      return fragments;
    }) as unknown as BodySplitter['sliceBody'],
    state,
  };
}

/** Создаёт SliceSystem с mock'ами. */
function makeSliceSystem(opts: {
  trail: TrailBuffer;
  spawner: ReturnType<typeof makeMockSpawner>['spawner'];
  bodySplitter: ReturnType<typeof makeMockBodySplitter>;
  eventBus: EventBus;
}): SliceSystem {
  // scene не используется SliceSystem напрямую — передаём unknown-каст.
  return new SliceSystem({ events: undefined } as never, {
    trail: opts.trail,
    spawner: opts.spawner as unknown as SpawnDirector,
    bodySplitter: opts.bodySplitter as unknown as BodySplitter,
    eventBus: opts.eventBus,
  });
}

describe('SliceSystem', () => {
  it('не эмитит SliceEvent при пустом trail', () => {
    const trail = new TrailBuffer(10);
    const spawner = makeMockSpawner([makeSquareBody(1, 0, 0, 5)]);
    const splitter = makeMockBodySplitter(true);
    const bus = new EventBus();
    let emitCount = 0;
    bus.on(EVENT.slice, () => emitCount++);
    const sys = makeSliceSystem({ trail, spawner: spawner.spawner, bodySplitter: splitter, eventBus: bus });

    sys.update();

    expect(emitCount).toBe(0);
    expect(splitter.state.calls).toBe(0);
  });

  it('не эмитит при пересечении, если BodySplitter вернул null', () => {
    const trail = new TrailBuffer(10);
    trail.addPoint(-100, 0, 0);
    trail.addPoint(100, 0, 1);
    const spawner = makeMockSpawner([makeSquareBody(1, 0, 0, 5)]);
    const splitter = makeMockBodySplitter(false); // возвращает null
    const bus = new EventBus();
    let emitCount = 0;
    bus.on(EVENT.slice, () => emitCount++);
    const sys = makeSliceSystem({ trail, spawner: spawner.spawner, bodySplitter: splitter, eventBus: bus });

    sys.update();

    expect(splitter.state.calls).toBe(1); // вызван, но разрез не удался
    expect(emitCount).toBe(0);
    expect(spawner.state.removedBodyIds).toEqual([]); // тело не удалено
  });

  it('эмитит SliceEvent при пересечении и удаляет тело из spawner', () => {
    const trail = new TrailBuffer(10);
    trail.addPoint(-100, 0, 0);
    trail.addPoint(100, 0, 1);
    const spawner = makeMockSpawner([makeSquareBody(42, 0, 0, 5)]);
    const splitter = makeMockBodySplitter(true);
    const bus = new EventBus();
    const emitted: unknown[] = [];
    bus.on(EVENT.slice, (e) => emitted.push(e));
    const sys = makeSliceSystem({ trail, spawner: spawner.spawner, bodySplitter: splitter, eventBus: bus });

    sys.update();

    expect(emitted.length).toBe(1);
    expect(splitter.state.calls).toBe(1);
    expect(spawner.state.removedBodyIds).toEqual([42]);
    const ev = emitted[0] as { bodyId: number; kind: string; fragments: unknown[] };
    expect(ev.bodyId).toBe(42);
    expect(ev.kind).toBe('bolt');
    expect(ev.fragments.length).toBe(2);
  });

  it('не режет один и тот же объект дважды за кадр', () => {
    const trail = new TrailBuffer(10);
    trail.addPoint(-100, 0, 0);
    trail.addPoint(100, 0, 1);
    // Тот же bodyId дважды в active — защита от дублирования.
    const spawner = makeMockSpawner([makeSquareBody(7, 0, 0, 5), makeSquareBody(7, 0, 0, 5)]);
    const splitter = makeMockBodySplitter(true);
    const bus = new EventBus();
    let emitCount = 0;
    bus.on(EVENT.slice, () => emitCount++);
    const sys = makeSliceSystem({ trail, spawner: spawner.spawner, bodySplitter: splitter, eventBus: bus });

    sys.update();

    expect(emitCount).toBe(1);
    expect(splitter.state.calls).toBe(1);
  });

  it('пропускает тела с label фрагмента', () => {
    const trail = new TrailBuffer(10);
    trail.addPoint(-100, 0, 0);
    trail.addPoint(100, 0, 1);
    const fragmentLike = makeSquareBody(1, 0, 0, 5, 'bolt', 'ndt-fragment');
    // normal в зоне свайпа (-100..100), чтобы разрезался; fragment пропускается по label.
    const normal = makeSquareBody(2, 50, 0, 5);
    const spawner = makeMockSpawner([fragmentLike, normal]);
    const splitter = makeMockBodySplitter(true);
    const bus = new EventBus();
    const emitted: unknown[] = [];
    bus.on(EVENT.slice, (e) => emitted.push(e));
    const sys = makeSliceSystem({ trail, spawner: spawner.spawner, bodySplitter: splitter, eventBus: bus });

    sys.update();

    // Только нормальный объект разрезан (с индексом 2). Фрагмент пропущен.
    expect(emitted.length).toBe(1);
    const ev = emitted[0] as { bodyId: number };
    expect(ev.bodyId).toBe(2);
  });

  it('не эмитит для нулевой длины свайпа (< 1px)', () => {
    const trail = new TrailBuffer(10);
    trail.addPoint(50, 50, 0);
    trail.addPoint(50.2, 50.1, 1); // очень короткий
    const spawner = makeMockSpawner([makeSquareBody(1, 50, 50, 5)]);
    const splitter = makeMockBodySplitter(true);
    const bus = new EventBus();
    let emitCount = 0;
    bus.on(EVENT.slice, () => emitCount++);
    const sys = makeSliceSystem({ trail, spawner: spawner.spawner, bodySplitter: splitter, eventBus: bus });

    sys.update();

    expect(emitCount).toBe(0);
  });

  it('игнорирует тело, не пересекающееся со свайпом', () => {
    const trail = new TrailBuffer(10);
    trail.addPoint(0, 0, 0);
    trail.addPoint(10, 0, 1);
    const spawner = makeMockSpawner([makeSquareBody(99, 500, 500, 5)]); // далеко
    const splitter = makeMockBodySplitter(true);
    const bus = new EventBus();
    let emitCount = 0;
    bus.on(EVENT.slice, () => emitCount++);
    const sys = makeSliceSystem({ trail, spawner: spawner.spawner, bodySplitter: splitter, eventBus: bus });

    sys.update();

    expect(emitCount).toBe(0);
    expect(splitter.state.calls).toBe(0);
  });

  it('destroy идемпотентен и не падает при повторном вызове', () => {
    const trail = new TrailBuffer(10);
    const spawner = makeMockSpawner([]);
    const splitter = makeMockBodySplitter(true);
    const bus = new EventBus();
    const sys = makeSliceSystem({ trail, spawner: spawner.spawner, bodySplitter: splitter, eventBus: bus });
    expect(() => {
      sys.destroy();
      sys.destroy();
    }).not.toThrow();
  });

  it('обрабатывает несколько объектов одним свайпом', () => {
    const trail = new TrailBuffer(10);
    // Свайп через оба тела на y=0.
    trail.addPoint(-100, 0, 0);
    trail.addPoint(500, 0, 1);
    const spawner = makeMockSpawner([
      makeSquareBody(1, -50, 0, 10),
      makeSquareBody(2, 50, 0, 10),
    ]);
    const splitter = makeMockBodySplitter(true);
    const bus = new EventBus();
    const emitted: unknown[] = [];
    bus.on(EVENT.slice, (e) => emitted.push(e));
    const sys = makeSliceSystem({ trail, spawner: spawner.spawner, bodySplitter: splitter, eventBus: bus });

    sys.update();

    expect(emitted.length).toBe(2);
    expect(spawner.state.removedBodyIds.sort((a, b) => a - b)).toEqual([1, 2]);
  });
});

/**
 * Расширения фазы 5 (БЕЗ ослабления существующих тестов):
 *   - getMaxTargets() — лимит целей за свайп (plasma=3, forged=1);
 *   - getSwordType() — подстановка активного меча в SliceEvent.swordType.
 */
describe('SliceSystem / фаза 5: maxTargets (лимит целей за свайп)', () => {
  /** Создаёт SliceSystem с провайдером лимита целей. */
  function makeWithMaxTargets(opts: {
    trail: TrailBuffer;
    spawner: ReturnType<typeof makeMockSpawner>['spawner'];
    bodySplitter: ReturnType<typeof makeMockBodySplitter>;
    eventBus: EventBus;
    getMaxTargets: () => number;
  }): SliceSystem {
    return new SliceSystem({ events: undefined } as never, {
      trail: opts.trail,
      spawner: opts.spawner as unknown as SpawnDirector,
      bodySplitter: opts.bodySplitter as unknown as BodySplitter,
      eventBus: opts.eventBus,
      getMaxTargets: opts.getMaxTargets,
    });
  }

  it('maxTargets=1 — режет только первый пересечённый объект (forged-поведение)', () => {
    const trail = new TrailBuffer(10);
    trail.addPoint(-100, 0, 0);
    trail.addPoint(500, 0, 1);
    const spawner = makeMockSpawner([
      makeSquareBody(1, -50, 0, 10),
      makeSquareBody(2, 50, 0, 10),
    ]);
    const splitter = makeMockBodySplitter(true);
    const bus = new EventBus();
    const emitted: unknown[] = [];
    bus.on(EVENT.slice, (e) => emitted.push(e));
    const sys = makeWithMaxTargets({
      trail,
      spawner: spawner.spawner,
      bodySplitter: splitter,
      eventBus: bus,
      getMaxTargets: () => 1,
    });

    sys.update();

    // Только 1 разрез (первый пересечённый), второй объект не тронут.
    expect(emitted.length).toBe(1);
    expect(splitter.state.calls).toBe(1);
    // Второй объект остался в active (не удалён).
    expect(spawner.state.removedBodyIds.length).toBe(1);
  });

  it('maxTargets=3 — режет до 3 объектов, но не больше (plasma-поведение)', () => {
    const trail = new TrailBuffer(10);
    trail.addPoint(-100, 0, 0);
    trail.addPoint(1000, 0, 1);
    // 4 тела в линию.
    const spawner = makeMockSpawner([
      makeSquareBody(1, 0, 0, 10),
      makeSquareBody(2, 100, 0, 10),
      makeSquareBody(3, 200, 0, 10),
      makeSquareBody(4, 300, 0, 10),
    ]);
    const splitter = makeMockBodySplitter(true);
    const bus = new EventBus();
    const emitted: unknown[] = [];
    bus.on(EVENT.slice, (e) => emitted.push(e));
    const sys = makeWithMaxTargets({
      trail,
      spawner: spawner.spawner,
      bodySplitter: splitter,
      eventBus: bus,
      getMaxTargets: () => 3,
    });

    sys.update();

    // Ровно 3 разреза (lim plasma), 4-й объект не тронут.
    expect(emitted.length).toBe(3);
    expect(splitter.state.calls).toBe(3);
    expect(spawner.state.removedBodyIds.length).toBe(3);
  });

  it('maxTargets больше, чем активных тел — режет все доступные', () => {
    const trail = new TrailBuffer(10);
    trail.addPoint(-100, 0, 0);
    trail.addPoint(500, 0, 1);
    const spawner = makeMockSpawner([
      makeSquareBody(1, -50, 0, 10),
      makeSquareBody(2, 50, 0, 10),
    ]);
    const splitter = makeMockBodySplitter(true);
    const bus = new EventBus();
    let emitCount = 0;
    bus.on(EVENT.slice, () => emitCount++);
    const sys = makeWithMaxTargets({
      trail,
      spawner: spawner.spawner,
      bodySplitter: splitter,
      eventBus: bus,
      getMaxTargets: () => 10,
    });

    sys.update();

    expect(emitCount).toBe(2);
  });

  it('maxTargets=0 или отрицательный — без лимита (fallback к Infinity)', () => {
    const trail = new TrailBuffer(10);
    trail.addPoint(-100, 0, 0);
    trail.addPoint(500, 0, 1);
    const spawner = makeMockSpawner([
      makeSquareBody(1, -50, 0, 10),
      makeSquareBody(2, 50, 0, 10),
    ]);
    const splitter = makeMockBodySplitter(true);
    const bus = new EventBus();
    let emitCount = 0;
    bus.on(EVENT.slice, () => emitCount++);
    const sys = makeWithMaxTargets({
      trail,
      spawner: spawner.spawner,
      bodySplitter: splitter,
      eventBus: bus,
      getMaxTargets: () => 0,
    });

    sys.update();

    // 0 трактуется как «без лимита» — режет все доступные.
    expect(emitCount).toBe(2);
  });

  it('maxTargets считает только успешные разрезы (не промахи)', () => {
    const trail = new TrailBuffer(10);
    trail.addPoint(-100, 0, 0);
    trail.addPoint(1000, 0, 1);
    const spawner = makeMockSpawner([
      makeSquareBody(1, 0, 0, 10),
      // Тело №2 далеко — свайп его не заденет (промах).
      makeSquareBody(2, 5000, 5000, 10),
      makeSquareBody(3, 100, 0, 10),
    ]);
    const splitter = makeMockBodySplitter(true);
    const bus = new EventBus();
    const emitted: unknown[] = [];
    bus.on(EVENT.slice, (e) => emitted.push(e));
    const sys = makeWithMaxTargets({
      trail,
      spawner: spawner.spawner,
      bodySplitter: splitter,
      eventBus: bus,
      getMaxTargets: () => 2,
    });

    sys.update();

    // Тело 2 не задето (промах) — должно было бы попасть в лимит, но не попало.
    // Тела 1 и 3 разрезаны (всего 2 — в рамках лимита).
    expect(emitted.length).toBe(2);
    expect(splitter.state.calls).toBe(2);
  });
});

describe('SliceSystem / фаза 5: getSwordType (заполнение swordType)', () => {
  /** Создаёт SliceSystem с провайдером активного меча. */
  function makeWithSwordType(opts: {
    trail: TrailBuffer;
    spawner: ReturnType<typeof makeMockSpawner>['spawner'];
    bodySplitter: ReturnType<typeof makeMockBodySplitter>;
    eventBus: EventBus;
    getSwordType: () => SwordType | null;
  }): SliceSystem {
    return new SliceSystem({ events: undefined } as never, {
      trail: opts.trail,
      spawner: opts.spawner as unknown as SpawnDirector,
      bodySplitter: opts.bodySplitter as unknown as BodySplitter,
      eventBus: opts.eventBus,
      getSwordType: opts.getSwordType,
    });
  }

  it('без getSwordType — swordType=null в событии (обратная совместимость)', () => {
    const trail = new TrailBuffer(10);
    trail.addPoint(-100, 0, 0);
    trail.addPoint(100, 0, 1);
    const spawner = makeMockSpawner([makeSquareBody(1, 0, 0, 5)]);
    const splitter = makeMockBodySplitter(true);
    const bus = new EventBus();
    const emitted: unknown[] = [];
    bus.on(EVENT.slice, (e) => emitted.push(e));
    const sys = makeSliceSystem({
      trail,
      spawner: spawner.spawner,
      bodySplitter: splitter,
      eventBus: bus,
    });

    sys.update();

    const ev = emitted[0] as { swordType: string | null };
    expect(ev.swordType).toBeNull();
  });

  it('getSwordType возвращает plasma → swordType="plasma" в событии', () => {
    const trail = new TrailBuffer(10);
    trail.addPoint(-100, 0, 0);
    trail.addPoint(100, 0, 1);
    const spawner = makeMockSpawner([makeSquareBody(1, 0, 0, 5)]);
    const splitter = makeMockBodySplitter(true);
    const bus = new EventBus();
    const emitted: unknown[] = [];
    bus.on(EVENT.slice, (e) => emitted.push(e));
    const sys = makeWithSwordType({
      trail,
      spawner: spawner.spawner,
      bodySplitter: splitter,
      eventBus: bus,
      getSwordType: () => 'plasma',
    });

    sys.update();

    const ev = emitted[0] as { swordType: string | null };
    expect(ev.swordType).toBe('plasma');
  });

  it('getSwordType возвращает radiation → swordType="radiation"', () => {
    const trail = new TrailBuffer(10);
    trail.addPoint(-100, 0, 0);
    trail.addPoint(100, 0, 1);
    const spawner = makeMockSpawner([makeSquareBody(1, 0, 0, 5)]);
    const splitter = makeMockBodySplitter(true);
    const bus = new EventBus();
    const emitted: unknown[] = [];
    bus.on(EVENT.slice, (e) => emitted.push(e));
    const sys = makeWithSwordType({
      trail,
      spawner: spawner.spawner,
      bodySplitter: splitter,
      eventBus: bus,
      getSwordType: () => 'radiation',
    });

    sys.update();

    const ev = emitted[0] as { swordType: string | null };
    expect(ev.swordType).toBe('radiation');
  });

  it('getSwordType и getMaxTargets комбинируются (plasma: меч + лимит 3)', () => {
    const trail = new TrailBuffer(10);
    trail.addPoint(-100, 0, 0);
    trail.addPoint(1000, 0, 1);
    const spawner = makeMockSpawner([
      makeSquareBody(1, 0, 0, 10),
      makeSquareBody(2, 100, 0, 10),
      makeSquareBody(3, 200, 0, 10),
      makeSquareBody(4, 300, 0, 10),
    ]);
    const splitter = makeMockBodySplitter(true);
    const bus = new EventBus();
    const emitted: unknown[] = [];
    bus.on(EVENT.slice, (e) => emitted.push(e));
    const sys = new SliceSystem({ events: undefined } as never, {
      trail,
      spawner: spawner.spawner as unknown as SpawnDirector,
      bodySplitter: splitter as unknown as BodySplitter,
      eventBus: bus,
      getMaxTargets: () => 3,
      getSwordType: () => 'plasma',
    });

    sys.update();

    // 3 разреза (plasma лимит) + все с swordType='plasma'.
    expect(emitted.length).toBe(3);
    for (const e of emitted) {
      expect((e as { swordType: string }).swordType).toBe('plasma');
    }
  });
});
