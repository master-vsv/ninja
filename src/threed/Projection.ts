/**
 * Ортографическая 3D-проекция и вращения (pure-logic).
 *
 * Pure-logic модуль: НЕ импортирует Phaser. Тестируется unit-тестами.
 * Phaser-обёртка (SpawnDirector.drawWireframe) вызывает:
 *   compose(rotateX(angleX), rotateY(angleY)) → projectOrthographic(mesh, t).
 *
 * Конвенция системы координат — правосторонняя (right-handed):
 *   +X вправо, +Y вверх (в локальных координатах меши), +Z к камере.
 *   Вращения — правые (против часовой стрелки, если смотреть вдоль оси с +).
 *
 * Матрицы вращения (применяются как v' = R · v):
 *   rotateX: y' = y cos − z sin, z' = y sin + z cos
 *   rotateY: x' = x cos + z sin, z' = −x sin + z cos  (синус со знаком + для x,
 *            чтобы rotateY(π/2) переводил (1,0,0) → (0,0,−1))
 *   rotateZ: x' = x cos − y sin, y' = x sin + y cos
 */

import type { Mesh3D, Vec3 } from './Mesh3D';

/** Функция преобразования 3D-вектора (иммутабельная: возвращает новый Vec3). */
export type Vec3Transform = (v: Vec3) => Vec3;

/** Тождественное преобразование (копия, чтобы не мутировать вход). */
export function identity(): Vec3Transform {
  return (v) => ({ x: v.x, y: v.y, z: v.z });
}

/**
 * Вращение вокруг оси X на угол (рад).
 * Справа: y → y cos − z sin, z → y sin + z cos.
 */
export function rotateX(angle: number): Vec3Transform {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return (v) => ({
    x: v.x,
    y: v.y * c - v.z * s,
    z: v.y * s + v.z * c,
  });
}

/**
 * Вращение вокруг оси Y на угол (рад).
 * Справа: x → x cos + z sin, z → −x sin + z cos.
 * При angle = π/2: (1, 0, 0) → (0, 0, −1) (используется в unit-тесте).
 */
export function rotateY(angle: number): Vec3Transform {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return (v) => ({
    x: v.x * c + v.z * s,
    y: v.y,
    z: -v.x * s + v.z * c,
  });
}

/**
 * Вращение вокруг оси Z на угол (рад).
 * Справа: x → x cos − y sin, y → x sin + y cos.
 */
export function rotateZ(angle: number): Vec3Transform {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return (v) => ({
    x: v.x * c - v.y * s,
    y: v.x * s + v.y * c,
    z: v.z,
  });
}

/**
 * Композиция преобразований: применяются слева направо (как запись цепочки).
 * compose(A, B)(v) = B(A(v)) — сначала A, затем B. Удобно для читаемости:
 *   compose(rotateX(rotX), rotateY(rotY)) — «наклон по X, затем поворот по Y».
 */
export function compose(...transforms: ReadonlyArray<Vec3Transform>): Vec3Transform {
  if (transforms.length === 0) return identity();
  return (v) => {
    let acc = v;
    for (const t of transforms) {
      acc = t(acc);
    }
    return acc;
  };
}

/**
 * Спроецированное ребро в 2D.
 * ax/ay, bx/by — экранные координаты концов (Z отброшена для позиции).
 * depth — средняя Z концов после transform (для depth-cueing: > 0 = ближе к камере).
 */
export interface ProjectedEdge {
  readonly ax: number;
  readonly ay: number;
  readonly bx: number;
  readonly by: number;
  /** Средняя Z концов (после transform) — используется рендером для яркости/толщины. */
  readonly depth: number;
}

/**
 * Ортографическая проекция меши: применяет transform ко всем вершинам,
 * затем для каждого ребра возвращает 2D-координаты концов (Z отбрасывается
 * для позиции) + усреднённую Z как depth (для depth-cueing рендера).
 *
 * Количество возвращённых рёбер === mesh.edges.length (1-к-1).
 */
export function projectOrthographic(
  mesh: Mesh3D,
  transform: Vec3Transform,
): readonly ProjectedEdge[] {
  // Кэшируем преобразованные вершины (каждая вершина используется в нескольких рёбрах).
  const projected = mesh.vertices.map((v) => transform(v));
  const out: ProjectedEdge[] = [];
  for (const [i, j] of mesh.edges) {
    const a = projected[i];
    const b = projected[j];
    out.push({
      ax: a.x,
      ay: a.y,
      bx: b.x,
      by: b.y,
      depth: (a.z + b.z) / 2,
    });
  }
  return out;
}
