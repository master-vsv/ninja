import Phaser from 'phaser';

/**
 * Бенчмарк физдвижка Matter.js (фаза 0, ступень A — изолированный).
 *
 * Назначение: проверить, что при N=50 тел в коробке с гравитацией средний fps ≥ 55
 * за 30 сек на целевых устройствах (iPhone SE 2020, Galaxy A52). При провале —
 * поднимаем вопрос о миграции на Rapier+PixiJS до старта фаз 4+ (см. план, risk №2).
 *
 * Структура:
 *   - prepareBodies() — pure-logic: детерминированно (fixed-seed LCG) расставляет N тел
 *     в границах коробки. Покрыт unit-тестами в vitest.
 *   - runBenchmark() — runtime: запускается в реальной Phaser-сцене (Menu-stub → кнопка),
 *     замеряет fps / frame time / physics step, возвращает отчёт и пишет в консоль.
 */

/** Границы коробки (внутреннее пространство, доступное для тел). */
export interface BenchBounds {
  readonly width: number;
  readonly height: number;
}

/** Описание стартового состояния одного тела. */
export interface BenchBodySpawn {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly vx: number;
  readonly vy: number;
}

/** Опции запуска бенчмарка. */
export interface BenchOptions {
  /** Число тел (N в плане). По умолчанию 50. */
  readonly bodyCount?: number;
  /** Длительность замера, мс. По умолчанию 30_000 (30 сек). */
  readonly durationMs?: number;
  /** Размер квадратного тела, px. По умолчанию 20. */
  readonly bodySize?: number;
  /** Bounds коробки. По умолчанию — размер сцены. */
  readonly bounds?: BenchBounds;
  /** Seed для детерминированного LCG. По умолчанию зафиксирован. */
  readonly seed?: number;
  /** Retina-gate: cap для разрешения канваса (см. computeResolution). Информационно. */
  readonly retinaResolutionCap?: number | null;
}

/** Агрегированная статистика по массиву значений. */
export interface BenchStat {
  readonly avg: number;
  readonly p95: number;
}

/** Отчёт бенчмарка. Сохраняется/печатается после прогона. */
export interface BenchReport {
  /** Сколько тел участвовало. */
  readonly bodyCount: number;
  /** Реальная длительность прогона, мс (может быть чуть больше durationMs). */
  readonly durationMs: number;
  /** Границы коробки. */
  readonly bounds: BenchBounds;
  /** FPS: средний и p95 (p95 = 1000 / p95_frame_time). */
  readonly fps: BenchStat & { readonly samples: number };
  /** Frame time, мс. */
  readonly frameTime: BenchStat;
  /** Время одного шага Matter, мс (замер вокруг world.step). */
  readonly physicsStep: BenchStat;
  /** Retina-gate: cap разрешения (если применён) или null. */
  readonly retinaResolutionCap: number | null;
  /** ISO-timestamp завершения прогона. */
  readonly createdAt: string;
}

/** Дефолты — зафиксированы планом (ступень A). */
const DEFAULT_COUNT = 50;
const DEFAULT_DURATION_MS = 30_000;
const DEFAULT_BODY_SIZE = 20;
const DEFAULT_SEED = 0x5eed_1234;

/**
 * Детерминированный генератор (LCG, Numerical Recipes).
 * Заменяет Math.random() — прогоны воспроизводимы.
 */
function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    // 32-битные константы LCG.
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

/** Ограничить значение в диапазоне [min, max]. */
function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/** Перцентиль из отсортированного массива. */
function percentile(sortedAsc: readonly number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = clamp(Math.ceil(p * sortedAsc.length) - 1, 0, sortedAsc.length - 1);
  return sortedAsc[idx];
}

/** Базовая статистика по массиву: avg + p95. */
function stat(values: readonly number[]): BenchStat {
  if (values.length === 0) return { avg: 0, p95: 0 };
  const sum = values.reduce((a, b) => a + b, 0);
  const avg = sum / values.length;
  const sorted = [...values].sort((a, b) => a - b);
  return { avg, p95: percentile(sorted, 0.95) };
}

/**
 * Детерминированно (fixed-seed LCG) расставляет N тел внутри bounds.
 * Pure-logic: не зависит от Phaser, тестируется в vitest.
 *
 * Алгоритм: тела раскладываются в регулярную сетку (cols × rows), внутри каждой ячейки
 * небольшое LCG-смещение — гарантия отсутствия пересечений в первом кадре и одновременно
 * «нешаблонности» стартовых позиций.
 *
 * @throws Error если bounds слишком мал для размера тела.
 */
export function prepareBodies(
  count: number,
  bounds: BenchBounds,
  options: { bodySize?: number; seed?: number } = {},
): BenchBodySpawn[] {
  if (count <= 0) return [];
  const size = options.bodySize ?? DEFAULT_BODY_SIZE;
  const half = size / 2;
  const margin = half + 1; // отступ от стен, чтобы тело не пересекалось со стеной в t=0
  const innerW = bounds.width - margin * 2;
  const innerH = bounds.height - margin * 2;
  if (innerW <= 0 || innerH <= 0) {
    throw new Error(
      `Bounds ${bounds.width}x${bounds.height} too small for body size ${size}`,
    );
  }
  const rand = createRng((options.seed ?? DEFAULT_SEED) >>> 0);

  const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
  const rows = Math.max(1, Math.ceil(count / cols));
  const cellW = innerW / cols;
  const cellH = innerH / rows;

  const result: BenchBodySpawn[] = [];
  let placed = 0;
  for (let r = 0; r < rows && placed < count; r++) {
    for (let c = 0; c < cols && placed < count; c++) {
      const cellCx = margin + (c + 0.5) * cellW;
      const cellCy = margin + (r + 0.5) * cellH;
      const jitterMaxX = Math.max(cellW - size, 0);
      const jitterMaxY = Math.max(cellH - size, 0);
      const jx = (rand() - 0.5) * jitterMaxX;
      const jy = (rand() - 0.5) * jitterMaxY;
      const x = clamp(cellCx + jx, margin, bounds.width - margin);
      const y = clamp(cellCy + jy, margin, bounds.height - margin);
      const vx = (rand() - 0.5) * 4; // ±2 px/step
      const vy = (rand() - 0.5) * 4;
      result.push({ x, y, width: size, height: size, vx, vy });
      placed++;
    }
  }
  return result;
}

/**
 * Запускает изолированный бенчмарк в переданной Phaser-сцене.
 *
 * Что делает:
 *   1. Создаёт статическую коробку (4 стены).
 *   2. Создаёт N динамических тел из prepareBodies().
 *   3. Подписывается на beforeupdate/afterupdate мира Matter — замер physicsStep.
 *      На scene.update — замер frameTime (delta).
 *   4. Через durationMs прекращает замер, удаляет созданные тела/стены, возвращает отчёт.
 *
 * Не использует слайсинг/частицы — это изолированный замек физдвижка (ступень A).
 * Для реального ворклоуда со слайсингом — ступень B в фазе 3.
 */
export function runBenchmark(
  scene: Phaser.Scene,
  options: BenchOptions = {},
): Promise<BenchReport> {
  const bodyCount = options.bodyCount ?? DEFAULT_COUNT;
  const durationMs = options.durationMs ?? DEFAULT_DURATION_MS;
  const bodySize = options.bodySize ?? DEFAULT_BODY_SIZE;
  const bounds: BenchBounds = options.bounds ?? {
    width: scene.scale.width,
    height: scene.scale.height,
  };
  const retinaCap = options.retinaResolutionCap ?? null;

  return new Promise<BenchReport>((resolve) => {
    const spawns = prepareBodies(bodyCount, bounds, { bodySize });

    // В Phaser 3.90 типах статические методы Matter.Body недоступны через namespace.
    // Matter.Body.setVelocity эквивалентен прямому присваиванию positionPrev = position - velocity
    // (Matter использует position-Verlet integration). Приводим тип — в рантайме поля всегда есть.
    type MatterBody = MatterJS.BodyType & {
      position: { x: number; y: number };
      positionPrev: { x: number; y: number };
    };

    const created: Array<MatterJS.BodyType> = [];

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

    // Динамические тела.
    for (const s of spawns) {
      const body = scene.matter.add.rectangle(s.x, s.y, s.width, s.height, {
        restitution: 0.2,
        friction: 0.1,
      }) as MatterBody;
      // Начальная скорость через positionPrev (position-Verlet).
      body.positionPrev.x = body.position.x - s.vx;
      body.positionPrev.y = body.position.y - s.vy;
      created.push(body);
    }

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

    // Подстраховка: если update перестаёт вызываться (сцена на паузе), всё равно завершаемся.
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

      // Очистка созданных тел — сцена остаётся пригодной для повторного прогона.
      for (const b of [...created, ...walls]) {
        scene.matter.world.remove(b);
      }

      const samples = frameTimes.length;
      const frameStat = stat(frameTimes);
      const stepStat = stat(physicsSteps);
      const fpsAvg = frameStat.avg > 0 ? 1000 / frameStat.avg : 0;
      const fpsP95 = frameStat.p95 > 0 ? 1000 / frameStat.p95 : 0;

      const report: BenchReport = {
        bodyCount,
        durationMs: performance.now() - startTs,
        bounds,
        fps: { avg: fpsAvg, p95: fpsP95, samples },
        frameTime: frameStat,
        physicsStep: stepStat,
        retinaResolutionCap: retinaCap,
        createdAt: new Date().toISOString(),
      };

      // Пишем в консоль — отчёт доступен сразу, без парсинга Promise.
      // eslint-disable-next-line no-console
      console.log('[NDT-Ninja] benchmark report:', report);

      resolve(report);
    }
  });
}
