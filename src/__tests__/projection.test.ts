import { describe, it, expect } from 'vitest';
import {
  identity,
  rotateX,
  rotateY,
  rotateZ,
  compose,
  projectOrthographic,
  type Vec3Transform,
} from '../threed/Projection';
import type { Mesh3D, Vec3 } from '../threed/Mesh3D';

/**
 * Тесты pure-logic 3D-проекции (Projection.ts).
 *
 * Покрываем:
 *   - rotateX/Y/Z(0) — тождество;
 *   - rotateY(π/2): (1,0,0)→(0,0,−1); rotateX(π/2): (0,1,0)→(0,0,1);
 *     rotateZ(π/2): (1,0,0)→(0,1,0);
 *   - вращения сохраняют длину вектора (3D);
 *   - compose применяет трансформации слева направо;
 *   - projectOrthographic отбрасывает Z (позиция = X,Y после transform);
 *   - projectOrthographic сохраняет количество рёбер (1-к-1);
 *   - вращение сохраняет длину рёбер (3D).
 */

const EPS = 1e-9;

function len(v: Vec3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

function dist3(a: Vec3, b: Vec3): number {
  return Math.sqrt(
    (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2,
  );
}

function closeTo(actual: Vec3, expected: Vec3, precision = 6): void {
  expect(actual.x).toBeCloseTo(expected.x, precision);
  expect(actual.y).toBeCloseTo(expected.y, precision);
  expect(actual.z).toBeCloseTo(expected.z, precision);
}

describe('rotateX', () => {
  it('rotateX(0) — тождество', () => {
    const t = rotateX(0);
    closeTo(t({ x: 1, y: 2, z: 3 }), { x: 1, y: 2, z: 3 });
  });

  it('rotateX(π/2): (0,1,0) → (0,0,1)', () => {
    const t = rotateX(Math.PI / 2);
    closeTo(t({ x: 0, y: 1, z: 0 }), { x: 0, y: 0, z: 1 });
  });

  it('rotateX(π/2): (0,0,1) → (0,−1,0)', () => {
    const t = rotateX(Math.PI / 2);
    closeTo(t({ x: 0, y: 0, z: 1 }), { x: 0, y: -1, z: 0 });
  });

  it('сохраняет длину вектора', () => {
    const t = rotateX(0.7);
    const v = { x: 3, y: 4, z: 5 };
    expect(len(t(v))).toBeCloseTo(len(v), 6);
  });
});

describe('rotateY', () => {
  it('rotateY(0) — тождество', () => {
    const t = rotateY(0);
    closeTo(t({ x: 1, y: 2, z: 3 }), { x: 1, y: 2, z: 3 });
  });

  it('rotateY(π/2): (1,0,0) → (0,0,−1)', () => {
    const t = rotateY(Math.PI / 2);
    closeTo(t({ x: 1, y: 0, z: 0 }), { x: 0, y: 0, z: -1 });
  });

  it('rotateY(−π/2): (1,0,0) → (0,0,1)', () => {
    const t = rotateY(-Math.PI / 2);
    closeTo(t({ x: 1, y: 0, z: 0 }), { x: 0, y: 0, z: 1 });
  });

  it('rotateY(π/2): (0,0,1) → (1,0,0)', () => {
    const t = rotateY(Math.PI / 2);
    closeTo(t({ x: 0, y: 0, z: 1 }), { x: 1, y: 0, z: 0 });
  });

  it('y-координата не меняется при вращении вокруг Y', () => {
    const t = rotateY(1.23);
    const r = t({ x: 5, y: 7, z: -3 });
    expect(r.y).toBeCloseTo(7, 6);
  });

  it('сохраняет длину вектора', () => {
    const t = rotateY(1.23);
    const v = { x: 3, y: 4, z: 5 };
    expect(len(t(v))).toBeCloseTo(len(v), 6);
  });
});

describe('rotateZ', () => {
  it('rotateZ(0) — тождество', () => {
    const t = rotateZ(0);
    closeTo(t({ x: 1, y: 2, z: 3 }), { x: 1, y: 2, z: 3 });
  });

  it('rotateZ(π/2): (1,0,0) → (0,1,0)', () => {
    const t = rotateZ(Math.PI / 2);
    closeTo(t({ x: 1, y: 0, z: 0 }), { x: 0, y: 1, z: 0 });
  });

  it('rotateZ(π/2): (0,1,0) → (−1,0,0)', () => {
    const t = rotateZ(Math.PI / 2);
    closeTo(t({ x: 0, y: 1, z: 0 }), { x: -1, y: 0, z: 0 });
  });

  it('z-координата не меняется при вращении вокруг Z', () => {
    const t = rotateZ(2.5);
    const r = t({ x: 5, y: 7, z: -3 });
    expect(r.z).toBeCloseTo(-3, 6);
  });

  it('сохраняет длину вектора', () => {
    const t = rotateZ(2.5);
    const v = { x: 3, y: 4, z: 5 };
    expect(len(t(v))).toBeCloseTo(len(v), 6);
  });
});

describe('identity', () => {
  it('возвращает копию вектора без изменений', () => {
    const t = identity();
    const v = { x: 1, y: 2, z: 3 };
    const r = t(v);
    closeTo(r, v);
    // Иммутабельность: возвращается новый объект, не мутирует вход.
    expect(r).not.toBe(v);
  });
});

describe('compose', () => {
  it('compose() без аргументов — тождество', () => {
    const t = compose();
    closeTo(t({ x: 1, y: 2, z: 3 }), { x: 1, y: 2, z: 3 });
  });

  it('compose(t) === t (один аргумент)', () => {
    const t = compose(rotateY(Math.PI / 4));
    closeTo(t({ x: 1, y: 0, z: 0 }), rotateY(Math.PI / 4)({ x: 1, y: 0, z: 0 }));
  });

  it('применяет трансформации слева направо (compose(A, B)(v) = B(A(v)))', () => {
    const A: Vec3Transform = (v) => ({ x: v.x + 1, y: v.y, z: v.z });
    const B: Vec3Transform = (v) => ({ x: v.x * 10, y: v.y, z: v.z });
    const r = compose(A, B)({ x: 2, y: 0, z: 0 });
    // A сначала: x=3; затем B: x=30.
    expect(r.x).toBe(30);
  });

  it('compose(rotateX, rotateY) применяется последовательно', () => {
    const angle = Math.PI / 4;
    const v = { x: 1, y: 1, z: 0 };
    const composed = compose(rotateX(angle), rotateY(angle))(v);
    const manual = rotateY(angle)(rotateX(angle)(v));
    closeTo(composed, manual);
  });
});

describe('projectOrthographic', () => {
  // Треугольник с разными Z (чтобы проверить отбрасывание Z).
  const mesh: Mesh3D = {
    vertices: [
      { x: 0, y: 0, z: 5 }, // 0
      { x: 10, y: 0, z: -3 }, // 1
      { x: 5, y: 10, z: 0 }, // 2
    ],
    edges: [
      [0, 1],
      [1, 2],
      [2, 0],
    ],
  };

  it('с тождеством возвращает 2D-позиции = X,Y вершин (Z отбрасывается)', () => {
    const edges = projectOrthographic(mesh, identity());
    expect(edges.length).toBe(3);
    // Ребро [0,1]: (0,0) → (10,0).
    expect(edges[0].ax).toBeCloseTo(0, 6);
    expect(edges[0].ay).toBeCloseTo(0, 6);
    expect(edges[0].bx).toBeCloseTo(10, 6);
    expect(edges[0].by).toBeCloseTo(0, 6);
    // Ребро [1,2]: (10,0) → (5,10).
    expect(edges[1].ax).toBeCloseTo(10, 6);
    expect(edges[1].ay).toBeCloseTo(0, 6);
    expect(edges[1].bx).toBeCloseTo(5, 6);
    expect(edges[1].by).toBeCloseTo(10, 6);
  });

  it('количество рёбер на выходе = mesh.edges.length (1-к-1)', () => {
    const edges = projectOrthographic(mesh, identity());
    expect(edges.length).toBe(mesh.edges.length);
  });

  it('depth = средняя Z концов после transform (для identity = средняя исходных Z)', () => {
    const edges = projectOrthographic(mesh, identity());
    // Ребро [0,1]: вершины z=5 и z=−3 → depth = (5 + −3)/2 = 1.
    expect(edges[0].depth).toBeCloseTo(1, 6);
    // Ребро [1,2]: z=−3 и z=0 → depth = −1.5.
    expect(edges[1].depth).toBeCloseTo(-1.5, 6);
  });

  it('rotateZ(π/2) поворачивает 2D-проекцию (X,Y меняются местами с знаком)', () => {
    const edges = projectOrthographic(mesh, rotateZ(Math.PI / 2));
    // Вершина 0 (0,0) остаётся (0,0). Вершина 1 (10,0) → (0,10).
    expect(edges[0].ax).toBeCloseTo(0, 6);
    expect(edges[0].ay).toBeCloseTo(0, 6);
    expect(edges[0].bx).toBeCloseTo(0, 6);
    expect(edges[0].by).toBeCloseTo(10, 6);
  });

  it('Z не влияет на 2D-позицию при identity (только X,Y определяют ax/ay)', () => {
    // Две вершины с одинаковыми X,Y, но разными Z → 2D-проекция совпадает.
    const flat: Mesh3D = {
      vertices: [
        { x: 5, y: 7, z: -100 },
        { x: 5, y: 7, z: 100 },
      ],
      edges: [[0, 1]],
    };
    const edges = projectOrthographic(flat, identity());
    // Ребро [0,1] в 2D — вырождается в точку (5,7) на обоих концах.
    expect(edges[0].ax).toBeCloseTo(5, 6);
    expect(edges[0].ay).toBeCloseTo(7, 6);
    expect(edges[0].bx).toBeCloseTo(5, 6);
    expect(edges[0].by).toBeCloseTo(7, 6);
  });

  it('вращение сохраняет длину рёбер в 3D (rotateY)', () => {
    // До и после применения rotateY — 3D-расстояние между концами ребра сохраняется.
    const angle = 0.83;
    const t = rotateY(angle);
    for (const [i, j] of mesh.edges) {
      const a0 = mesh.vertices[i];
      const b0 = mesh.vertices[j];
      const d0 = dist3(a0, b0);
      const d1 = dist3(t(a0), t(b0));
      expect(d1).toBeCloseTo(d0, 6);
    }
  });

  it('вращение сохраняет длину рёбер в 3D (compose rotateX+rotateY)', () => {
    const t = compose(rotateX(0.5), rotateY(0.7), rotateZ(-0.3));
    for (const [i, j] of mesh.edges) {
      const a0 = mesh.vertices[i];
      const b0 = mesh.vertices[j];
      const d0 = dist3(a0, b0);
      const d1 = dist3(t(a0), t(b0));
      expect(Math.abs(d1 - d0)).toBeLessThan(EPS);
    }
  });
});
