import { describe, it, expect } from 'vitest';
import {
  meshBBox,
  maxExtent,
  validateMesh,
  type Mesh3D,
  type Vec3,
} from '../threed/Mesh3D';

/**
 * Тесты pure-logic 3D-меши (Mesh3D.ts).
 *
 * Покрываем:
 *   - meshBBox корректно считает min/max по 3 осям;
 *   - meshBBox пустой меши → вырожденный AABB (Infinity);
 *   - maxExtent — максимум по 3 осям;
 *   - validateMesh выбрасывает для невалидных индексов / пустых данных / петель.
 */

// Тестовая меша: единичный куб с половинами 1 (8 вершин, 12 рёбер).
const UNIT_CUBE: Mesh3D = {
  vertices: [
    { x: -1, y: -1, z: -1 }, // 0
    { x: 1, y: -1, z: -1 }, // 1
    { x: 1, y: 1, z: -1 }, // 2
    { x: -1, y: 1, z: -1 }, // 3
    { x: -1, y: -1, z: 1 }, // 4
    { x: 1, y: -1, z: 1 }, // 5
    { x: 1, y: 1, z: 1 }, // 6
    { x: -1, y: 1, z: 1 }, // 7
  ],
  edges: [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
    [4, 5],
    [5, 6],
    [6, 7],
    [7, 4],
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7],
  ],
};

describe('meshBBox', () => {
  it('считает min/max по 3 осям для единичного куба', () => {
    const b = meshBBox(UNIT_CUBE);
    expect(b.minX).toBe(-1);
    expect(b.minY).toBe(-1);
    expect(b.minZ).toBe(-1);
    expect(b.maxX).toBe(1);
    expect(b.maxY).toBe(1);
    expect(b.maxZ).toBe(1);
  });

  it('каждая размерность куба = 2 (от -1 до +1)', () => {
    const b = meshBBox(UNIT_CUBE);
    expect(b.maxX - b.minX).toBe(2);
    expect(b.maxY - b.minY).toBe(2);
    expect(b.maxZ - b.minZ).toBe(2);
  });

  it('пустая меша → вырожденный AABB (Infinity / -Infinity)', () => {
    const empty: Mesh3D = { vertices: [], edges: [] };
    const b = meshBBox(empty);
    expect(b.minX).toBe(Infinity);
    expect(b.maxX).toBe(-Infinity);
  });

  it('учитывает ненулевые смещения по всем осям', () => {
    const mesh: Mesh3D = {
      vertices: [
        { x: 10, y: -5, z: 3 },
        { x: 20, y: 5, z: -7 },
      ],
      edges: [[0, 1]],
    };
    const b = meshBBox(mesh);
    expect(b.minX).toBe(10);
    expect(b.maxX).toBe(20);
    expect(b.minY).toBe(-5);
    expect(b.maxY).toBe(5);
    expect(b.minZ).toBe(-7);
    expect(b.maxZ).toBe(3);
  });
});

describe('maxExtent', () => {
  it('для куба 2×2×2 возвращает 2', () => {
    expect(maxExtent(UNIT_CUBE)).toBe(2);
  });

  it('возвращает максимальную размерность (вытянутый бокс)', () => {
    const mesh: Mesh3D = {
      vertices: [
        { x: -50, y: -5, z: -2 },
        { x: 50, y: 5, z: 2 },
      ],
      edges: [[0, 1]],
    };
    // X = 100, Y = 10, Z = 4 → max = 100.
    expect(maxExtent(mesh)).toBe(100);
  });

  it('пустая меша → 0', () => {
    expect(maxExtent({ vertices: [], edges: [] })).toBe(0);
  });
});

describe('validateMesh', () => {
  it('принимает корректную мешу (без throw)', () => {
    expect(() => validateMesh(UNIT_CUBE)).not.toThrow();
  });

  it('выбрасывает для пустого vertices', () => {
    expect(() =>
      validateMesh({ vertices: [], edges: [[0, 1]] }),
    ).toThrow(/vertices/);
  });

  it('выбрасывает для пустого edges', () => {
    expect(() =>
      validateMesh({ vertices: [{ x: 0, y: 0, z: 0 }], edges: [] }),
    ).toThrow(/edges/);
  });

  it('выбрасывает, если индекс ребра превышает длину vertices', () => {
    const mesh: Mesh3D = {
      vertices: [
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
      ],
      edges: [[0, 5]], // 5 за пределами [0..1]
    };
    expect(() => validateMesh(mesh)).toThrow(/выходит за пределы/);
  });

  it('выбрасывает для отрицательного индекса', () => {
    const mesh: Mesh3D = {
      vertices: [
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
      ],
      edges: [[-1, 0]],
    };
    expect(() => validateMesh(mesh)).toThrow();
  });

  it('выбрасывает для вырожденного ребра (петли)', () => {
    const mesh: Mesh3D = {
      vertices: [
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
      ],
      edges: [
        [0, 0],
        [0, 1],
      ], // [0,0] — петля
    };
    expect(() => validateMesh(mesh)).toThrow(/вырожденное ребро|петля/);
  });

  it('принимает мешу с единственной вершиной в нескольких рёбрах (без петель)', () => {
    // Вершина может встречаться в нескольких рёбрах — это не петля.
    const v0: Vec3 = { x: 0, y: 0, z: 0 };
    const mesh: Mesh3D = {
      vertices: [
        v0,
        { x: 1, y: 0, z: 0 },
        { x: 0, y: 1, z: 0 },
      ],
      edges: [
        [0, 1],
        [0, 2],
      ],
    };
    expect(() => validateMesh(mesh)).not.toThrow();
  });
});
