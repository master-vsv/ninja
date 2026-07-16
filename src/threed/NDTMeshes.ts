/**
 * 3D-меши NDT-объектов в локальных координатах (центр = 0,0,0).
 *
 * Pure-logic модуль: НЕ импортирует Phaser. Используется в OBJECT_REGISTRY.mesh3D
 * для wireframe-рендера в SpawnDirector.
 *
 * Размеры подобраны под 2D-vertices (src/config/objects.ts): радиусы и длины
 * примерно совпадают с габаритами Matter-тел, чтобы визуальный размер совпадал
 * с физическим хитбоксом.
 *
 * Стиль — проволочные каркасы (wireframe) из рёбер: призмы, боксы, цилиндры.
 *
 * 8 видов NDT-объектов:
 *   - bolt     — шестигранная головка + длинный стержень (наиболее узнаваемая форма болта);
 *   - nut      — шестигранник со сквозным отверстием (внутренний 8-гранник);
 *   - ruler    — длинная планка;
 *   - standard — куб-эталон;
 *   - pipe     — горизонтальный цилиндр-бомба;
 *   - probe     — УЗ-щуп: круглая головка + ручка (ультразвуковой контроль, UT);
 *   - magnet    — П-образный магнит-подкова (магнитопорошковый контроль, MT);
 *   - penetrant — капля пенетранта с шипом-хвостиком (капиллярный контроль, PT).
 */

import type { Edge, Mesh3D, Vec3 } from './Mesh3D';
import { meshBBox } from './Mesh3D';
import type { NDTObjectKind } from '../events/types';

// --- Билдеры примитивов ---

/**
 * Вершины правильного n-угольника в плоскости XY (z = 0).
 * Первая вершина на угле `phase` (по умолчанию 0 — на +X).
 */
function ngonXY(n: number, r: number, phase = 0): Vec3[] {
  const pts: Vec3[] = [];
  for (let i = 0; i < n; i++) {
    const a = phase + (2 * Math.PI * i) / n;
    pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, z: 0 });
  }
  return pts;
}

/**
 * Вершины правильного n-угольника в плоскости YZ (x = 0).
 * Используется для призм вдоль оси X (труба).
 */
function ngonYZ(n: number, r: number, phase = 0): Vec3[] {
  const pts: Vec3[] = [];
  for (let i = 0; i < n; i++) {
    const a = phase + (2 * Math.PI * i) / n;
    pts.push({ x: 0, y: Math.cos(a) * r, z: Math.sin(a) * r });
  }
  return pts;
}

/**
 * n-гранная призма в плоскости XY, выдавленная вдоль Z от −halfDepth до +halfDepth.
 * Вершины: bottom [0..n−1] при z=−halfDepth, top [n..2n−1] при z=+halfDepth.
 * Рёбра: контур bottom, контур top, n продольных рёбер.
 */
function prismXY(n: number, r: number, halfDepth: number, phase = 0): Mesh3D {
  const base = ngonXY(n, r, phase);
  const bottom: Vec3[] = base.map((v) => ({ x: v.x, y: v.y, z: -halfDepth }));
  const top: Vec3[] = base.map((v) => ({ x: v.x, y: v.y, z: halfDepth }));
  const vertices: Vec3[] = [...bottom, ...top];
  const edges: Edge[] = [];
  for (let i = 0; i < n; i++) edges.push([i, (i + 1) % n]);
  for (let i = 0; i < n; i++) edges.push([n + i, n + ((i + 1) % n)]);
  for (let i = 0; i < n; i++) edges.push([i, n + i]);
  return { vertices, edges };
}

/**
 * n-гранная призма в плоскости YZ, выдавленная вдоль X от −halfLen до +halfLen.
 * Используется для горизонтально лежащего цилиндра (труба-бомба).
 */
function prismX(n: number, r: number, halfLen: number, phase = 0): Mesh3D {
  const base = ngonYZ(n, r, phase);
  const left: Vec3[] = base.map((v) => ({ x: -halfLen, y: v.y, z: v.z }));
  const right: Vec3[] = base.map((v) => ({ x: halfLen, y: v.y, z: v.z }));
  const vertices: Vec3[] = [...left, ...right];
  const edges: Edge[] = [];
  for (let i = 0; i < n; i++) edges.push([i, (i + 1) % n]);
  for (let i = 0; i < n; i++) edges.push([n + i, n + ((i + 1) % n)]);
  for (let i = 0; i < n; i++) edges.push([i, n + i]);
  return { vertices, edges };
}

/**
 * Осевой параллелепипед (бокс) с полудлинами hx, hy, hz.
 * 8 вершин, 12 рёбер (рёбра граней). Центр в (0,0,0).
 */
function box(hx: number, hy: number, hz: number): Mesh3D {
  const vertices: Vec3[] = [
    { x: -hx, y: -hy, z: -hz }, // 0
    { x: +hx, y: -hy, z: -hz }, // 1
    { x: +hx, y: +hy, z: -hz }, // 2
    { x: -hx, y: +hy, z: -hz }, // 3
    { x: -hx, y: -hy, z: +hz }, // 4
    { x: +hx, y: -hy, z: +hz }, // 5
    { x: +hx, y: +hy, z: +hz }, // 6
    { x: -hx, y: +hy, z: +hz }, // 7
  ];
  const edges: Edge[] = [
    // Задняя грань (z = −hz).
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
    // Передняя грань (z = +hz).
    [4, 5],
    [5, 6],
    [6, 7],
    [7, 4],
    // Продольные рёбра.
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7],
  ];
  return { vertices, edges };
}

/** Сдвигает все вершины меши на (dx, dy, dz). Рёбра не меняются. */
function translate(mesh: Mesh3D, dx: number, dy: number, dz: number): Mesh3D {
  return {
    vertices: mesh.vertices.map((v) => ({
      x: v.x + dx,
      y: v.y + dy,
      z: v.z + dz,
    })),
    edges: mesh.edges,
  };
}

/** Объединяет несколько мешей в одну, пересчитывая индексы рёбер. */
function mergeMeshes(...meshes: ReadonlyArray<Mesh3D>): Mesh3D {
  const vertices: Vec3[] = [];
  const edges: Edge[] = [];
  let offset = 0;
  for (const m of meshes) {
    for (const v of m.vertices) vertices.push(v);
    for (const e of m.edges) {
      edges.push([e[0] + offset, e[1] + offset] as Edge);
    }
    offset += m.vertices.length;
  }
  return { vertices, edges };
}

// --- 8 видов NDT-объектов ---

/**
 * Болт: шестигранная головка (радиус 28, глубина 16) + ДЛИННЫЙ квадратный
 * стержень (14×14×50) вдоль +Z. Стержень в 2.5 раза длиннее исходного —
 * характерный силуэт болта с выраженной ножкой. Размер головки = 2D-vertices
 * (hex(28)) — визуальный и физический габариты совпадают; стержень направлен
 * по Z (вращается при rotateY → виден как «хвост» в wireframe).
 */
const BOLT_MESH: Mesh3D = (() => {
  const head = prismXY(6, 28, 8); // hex-головка (z от −8 до +8)
  const stem = translate(box(7, 7, 25), 0, 0, 33); // длинный стержень (z от +8 до +58)
  return mergeMeshes(head, stem);
})();

/**
 * Гайка: тонкая шестигранная призма (радиус 25, глубина 10) СО СКВОЗНЫМ
 * ОТВЕРСТИЕМ — внутренний 8-гранный канал радиусом 8 идёт через центр вдоль Z.
 * Wireframe = внешние рёбра шестигранника + внутренние рёбра отверстия
 * (с обеих торцов). 2D-vertices остаются внешним шестигранником — отверстие
 * только визуал (slice-хитбокс не меняется).
 */
const NUT_MESH: Mesh3D = (() => {
  const outer = prismXY(6, 25, 5); // внешний шестигранник (z от −5 до +5)
  const hole = prismXY(8, 8, 5); // внутреннее отверстие (8-гранник, сквозное)
  return mergeMeshes(outer, hole);
})();

/**
 * Линейка: тонкий длинный параллелепипед 120×24×8 (halfX=60, halfY=12, halfZ=4).
 * Длина = 2D-vertices (120), толщина по Z небольшая — «плоская планка».
 */
const RULER_MESH: Mesh3D = box(60, 12, 4);

/**
 * Эталон: куб 50×50×50 (halfSize=25). 2D-vertices — квадрат 50×50.
 */
const STANDARD_MESH: Mesh3D = box(25, 25, 25);

/**
 * Труба-бомба: 8-гранный цилиндр вдоль оси X (длина 80, радиус 16).
 * Соответствует 2D-vertices (80×32). Bomb → magenta-акцент при рендере.
 */
const PIPE_MESH: Mesh3D = prismX(8, 16, 40);

/**
 * УЗ-щуп (UT — ультразвуковой контроль): круглая головка-датчик
 * (8-гранная призма r=14, глубина 10) + длинная ручка-кабель
 * (параллелепипед 8×16×10) сверху. Похоже на медицинский УЗ-датчик.
 * Слайсабельный. Центр по y — на стыке головки и ручки (и bbox, и среднее
 * вершин равны 0).
 */
const PROBE_MESH: Mesh3D = (() => {
  const head = translate(prismXY(8, 14, 5), 0, -6, 0); // головка снизу
  const handle = translate(box(4, 8, 5), 0, 12, 0); // ручка сверху
  return mergeMeshes(head, handle);
})();

/**
 * Магнит-подкова (MT — магнитопорошковый контроль): П-образная форма —
 * два вертикальных параллелепипеда-полюса (10×24×10) + горизонтальная
 * перемычка (40×12×10) сверху. Соединены через mergeMeshes.
 * Слайсабельный. Все три блока центрированы по x и y → центр меша = (0,0,0).
 */
const MAGNET_MESH: Mesh3D = (() => {
  const leftPole = translate(box(5, 12, 5), -15, 6, 0);
  const rightPole = translate(box(5, 12, 5), 15, 6, 0);
  const bridge = translate(box(20, 6, 5), 0, -12, 0);
  return mergeMeshes(leftPole, rightPole, bridge);
})();

/**
 * n-гранная бипирамида (две пирамиды общим основанием в плоскости XY, вершины
 * по ±Z). Используется для power-up «slow» — кристалл-формы, визуально
 * отличимой от обычных призм.
 *
 * Вершины: основание ngonXY(n, r, phase) при z=0 (n точек) + apex-top (0,0,+hz)
 * + apex-bottom (0,0,-hz). Рёбра: контур основания + n рёбер к top + n к bottom.
 */
function bipyramidXY(n: number, r: number, hz: number, phase = 0): Mesh3D {
  const base = ngonXY(n, r, phase); // при z=0
  const topIdx = n;
  const botIdx = n + 1;
  const vertices: Vec3[] = [
    ...base,
    { x: 0, y: 0, z: hz }, // apex-top
    { x: 0, y: 0, z: -hz }, // apex-bottom
  ];
  const edges: Edge[] = [];
  for (let i = 0; i < n; i++) edges.push([i, (i + 1) % n]); // контур основания
  for (let i = 0; i < n; i++) edges.push([i, topIdx]); // рёбра к top
  for (let i = 0; i < n; i++) edges.push([i, botIdx]); // рёбра к bottom
  return { vertices, edges };
}

/**
 * Капля пенетранта (PT — капиллярный контроль): округлое тело
 * (8-гранная призма r=18, глубина 16) + шип-хвостик (параллелепипед 6×24×6)
 * сверху. Слайсабельный. Центр по y — на середине между телом и хвостиком
 * (симметричный bbox [-24, +24]).
 */
const PENETRANT_MESH: Mesh3D = (() => {
  const body = translate(prismXY(8, 18, 8), 0, -6, 0); // круглое тело снизу
  const tail = translate(box(3, 12, 3), 0, 12, 0); // шип-хвостик сверху
  return mergeMeshes(body, tail);
})();

// --- 3 power-up фигуры ---

/**
 * shrink (power-up): октаэдр — две 4-гранные пирамиды общим основанием в
 * плоскости XY (ромб сверху в 2D-проекции). 6 вершин, 12 рёбер. Симметричен
 * по всем осям → центр строго в (0,0,0). r=28 — согласован с 2D-вершинами
 * (ромб с диагоналями 56). Purple (0xb14dff) при рендере.
 */
const SHRINK_MESH: Mesh3D = (() => {
  // 4 вершины-основания на осях XY + 2 апекса по Z = октаэдр.
  const r = 28;
  const base: Vec3[] = [
    { x: r, y: 0, z: 0 },
    { x: 0, y: r, z: 0 },
    { x: -r, y: 0, z: 0 },
    { x: 0, y: -r, z: 0 },
  ];
  const topIdx = 4;
  const botIdx = 5;
  const vertices: Vec3[] = [
    ...base,
    { x: 0, y: 0, z: r },
    { x: 0, y: 0, z: -r },
  ];
  const edges: Edge[] = [
    // контур основания (ромб в XY)
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
    // рёбра к top-apex
    [0, topIdx],
    [1, topIdx],
    [2, topIdx],
    [3, topIdx],
    // рёбра к bottom-apex
    [0, botIdx],
    [1, botIdx],
    [2, botIdx],
    [3, botIdx],
  ];
  return { vertices, edges };
})();

/**
 * grow (power-up): 5-гранная призма (pentagon). 10 вершин (5+5), 15 рёбер.
 * r=28, halfDepth=10. Центрируется через meshBBox (pentagon с rotation -PI/2
 * имеет смещение центра по Y → translate к 0,0,0). Orange (0xff8a00) при рендере.
 */
const GROW_MESH: Mesh3D = (() => {
  const m = prismXY(5, 28, 10, -Math.PI / 2);
  const bb = meshBBox(m);
  return translate(m, -(bb.minX + bb.maxX) / 2, -(bb.minY + bb.maxY) / 2, -(bb.minZ + bb.maxZ) / 2);
})();

/**
 * slow (power-up): 6-гранная бипирамида (кристалл). 8 вершин (6 основания +
 * 2 апекса), 18 рёбер. r=26, hz=22 — вытянут по Z, «кристалл-льдинка».
 * Ice-blue (0x00d4ff) при рендере. Симметрична по всем осям.
 */
const SLOW_MESH: Mesh3D = bipyramidXY(6, 26, 22);

// --- 3 NDT-фигуры экипировки (power-up) ---

/**
 * helmet (power-up shield): каска — широкая призма-купол (8-гранная, r=28,
 * глубина 12) имитирует купол каски + тонкий козырёк-бокс спереди (-Y).
 * Соответствует 2D-vertices (8-угольник r=30). Gold (0xffd700) при рендере.
 * Центр по Y — небольшой сдвиг вниз из-за козырька; bbox центрирован через
 * translate к (0,0,0). Слайсабельный.
 */
const HELMET_MESH: Mesh3D = (() => {
  const dome = prismXY(8, 28, 6); // купол: невысокая 8-гранная призма
  const visor = translate(box(14, 4, 6), 0, -20, 0); // козырёк спереди (-Y)
  const merged = mergeMeshes(dome, visor);
  const bb = meshBBox(merged);
  return translate(
    merged,
    -(bb.minX + bb.maxX) / 2,
    -(bb.minY + bb.maxY) / 2,
    -(bb.minZ + bb.maxZ) / 2,
  );
})();

/**
 * goggles (power-up grow): очки — 2 круглых линзы (8-гранные призмы r=10,
 * глубина 8) + тонкая перемычка-бокс между ними. Соответствует 2D-vertices
 * (прямоугольник 40×20). Orange (0xff8a00) при рендере. Симметрична по X.
 * Слайсабельная.
 */
const GOGGLES_MESH: Mesh3D = (() => {
  const leftLens = translate(prismXY(8, 10, 4), -12, 0, 0);
  const rightLens = translate(prismXY(8, 10, 4), 12, 0, 0);
  const bridge = box(8, 4, 4); // перемычка между линзами
  return mergeMeshes(leftLens, rightLens, bridge);
})();

/**
 * weldingMask (power-up slow): маска сварщика — широкий прямоугольный корпус
 * (бокс 40×50×8) + тёмное стекло-окно (тонкий бокс 24×16×1) по центру. Хорошо
 * узнаваемый силуэт маски. Соответствует 2D-vertices (прямоугольник 40×50).
 * Ice-blue (0x00d4ff) при рендере. Симметрична по X/Y. Слайсабельная.
 */
const WELDING_MASK_MESH: Mesh3D = (() => {
  const shell = box(20, 25, 4); // корпус-бокс (половинные размеры)
  const glass = translate(box(12, 8, 1), 0, -8, 4); // стекло-окно по центру, чуть впереди (+Z)
  return mergeMeshes(shell, glass);
})();

/**
 * Карта 3D-мешей по виду NDT-объекта. Размеры согласованы с 2D-vertices
 * (src/config/objects.ts) — физический хитбокс ≈ визуальный габарит.
 */
export const NDT_MESHES: Readonly<Record<NDTObjectKind, Mesh3D>> = {
  bolt: BOLT_MESH,
  nut: NUT_MESH,
  ruler: RULER_MESH,
  standard: STANDARD_MESH,
  pipe: PIPE_MESH,
  probe: PROBE_MESH,
  magnet: MAGNET_MESH,
  penetrant: PENETRANT_MESH,
  // Power-up фигуры (уникальные формы, отличаются от обычных).
  shrink: SHRINK_MESH,
  grow: GROW_MESH,
  slow: SLOW_MESH,
  // NDT-экипировка (power-up, спавнятся в 6%-пуле).
  helmet: HELMET_MESH,
  goggles: GOGGLES_MESH,
  weldingMask: WELDING_MASK_MESH,
};
