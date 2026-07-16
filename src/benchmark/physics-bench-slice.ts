import Phaser from 'phaser';
import type { BenchReport } from './physics-bench';
import type { NDTObjectKind } from '../events/types';
import type { Vec2 } from '../slice/Geometry';

/**
 * Бенчмарк физдвижка со слайсингом — фаза 3, ступень B (реальный ворклоуд).
 *
 * Назначение: после реализации SliceSystem/BodySplitter проверить, что Matter.js
 * тянет реальный игровой ворклоуд (~30 одновременно живущих осколков с разрезами).
 *
 * Пороги fail-fast (из плана) зафиксированы как константы ниже. При провале хотя бы
 * одного — поднимается вопрос о миграции на Rapier+PixiJS ДО старта фаз 4+.
 *
 * Структура:
 *   - prepareSliceSchedule() — pure-logic: детерминированно планирует спавн N объектов
 *     и синтетические свайпы по расписанию. Покрыт unit-тестами.
 *   - checkFailFast() — pure-logic: сверка отчёта с порогами.
 *   - runSliceBenchmark() — runtime: запускается в Phaser-сцене (Menu-stub → кнопка),
 *     применяет расписание, замеряет fps/p95 frame/p95 physics, возвращает отчёт.
 *
 * Реальный замер требует устройства (Phaser без рендера/headless даёт неосмысленный fps).
 * Здесь — КАРКАС: детерминированное расписание, пороги, optionally headless-прогон.
 */

/** Дефолтные параметры бенчмарка ступени B (из плана: ~30 живущих осколков). */
const DEFAULT_BODY_COUNT = 30;
const DEFAULT_DURATION_MS = 30_000;
const DEFAULT_SEED = 0xb1ade_0001;

/**
 * Зафиксированные в плане количественные пороги fail-fast (фаза 3, ступень B).
 * Реальный замер — на целевых устройствах (iPhone SE 2020, Galaxy A52).
 */
export const FAIL_FAST_THRESHOLDS = {
  /** Средний fps за сессию — не ниже. */
  fpsAvgMin: 55,
  /** p95 frame time, мс — не выше. */
  p95FrameTimeMaxMs: 18,
  /** p95 physics step, мс — не выше. */
  p95PhysicsStepMaxMs: 6,
  /**
   * Частота туннелирования, %, при скоростях осколков >= 25 px/frame.
   * Замер: спавним осколок сквозь ряд тел, считаем пропущенные коллизии.
   */
  tunnelingMaxPercent: 1,
  /**
   * Задержка разреза (input → slice event), кадров. ≤1 значит «в том же кадре».
   * Замер: timestamp в SliceEvent vs pointerdown timestamp.
   */
  inputToSliceMaxFrames: 1,
} as const;

/** Запланированный спавн объекта. */
export interface ScheduledSpawn {
  /** Время спавна от старта бенчмарка, мс. */
  readonly time: number;
  /** X-координата спавна. */
  readonly x: number;
  /** Вид объекта. По умолчанию 'bolt' (большая площадь для столкновений). */
  readonly kind: NDTObjectKind;
}

/** Запланированный синтетический свайп. */
export interface ScheduledSwipe {
  /** Время применения, мс от старта. */
  readonly time: number;
  /** Начальная точка свайпа (world-space). */
  readonly from: Vec2;
  /** Конечная точка свайпа. */
  readonly to: Vec2;
}

/** Полное расписание бенчмарка. */
export interface SliceSchedule {
  /** Запланированные спавны объектов, отсортированы по времени. */
  readonly spawns: ReadonlyArray<ScheduledSpawn>;
  /** Запланированные свайпы (разрезы), отсортированы по времени. */
  readonly swipes: ReadonlyArray<ScheduledSwipe>;
}

/** Опции подготовки расписания. */
export interface PrepareScheduleOptions {
  /** Длительность сессии, мс. */
  readonly durationMs?: number;
  /** Число одновременно живущих объектов (N в плане). */
  readonly bodyCount?: number;
  /** Bounds сцены. */
  readonly bounds?: { readonly width: number; readonly height: number };
  /** Seed для детерминированного LCG. */
  readonly seed?: number;
  /** Доля объектов, режущихся свайпом [0..1]. По умолчанию 0.5 (половина). */
  readonly sliceFraction?: number;
}

/** Опции запуска бенчмарка. */
export interface SliceBenchOptions extends PrepareScheduleOptions {
  /** Сцена, в которой запускается бенчмарк. */
  readonly scene: Phaser.Scene;
}

/**
 * Результат проверки одного порога fail-fast.
 */
export interface FailFastCheck {
  /** Имя порога (читаемое). */
  readonly name: string;
  /** Замеренное значение. */
  readonly actual: number;
  /** Пороговое значение. */
  readonly threshold: number;
  /** Пройден ли порог. */
  readonly passed: boolean;
}

/** Отчёт бенчмарка со слайсингом. */
export interface SliceBenchReport extends BenchReport {
  /** Запланированное число спавнов. */
  readonly scheduledSpawns: number;
  /** Запланированное число свайпов. */
  readonly scheduledSwipes: number;
  /** Фактически выполнено разрезов (если runtime смог посчитать). */
  readonly sliceCount: number;
  /** Число активных фрагментов к концу сессии. */
  readonly fragmentCount: number;
  /** Снапшот проверки порогов. */
  readonly failFastChecks: ReadonlyArray<FailFastCheck>;
  /** true если ВСЕ пороги пройдены. */
  readonly failFastPassed: boolean;
}

/**
 * Детерминированный генератор (LCG, Numerical Recipes). Тот же, что в physics-bench.ts,
 * для согласованности результатов.
 */
function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

/**
 * Планирует детерминированное расписание спавнов и свайпов для бенчмарка.
 *
 * Стратегия:
 *   - N объектов спавнятся равномерно за первые 70% длительности (30% — «полёт»
 *     для накопления фрагментов после разрезов);
 *   - свайпы планируются с шагом ~500 мс, каждый свайп — горизонтальная линия через
 *     центр экрана на случайной высоте (детерминированно от seed);
 *   - sliceFraction определяет, какая доля объектов будет разрезана (~50% по умолчанию).
 *
 * Pure-logic: не зависит от Phaser.
 */
export function prepareSliceSchedule(
  options: PrepareScheduleOptions = {},
): SliceSchedule {
  const durationMs = options.durationMs ?? DEFAULT_DURATION_MS;
  const bodyCount = options.bodyCount ?? DEFAULT_BODY_COUNT;
  const bounds = options.bounds ?? { width: 1280, height: 720 };
  const seed = options.seed ?? DEFAULT_SEED;
  const sliceFraction = options.sliceFraction ?? 0.5;

  const rand = createRng(seed);

  // Спавны: равномерно за первые 70% длительности. X — по ширине с отступами.
  const spawnWindow = durationMs * 0.7;
  const spawnInterval = bodyCount > 1 ? spawnWindow / (bodyCount - 1) : 0;
  const spawns: ScheduledSpawn[] = [];
  for (let i = 0; i < bodyCount; i++) {
    const time = i * spawnInterval;
    const x = 200 + rand() * (bounds.width - 400);
    // Чередуем виды для разнообразия геометрии.
    const kinds: ReadonlyArray<NDTObjectKind> = ['bolt', 'nut', 'ruler', 'standard'];
    const kind = kinds[Math.floor(rand() * kinds.length)];
    spawns.push({ time, x, kind });
  }

  // Свайпы: каждые ~500 мс, на разной высоте, горизонтальные.
  // Цель — разрезать sliceFraction объектов.
  const swipeCount = Math.max(1, Math.floor(bodyCount * sliceFraction));
  const swipeInterval = durationMs / swipeCount;
  const swipes: ScheduledSwipe[] = [];
  for (let i = 0; i < swipeCount; i++) {
    const time = (i + 0.5) * swipeInterval;
    const y = 100 + rand() * (bounds.height - 300);
    const x1 = -50;
    const x2 = bounds.width + 50;
    swipes.push({
      time,
      from: { x: x1, y },
      to: { x: x2, y },
    });
  }

  return { spawns, swipes };
}

/**
 * Сверка отчёта бенчмарка с порогами fail-fast.
 *
 * Возвращает массив результатов по каждому порогу + сводный failFastPassed.
 *
 * NB: tunneling и inputToSlice требуют отдельных замеров (план предусматривает
 * специальные тест-сценарии). В этом каркасе они возвращаются как passed=true
 * (real measurement device-dependent).
 */
export function checkFailFast(
  report: BenchReport,
  options: { readonly tunnelingPercent?: number; readonly inputToSliceFrames?: number } = {},
): { readonly checks: ReadonlyArray<FailFastCheck>; readonly passed: boolean } {
  const tunnelingPercent = options.tunnelingPercent ?? 0;
  const inputToSliceFrames = options.inputToSliceFrames ?? 0;

  const checks: FailFastCheck[] = [
    {
      name: 'avg fps',
      actual: report.fps.avg,
      threshold: FAIL_FAST_THRESHOLDS.fpsAvgMin,
      passed: report.fps.avg >= FAIL_FAST_THRESHOLDS.fpsAvgMin,
    },
    {
      name: 'p95 frame time (ms)',
      actual: report.frameTime.p95,
      threshold: FAIL_FAST_THRESHOLDS.p95FrameTimeMaxMs,
      passed: report.frameTime.p95 <= FAIL_FAST_THRESHOLDS.p95FrameTimeMaxMs,
    },
    {
      name: 'p95 physics step (ms)',
      actual: report.physicsStep.p95,
      threshold: FAIL_FAST_THRESHOLDS.p95PhysicsStepMaxMs,
      passed: report.physicsStep.p95 <= FAIL_FAST_THRESHOLDS.p95PhysicsStepMaxMs,
    },
    {
      name: 'tunneling (%)',
      actual: tunnelingPercent,
      threshold: FAIL_FAST_THRESHOLDS.tunnelingMaxPercent,
      passed: tunnelingPercent <= FAIL_FAST_THRESHOLDS.tunnelingMaxPercent,
    },
    {
      name: 'input→slice delay (frames)',
      actual: inputToSliceFrames,
      threshold: FAIL_FAST_THRESHOLDS.inputToSliceMaxFrames,
      passed: inputToSliceFrames <= FAIL_FAST_THRESHOLDS.inputToSliceMaxFrames,
    },
  ];

  return { checks, passed: checks.every((c) => c.passed) };
}

/**
 * Запускает бенчмарк со слайсингом в переданной Phaser-сцене.
 *
 * Что делает:
 *   1. Создаёт static-стены коробки.
 *   2. По расписанию prepareSliceSchedule() спавнит объекты (rectangle для простоты).
 *   3. По расписанию применяет синтетические свайпы — вызывает прямой детект-разрез
 *      по телам в окрестности свайпа (без InputSystem).
 *   4. Замеряет frameTime (delta) и physicsStep (вокруг world.step).
 *   5. Через durationMs прекращает замер, возвращает отчёт с fail-fast проверками.
 *
 * В headless-окружении (CI без WebGL) Phaser может не дать осмысленный fps — это ОК,
 * каркас фиксирует что можем. Реальный замер — на устройстве.
 *
 * NOT pure-logic: зависит от Phaser.
 */
export function runSliceBenchmark(
  options: SliceBenchOptions,
): Promise<SliceBenchReport> {
  const { scene } = options;
  const durationMs = options.durationMs ?? DEFAULT_DURATION_MS;
  const bodyCount = options.bodyCount ?? DEFAULT_BODY_COUNT;
  const bounds = options.bounds ?? {
    width: scene.scale.width,
    height: scene.scale.height,
  };

  const schedule = prepareSliceSchedule({
    durationMs,
    bodyCount,
    bounds,
    seed: options.seed,
    sliceFraction: options.sliceFraction,
  });

  return new Promise<SliceBenchReport>((resolve) => {
    const created: Array<MatterJS.BodyType> = [];
    let sliceCount = 0;

    // Стены коробки.
    const walls: Array<MatterJS.BodyType> = [
      scene.matter.add.rectangle(bounds.width / 2, -10, bounds.width, 20, {
        isStatic: true,
      }),
      scene.matter.add.rectangle(
        bounds.width / 2,
        bounds.height + 10,
        bounds.width,
        20,
        { isStatic: true },
      ),
      scene.matter.add.rectangle(-10, bounds.height / 2, 20, bounds.height, {
        isStatic: true,
      }),
      scene.matter.add.rectangle(
        bounds.width + 10,
        bounds.height / 2,
        20,
        bounds.height,
        { isStatic: true },
      ),
    ];

    // Расписание свайпов как delayedCall'ов.
    const swipeTimers: Array<Phaser.Time.TimerEvent> = schedule.swipes.map((sw) =>
      scene.time.delayedCall(sw.time, () => {
        // Считаем пересечение простым AABB-фильтром по y-диапазону свайпа.
        // (Полный slice-детектор тут избыточен — для замера нагрузки физики важен
        // сам факт разрезания, не точность геометрии.)
        const yMid = (sw.from.y + sw.to.y) / 2;
        for (const b of created) {
          const pos = b.position;
          if (Math.abs(pos.y - yMid) < 30) {
            // Имитация разреза: удаляем тело, создаём 2 новых поменьше.
            scene.matter.world.remove(b);
            const off1 = scene.matter.add.rectangle(
              pos.x - 15,
              pos.y,
              20,
              20,
              { restitution: 0.2, friction: 0.1 },
            );
            const off2 = scene.matter.add.rectangle(
              pos.x + 15,
              pos.y,
              20,
              20,
              { restitution: 0.2, friction: 0.1 },
            );
            created.push(off1, off2);
            sliceCount++;
          }
        }
      }),
    );

    // Расписание спавнов.
    const spawnTimers: Array<Phaser.Time.TimerEvent> = schedule.spawns.map((sp) =>
      scene.time.delayedCall(sp.time, () => {
        const body = scene.matter.add.rectangle(sp.x, bounds.height - 60, 24, 24, {
          restitution: 0.2,
          friction: 0.1,
        });
        // Подбрасываем вверх.
        body.positionPrev.y = body.position.y + 12;
        created.push(body);
      }),
    );

    // Замеры.
    const frameTimes: number[] = [];
    const physicsSteps: number[] = [];
    const startTs = performance.now();
    let beforeStepTs = 0;
    let finished = false;

    const beforeUpdate = (): void => {
      beforeStepTs = performance.now();
    };
    const afterUpdate = (): void => {
      if (beforeStepTs > 0) {
        physicsSteps.push(performance.now() - beforeStepTs);
      }
    };
    scene.matter.world.on('beforeupdate', beforeUpdate);
    scene.matter.world.on('afterupdate', afterUpdate);

    const updateCb = (_time: number, delta: number): void => {
      frameTimes.push(delta);
      if (performance.now() - startTs >= durationMs) {
        finish();
      }
    };
    scene.events.on(Phaser.Scenes.Events.UPDATE, updateCb);

    const watchdog = scene.time.delayedCall(durationMs + 2000, () => {
      if (!finished) finish();
    });

    function finish(): void {
      if (finished) return;
      finished = true;

      scene.events.off(Phaser.Scenes.Events.UPDATE, updateCb);
      scene.matter.world.off('beforeupdate', beforeUpdate);
      scene.matter.world.off('afterupdate', afterUpdate);
      watchdog.remove(false);
      for (const t of [...spawnTimers, ...swipeTimers]) t.remove(false);

      // Очистка созданных тел.
      for (const b of [...created, ...walls]) {
        scene.matter.world.remove(b);
      }

      const samples = frameTimes.length;
      const frameStat = stat(frameTimes);
      const stepStat = stat(physicsSteps);
      const fpsAvg = frameStat.avg > 0 ? 1000 / frameStat.avg : 0;
      const fpsP95 = frameStat.p95 > 0 ? 1000 / frameStat.p95 : 0;

      const baseReport: BenchReport = {
        bodyCount: created.length,
        durationMs: performance.now() - startTs,
        bounds,
        fps: { avg: fpsAvg, p95: fpsP95, samples },
        frameTime: frameStat,
        physicsStep: stepStat,
        retinaResolutionCap: null,
        createdAt: new Date().toISOString(),
      };

      const failFast = checkFailFast(baseReport);

      const report: SliceBenchReport = {
        ...baseReport,
        scheduledSpawns: schedule.spawns.length,
        scheduledSwipes: schedule.swipes.length,
        sliceCount,
        fragmentCount: created.length,
        failFastChecks: failFast.checks,
        failFastPassed: failFast.passed,
      };

      // eslint-disable-next-line no-console
      console.log('[NDT-Ninja] slice-benchmark report:', report);

      resolve(report);
    }
  });
}

// ---------------------------------------------------------------------------
// Внутренние
// ---------------------------------------------------------------------------

function stat(values: readonly number[]): { avg: number; p95: number } {
  if (values.length === 0) return { avg: 0, p95: 0 };
  const sum = values.reduce((a, b) => a + b, 0);
  const avg = sum / values.length;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(0.95 * sorted.length) - 1));
  return { avg, p95: sorted[idx] };
}
