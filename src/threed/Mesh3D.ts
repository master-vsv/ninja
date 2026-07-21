/**
 * Базовые типы 3D-меши для wireframe-рендера (Tron/голо-стиль).
 *
 * Pure-logic модуль: НЕ импортирует Phaser, тестируется unit-тестами без рендера.
 * Используется в NDTMeshes (описания объектов) → OBJECT_REGISTRY.mesh3D →
 * SpawnDirector.drawWireframe (Phaser-обёртка).
 *
 * Инварианты:
 *   - Вершины — в локальных координатах, центр тела = (0, 0, 0).
 *   - Ребро — пара индексов в массив вершин (wireframe из отрезков).
 *   - Все значения иммутабельны (readonly).
 */

/** 3D-вектор / точка. */
export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Ребро меши как пара индексов в массив вершин. */
export type Edge = readonly [number, number];

/**
 * 3D-меша для wireframe-рендера.
 * vertices + edges (индексы пар вершин). Никакой топологии граней — только рёбра,
 * что достаточно для неонового проволочного каркаса.
 */
export interface Mesh3D {
  readonly vertices: ReadonlyArray<Vec3>;
  readonly edges: ReadonlyArray<Edge>;
}

/** AABB 3D-меши (axis-aligned bounding box). */
export interface MeshBBox {
  readonly minX: number;
  readonly minY: number;
  readonly minZ: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly maxZ: number;
}

/** Малый epsilon для сравнения чисел с плавающей точкой. */
const EPS = 1e-9;

/**
 * Вычисляет AABB меши.
 * Пустая меша → вырожденный AABB (Infinity / -Infinity), как и в 2D-Geometry.
 */
export function meshBBox(mesh: Mesh3D): MeshBBox {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const v of mesh.vertices) {
    if (v.x < minX) minX = v.x;
    if (v.y < minY) minY = v.y;
    if (v.z < minZ) minZ = v.z;
    if (v.x > maxX) maxX = v.x;
    if (v.y > maxY) maxY = v.y;
    if (v.z > maxZ) maxZ = v.z;
  }
  return { minX, minY, minZ, maxX, maxY, maxZ };
}

/**
 * Максимальный габарит меши по любой из осей (для оценки «визуального размера»).
 * Пустая меша → 0.
 */
export function maxExtent(mesh: Mesh3D): number {
  if (mesh.vertices.length === 0) return 0;
  const b = meshBBox(mesh);
  return Math.max(
    b.maxX - b.minX,
    b.maxY - b.minY,
    b.maxZ - b.minZ,
  );
}

/**
 * Выбрасывает ошибку, если индексы рёбер выходят за пределы vertices или
 * если меша структурно некорректна (нет вершин/рёбер).
 *
 * Используется в тестах и в ObjectConfig-валидации для раннего обнаружения
 * опечаток в NDTMeshes (индекс за пределами массива → render-артефакт).
 */
export function validateMesh(mesh: Mesh3D): void {
  if (!Array.isArray(mesh.vertices) || mesh.vertices.length === 0) {
    throw new Error('Mesh3D: vertices должен быть непустым массивом');
  }
  if (!Array.isArray(mesh.edges) || mesh.edges.length === 0) {
    throw new Error('Mesh3D: edges должен быть непустым массивом');
  }
  const n = mesh.vertices.length;
  for (let i = 0; i < mesh.edges.length; i++) {
    const e = mesh.edges[i];
    const [a, b] = e;
    if (
      !Number.isInteger(a) ||
      !Number.isInteger(b) ||
      a < 0 ||
      b < 0 ||
      a >= n ||
      b >= n
    ) {
      throw new Error(
        `Mesh3D: ребро [${a}, ${b}] выходит за пределы vertices (0..${n - 1})`,
      );
    }
    // Запрещаем вырожденное ребро (петлю): нулевая длина не несёт визуального смысла.
    if (Math.abs(a - b) < EPS) {
      throw new Error(`Mesh3D: вырожденное ребро [${a}, ${b}] (петля)`);
    }
  }
}
