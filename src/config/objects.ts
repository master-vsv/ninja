import type { NDTObjectKind } from '../events/types';
import { NDT_MESHES, type Mesh3D } from '../threed';
import type { PowerUpType } from '../game/PowerUpType';

/**
 * Реестр NDT-объектов (фаза 2).
 *
 * Каждый объект описан набором полигонов (vertex sets) для Matter Physics
 * `fromVertices` + признаками slicable / isBomb. Полигоны — простые выпуклые,
 * центрированы в (0,0); точная геометрия не критична для фазы 2 (важна
 * валидность для Matter fromVertices), фаза 4 уточнит под атласы.
 *
 * Формат vertices: массив полигонов (compound body). Каждый полигон — массив
 * точек { x, y } в локальных координатах. Matter требует минимум 3 точки на
 * полигон, полигон должен быть простым (несамопересекающимся).
 *
 * isBomb=true только для 'pipe' (труба-бомба: при разрезе → мгновенный game
 * over, фаза 4; упущенная — штрафа нет, мина). slicable=true для всех, кроме
 * pipe: труба обрабатывается отдельно в BombSystem (фаза 4), SliceSystem её
 * игнорирует.
 *
 * mesh3D — 3D-wireframe-меша для неонового рендера (Tron/голо-стиль). Только
 * ВИЗУАЛ: slice-детекция по-прежнему использует 2D-vertices (SliceSystem,
 * BodySplitter, Matter fromVertices). Размеры mesh3D согласованы с 2D-vertices.
 */

/** Точка полигона в локальных координатах (центр тела = origin). */
export interface ObjectVertex {
  readonly x: number;
  readonly y: number;
}

/**
 * Конфиг одного NDT-объекта.
 */
export interface ObjectConfig {
  readonly kind: NDTObjectKind;
  /**
   * Полигоны тела для Matter fromVertices. Один полигон — выпуклая оболочка.
   * Compound-тела (несколько полигонов) возможны, но в фазе 2 достаточно одного.
   *
   * ВАЖНО: эти 2D-вершины используются slice-детекцией (SliceSystem/BodySplitter),
   * их НЕЛЬЗЯ менять без обновления slice-тестов. mesh3D — отдельное поле для визуала.
   */
  readonly vertices: ReadonlyArray<ReadonlyArray<ObjectVertex>>;
  /** Является ли объект режущимся (SliceSystem пропускает при false). */
  readonly slicable: boolean;
  /** Бомба ли (мгновенный game over при разрезе). true только для 'pipe'. */
  readonly isBomb: boolean;
  /**
   * 3D-wireframe-меша для неонового рендера (Tron/голо-стиль). Только ВИЗУАЛ —
   * slice-детекция по-прежнему по 2D vertices. Размеры согласованы с vertices.
   */
  readonly mesh3D: Mesh3D;
  /**
   * Power-up эффект, активируемый при разрезе этого объекта. Опциональное:
   * задано только для power-up фигур (shrink/grow/slow). У обычных объектов —
   * undefined. SliceSystem/GameScene при разрезе проверяют это поле, чтобы
   * решить об активации эффекта (через kindToPowerUpType / isPowerUpKind).
   */
  readonly powerUp?: PowerUpType;
}

// --- Геометрия: простые выпуклые полигоны, центрированные в (0,0) ---

/**
 * Болт: шестигранная головка. Hex с радиусом 28 (ширина ≈ 56).
 * Вершины — на окружности r=28 с шагом 60°, первая на угле 0.
 */
function hex(radius: number): ObjectVertex[] {
  const pts: ObjectVertex[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i;
    pts.push({ x: Math.cos(a) * radius, y: Math.sin(a) * radius });
  }
  return pts;
}

/**
 * Болт — шестигранная головка, ~56 px.
 */
const BOLT_VERTICES: ReadonlyArray<ReadonlyArray<ObjectVertex>> = [hex(28)];

/**
 * Гайка — шестигранник поменьше, ~50 px (в фазе 2 без отверстия; фаза 4
 * может заменить на compound с отверстием).
 */
const NUT_VERTICES: ReadonlyArray<ReadonlyArray<ObjectVertex>> = [hex(25)];

/**
 * Линейка — длинный прямоугольник 120×24.
 */
const RULER_VERTICES: ReadonlyArray<ReadonlyArray<ObjectVertex>> = [
  [
    { x: -60, y: -12 },
    { x: 60, y: -12 },
    { x: 60, y: 12 },
    { x: -60, y: 12 },
  ],
];

/**
 * Эталон — квадратный блок 50×50.
 */
const STANDARD_VERTICES: ReadonlyArray<ReadonlyArray<ObjectVertex>> = [
  [
    { x: -25, y: -25 },
    { x: 25, y: -25 },
    { x: 25, y: 25 },
    { x: -25, y: 25 },
  ],
];

/**
 * Труба-бомба — прямоугольник (условный цилиндр сбоку) 80×32.
 * isBomb=true; slicable=false (трубу режет BombSystem в фазе 4, не SliceSystem).
 */
const PIPE_VERTICES: ReadonlyArray<ReadonlyArray<ObjectVertex>> = [
  [
    { x: -40, y: -16 },
    { x: 40, y: -16 },
    { x: 40, y: 16 },
    { x: -40, y: 16 },
  ],
];

/**
 * УЗ-щуп — прямоугольник-силуэт 28×40 (головка + ручка). Выпуклая оболочка
 * формы «головка снизу + ручка сверху». Соответствует mesh3D PROBE_MESH
 * (bbox 28×40). isBomb=false; slicable=true.
 */
const PROBE_VERTICES: ReadonlyArray<ReadonlyArray<ObjectVertex>> = [
  [
    { x: -14, y: -20 },
    { x: 14, y: -20 },
    { x: 14, y: 20 },
    { x: -14, y: 20 },
  ],
];

/**
 * Магнит-подкова — выпуклая оболочка П-формы = прямоугольник 40×36
 * (П невыпуклая, Matter fromVertices требует выпуклый полигон, поэтому
 * хитбокс = описанный прямоугольник). Соответствует mesh3D MAGNET_MESH.
 * isBomb=false; slicable=true.
 */
const MAGNET_VERTICES: ReadonlyArray<ReadonlyArray<ObjectVertex>> = [
  [
    { x: -20, y: -18 },
    { x: 20, y: -18 },
    { x: 20, y: 18 },
    { x: -20, y: 18 },
  ],
];

/**
 * Капля пенетранта — эллипс 36×48 (8 точек, выпуклая аппроксимация круга с
 * хвостиком). Соответствует mesh3D PENETRANT_MESH (bbox 36×48). isBomb=false;
 * slicable=true.
 */
const PENETRANT_VERTICES: ReadonlyArray<ReadonlyArray<ObjectVertex>> = (() => {
  const pts: ObjectVertex[] = [];
  const rx = 18;
  const ry = 24;
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI / 4) * i;
    pts.push({ x: Math.cos(a) * rx, y: Math.sin(a) * ry });
  }
  return [pts];
})();

// --- Power-up фигуры ---

/**
 * Power-up «shrink» — ромб 56×56 (4 точки, выпуклый). Соответствует mesh3D
 * SHRINK_MESH (октаэдр, проекция-ромб). isBomb=false; slicable=true;
 * powerUp='shrink' — при разрезе активирует уменьшение объектов (×0.6, 5 сек).
 */
const SHRINK_VERTICES: ReadonlyArray<ReadonlyArray<ObjectVertex>> = [
  [
    { x: 0, y: -28 },
    { x: 28, y: 0 },
    { x: 0, y: 28 },
    { x: -28, y: 0 },
  ],
];

/**
 * Power-up «grow» — правильный пятиугольник r=28 (5 точек, выпуклый).
 * Соответствует mesh3D GROW_MESH (5-гранная призма). isBomb=false; slicable=true;
 * powerUp='grow' — при разрезе активирует увеличение объектов (×1.4, 5 сек).
 */
const GROW_VERTICES: ReadonlyArray<ReadonlyArray<ObjectVertex>> = (() => {
  const pts: ObjectVertex[] = [];
  const r = 28;
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / 5;
    pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
  }
  return [pts];
})();

/**
 * Power-up «slow» — правильный шестиугольник r=26 (6 точек, выпуклый).
 * Соответствует mesh3D SLOW_MESH (6-гранная бипирамида-кристалл). isBomb=false;
 * slicable=true; powerUp='slow' — при разрезе активирует замедление полёта (×0.5, 5 сек).
 */
const SLOW_VERTICES: ReadonlyArray<ReadonlyArray<ObjectVertex>> = [hex(26)];

// --- NDT-фигуры экипировки (3 новых power-up) ---

/**
 * Каска (helmet) — круглая 8-точечная аппроксимация r=30 (выпуклая, как и
 * другие 8-угольники). Соответствует mesh3D HELMET_MESH (купол + козырёк).
 * isBomb=false; slicable=true; powerUp='shield' — при разрезе активирует
 * временную неуязвимость (5 сек, упущенные объекты не отнимают жизни).
 */
const HELMET_VERTICES: ReadonlyArray<ReadonlyArray<ObjectVertex>> = (() => {
  const pts: ObjectVertex[] = [];
  const r = 30;
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI / 4) * i;
    pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
  }
  return [pts];
})();

/**
 * Очки (goggles) — прямоугольник 40×20 (4 точки, выпуклый). Соответствует
 * mesh3D GOGGLES_MESH (2 линзы + перемычка). isBomb=false; slicable=true;
 * powerUp='grow' — при разрезе активирует увеличение объектов (×1.4, 5 сек).
 */
const GOGGLES_VERTICES: ReadonlyArray<ReadonlyArray<ObjectVertex>> = [
  [
    { x: -20, y: -10 },
    { x: 20, y: -10 },
    { x: 20, y: 10 },
    { x: -20, y: 10 },
  ],
];

/**
 * Маска сварщика (weldingMask) — прямоугольник 40×50 (4 точки, выпуклый).
 * Соответствует mesh3D WELDING_MASK_MESH (корпус + стекло). isBomb=false;
 * slicable=true; powerUp='slow' — при разрезе активирует замедление полёта (×0.5, 5 сек).
 */
const WELDING_MASK_VERTICES: ReadonlyArray<ReadonlyArray<ObjectVertex>> = [
  [
    { x: -20, y: -25 },
    { x: 20, y: -25 },
    { x: 20, y: 25 },
    { x: -20, y: 25 },
  ],
];

/**
 * Карта конфигов NDT-объектов по умолчанию.
 *
 * Инварианты (проверяются unit-тестами):
 *   - 14 видов: 8 базовых (bolt..penetrant) + 3 power-up (shrink/grow/slow) +
 *     3 NDT-экипировки (helmet/goggles/weldingMask).
 *   - isBomb=true только для pipe.
 *   - slicable=true для всех, кроме pipe.
 *   - vertices — непустой массив валидных полигонов (≥ 3 точек каждый).
 *   - mesh3D — валидная 3D-меша (vertices/edges > 0, индексы в пределах) для каждого вида.
 */
export const OBJECT_REGISTRY: Readonly<Record<NDTObjectKind, ObjectConfig>> = {
  bolt: {
    kind: 'bolt',
    vertices: BOLT_VERTICES,
    slicable: true,
    isBomb: false,
    mesh3D: NDT_MESHES.bolt,
  },
  nut: {
    kind: 'nut',
    vertices: NUT_VERTICES,
    slicable: true,
    isBomb: false,
    mesh3D: NDT_MESHES.nut,
  },
  ruler: {
    kind: 'ruler',
    vertices: RULER_VERTICES,
    slicable: true,
    isBomb: false,
    mesh3D: NDT_MESHES.ruler,
  },
  standard: {
    kind: 'standard',
    vertices: STANDARD_VERTICES,
    slicable: true,
    isBomb: false,
    mesh3D: NDT_MESHES.standard,
  },
  pipe: {
    kind: 'pipe',
    vertices: PIPE_VERTICES,
    slicable: false,
    isBomb: true,
    mesh3D: NDT_MESHES.pipe,
  },
  probe: {
    kind: 'probe',
    vertices: PROBE_VERTICES,
    slicable: true,
    isBomb: false,
    mesh3D: NDT_MESHES.probe,
  },
  magnet: {
    kind: 'magnet',
    vertices: MAGNET_VERTICES,
    slicable: true,
    isBomb: false,
    mesh3D: NDT_MESHES.magnet,
  },
  penetrant: {
    kind: 'penetrant',
    vertices: PENETRANT_VERTICES,
    slicable: true,
    isBomb: false,
    mesh3D: NDT_MESHES.penetrant,
  },
  // --- Power-up фигуры ---
  shrink: {
    kind: 'shrink',
    vertices: SHRINK_VERTICES,
    slicable: true,
    isBomb: false,
    mesh3D: NDT_MESHES.shrink,
    powerUp: 'shrink',
  },
  grow: {
    kind: 'grow',
    vertices: GROW_VERTICES,
    slicable: true,
    isBomb: false,
    mesh3D: NDT_MESHES.grow,
    powerUp: 'grow',
  },
  slow: {
    kind: 'slow',
    vertices: SLOW_VERTICES,
    slicable: true,
    isBomb: false,
    mesh3D: NDT_MESHES.slow,
    powerUp: 'slow',
  },
  // --- NDT-фигуры экипировки (3 новых power-up) ---
  helmet: {
    kind: 'helmet',
    vertices: HELMET_VERTICES,
    slicable: true,
    isBomb: false,
    mesh3D: NDT_MESHES.helmet,
    powerUp: 'shield',
  },
  goggles: {
    kind: 'goggles',
    vertices: GOGGLES_VERTICES,
    slicable: true,
    isBomb: false,
    mesh3D: NDT_MESHES.goggles,
    powerUp: 'grow',
  },
  weldingMask: {
    kind: 'weldingMask',
    vertices: WELDING_MASK_VERTICES,
    slicable: true,
    isBomb: false,
    mesh3D: NDT_MESHES.weldingMask,
    powerUp: 'slow',
  },
};
