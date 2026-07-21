import { describe, it, expect } from 'vitest';
import { NDT_MESHES } from '../threed/NDTMeshes';
import { maxExtent, meshBBox, validateMesh, type Mesh3D } from '../threed/Mesh3D';
import type { NDTObjectKind } from '../events/types';

/**
 * Тесты 3D-мешей NDT-объектов (NDTMeshes.ts).
 *
 * Покрываем для каждого из 14 видов (8 базовых + 3 power-up + 3 экипировки):
 *   - vertices.length > 0;
 *   - edges.length > 0;
 *   - все индексы рёбер в пределах vertices (через validateMesh);
 *   - габариты разумные (~30..200 px, согласованы с 2D-vertices);
 *   - центрированность (|min| ≈ |max| по каждой оси — центр в 0,0,0).
 *
 * Plus: карта NDT_MESHES содержит ровно 14 видов.
 */

const ALL_KINDS: ReadonlyArray<NDTObjectKind> = [
  'bolt',
  'nut',
  'ruler',
  'standard',
  'pipe',
  'probe',
  'magnet',
  'penetrant',
  'shrink',
  'grow',
  'slow',
  'helmet',
  'goggles',
  'weldingMask',
];

/** Допустимый диапазон максимального габарита (по любой оси). */
const MIN_EXTENT = 30;
const MAX_EXTENT = 200;

describe('NDT_MESHES', () => {
  it('содержит ровно 14 известных видов (8 базовых + 3 power-up + 3 экипировки)', () => {
    expect(Object.keys(NDT_MESHES).sort()).toEqual([...ALL_KINDS].sort());
  });

  it.each(ALL_KINDS)('«%s» имеет vertices.length > 0', (kind) => {
    const mesh: Mesh3D = NDT_MESHES[kind];
    expect(mesh.vertices.length).toBeGreaterThan(0);
  });

  it.each(ALL_KINDS)('«%s» имеет edges.length > 0', (kind) => {
    const mesh: Mesh3D = NDT_MESHES[kind];
    expect(mesh.edges.length).toBeGreaterThan(0);
  });

  it.each(ALL_KINDS)(
    '«%s»: все индексы рёбер в пределах vertices (validateMesh проходит)',
    (kind) => {
      expect(() => validateMesh(NDT_MESHES[kind])).not.toThrow();
    },
  );

  it.each(ALL_KINDS)(
    '«%s»: максимальный габарит в диапазоне [%d, %d] px',
    (kind) => {
      const ext = maxExtent(NDT_MESHES[kind]);
      expect(ext).toBeGreaterThanOrEqual(MIN_EXTENT);
      expect(ext).toBeLessThanOrEqual(MAX_EXTENT);
    },
  );

  it.each(ALL_KINDS)(
    '«%s» центрирован (|min| ≈ |max| по каждой оси, центр ≈ 0,0,0)',
    (kind) => {
      const b = meshBBox(NDT_MESHES[kind]);
      const cx = (b.minX + b.maxX) / 2;
      const cy = (b.minY + b.maxY) / 2;
      const cz = (b.minZ + b.maxZ) / 2;
      // Болт имеет длинный стержень вдоль +Z — допустим больший допуск по Z
      // (стержень асимметричен, центр bbox смещён в +Z).
      const tolXY = kind === 'bolt' ? 15 : 1;
      const tolZ = kind === 'bolt' ? 30 : 1;
      expect(Math.abs(cx)).toBeLessThan(tolXY);
      expect(Math.abs(cy)).toBeLessThan(tolXY);
      expect(Math.abs(cz)).toBeLessThan(tolZ);
    },
  );

  it('каждое ребро соединяет РАЗНЫЕ вершины (нет петель)', () => {
    for (const kind of ALL_KINDS) {
      const mesh = NDT_MESHES[kind];
      for (const [a, b] of mesh.edges) {
        expect(a).not.toBe(b);
      }
    }
  });

  it('bolt имеет hex-головку (≥12 вершин: 6 снизу + 6 сверху) + стержень', () => {
    // Головка одна — 12 вершин, плюс стержень — ещё 8 (бокс). Итого ≥ 12.
    const bolt = NDT_MESHES.bolt;
    expect(bolt.vertices.length).toBeGreaterThanOrEqual(12);
  });

  it('bolt имеет длинный стержень (Z-габарит > X и Y)', () => {
    // Стержень удлинён вдоль +Z — Z-габарит больше поперечника головки.
    const b = meshBBox(NDT_MESHES.bolt);
    const dx = b.maxX - b.minX;
    const dy = b.maxY - b.minY;
    const dz = b.maxZ - b.minZ;
    expect(dz).toBeGreaterThan(dx);
    expect(dz).toBeGreaterThan(dy);
  });

  it('nut имеет отверстие (≥28 вершин: внешняя призма 12 + внутреннее кольцо 16)', () => {
    // Внешний шестигранник = 12 (6+6), внутренний 8-гранник = 16 (8+8). Итого 28.
    expect(NDT_MESHES.nut.vertices.length).toBeGreaterThanOrEqual(28);
  });

  it('ruler вытянут вдоль X (X-габарит > Y и Z)', () => {
    const b = meshBBox(NDT_MESHES.ruler);
    const dx = b.maxX - b.minX;
    const dy = b.maxY - b.minY;
    const dz = b.maxZ - b.minZ;
    expect(dx).toBeGreaterThan(dy);
    expect(dx).toBeGreaterThan(dz);
  });

  it('standard — куб (все три габарита равны)', () => {
    const b = meshBBox(NDT_MESHES.standard);
    const dx = b.maxX - b.minX;
    const dy = b.maxY - b.minY;
    const dz = b.maxZ - b.minZ;
    expect(dx).toBeCloseTo(dy, 6);
    expect(dy).toBeCloseTo(dz, 6);
  });

  it('pipe вытянут вдоль X (горизонтальный цилиндр)', () => {
    const b = meshBBox(NDT_MESHES.pipe);
    const dx = b.maxX - b.minX;
    const dy = b.maxY - b.minY;
    const dz = b.maxZ - b.minZ;
    expect(dx).toBeGreaterThan(dy);
    expect(dx).toBeGreaterThan(dz);
  });

  it('pipe имеет ≥16 вершин (8-гранный цилиндр: 8+8)', () => {
    expect(NDT_MESHES.pipe.vertices.length).toBeGreaterThanOrEqual(16);
  });

  it('probe состоит из 8-гранной головки + бокса-ручки (≥24 вершин)', () => {
    // Головка: 8-гранная призма = 16 вершин (8+8). Ручка: бокс = 8. Итого 24.
    expect(NDT_MESHES.probe.vertices.length).toBeGreaterThanOrEqual(24);
  });

  it('probe вытянут вдоль Y (Y-габарит > X и Z — ручка-кабель)', () => {
    const b = meshBBox(NDT_MESHES.probe);
    const dx = b.maxX - b.minX;
    const dy = b.maxY - b.minY;
    const dz = b.maxZ - b.minZ;
    expect(dy).toBeGreaterThan(dx);
    expect(dy).toBeGreaterThan(dz);
  });

  it('magnet состоит из 3 боксов-полюсов+перемычки (≥24 вершин)', () => {
    // 3 бокса × 8 вершин = 24.
    expect(NDT_MESHES.magnet.vertices.length).toBeGreaterThanOrEqual(24);
  });

  it('magnet шире вдоль X, чем по Y (П-форма с разнесёнными полюсами)', () => {
    const b = meshBBox(NDT_MESHES.magnet);
    const dx = b.maxX - b.minX;
    const dy = b.maxY - b.minY;
    expect(dx).toBeGreaterThanOrEqual(dy);
  });

  it('penetrant состоит из тела-призмы + шипа-бокса (≥24 вершин)', () => {
    // Тело: 8-гранная призма = 16. Шип: бокс = 8. Итого 24.
    expect(NDT_MESHES.penetrant.vertices.length).toBeGreaterThanOrEqual(24);
  });

  it('penetrant вытянут вдоль Y (Y-габарит > X — капля с хвостиком)', () => {
    const b = meshBBox(NDT_MESHES.penetrant);
    const dx = b.maxX - b.minX;
    const dy = b.maxY - b.minY;
    expect(dy).toBeGreaterThan(dx);
  });

  it('shrink (power-up) — октаэдр с ≥6 вершин и 12 рёбер', () => {
    const m = NDT_MESHES.shrink;
    expect(m.vertices.length).toBeGreaterThanOrEqual(6);
    expect(m.edges.length).toBeGreaterThanOrEqual(12);
  });

  it('shrink (power-up) — ромб в XY: X- и Y-габариты равны', () => {
    const b = meshBBox(NDT_MESHES.shrink);
    const dx = b.maxX - b.minX;
    const dy = b.maxY - b.minY;
    expect(dx).toBeCloseTo(dy, 6);
  });

  it('grow (power-up) — 5-гранная призма с 10 вершин', () => {
    const m = NDT_MESHES.grow;
    expect(m.vertices.length).toBeGreaterThanOrEqual(10);
  });

  it('slow (power-up) — кристалл-бипирамида с 8 вершин', () => {
    const m = NDT_MESHES.slow;
    expect(m.vertices.length).toBeGreaterThanOrEqual(8);
  });

  it.each(['shrink', 'grow', 'slow'] as const)(
    'power-up «%s» центрирован (|min| ≈ |max| по каждой оси)',
    (kind) => {
      const b = meshBBox(NDT_MESHES[kind]);
      const cx = (b.minX + b.maxX) / 2;
      const cy = (b.minY + b.maxY) / 2;
      const cz = (b.minZ + b.maxZ) / 2;
      expect(Math.abs(cx)).toBeLessThan(1);
      expect(Math.abs(cy)).toBeLessThan(1);
      expect(Math.abs(cz)).toBeLessThan(1);
    },
  );

  // --- NDT-фигуры экипировки (3 новых power-up) ---

  it('helmet (shield) состоит из купола-призмы + козырька-бокса (≥24 вершин)', () => {
    // Купол: 8-гранная призма = 16 (8+8). Козырёк: бокс = 8. Итого ≥ 24.
    expect(NDT_MESHES.helmet.vertices.length).toBeGreaterThanOrEqual(24);
  });

  it('helmet шире вдоль X, чем вдоль Z (плоский купол)', () => {
    const b = meshBBox(NDT_MESHES.helmet);
    const dx = b.maxX - b.minX;
    const dz = b.maxZ - b.minZ;
    expect(dx).toBeGreaterThan(dz);
  });

  it('helmet центрирован (|min| ≈ |max| по каждой оси)', () => {
    const b = meshBBox(NDT_MESHES.helmet);
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    const cz = (b.minZ + b.maxZ) / 2;
    expect(Math.abs(cx)).toBeLessThan(1);
    expect(Math.abs(cy)).toBeLessThan(1);
    expect(Math.abs(cz)).toBeLessThan(1);
  });

  it('goggles (grow) состоит из 2 линз + перемычки (≥40 вершин)', () => {
    // 2 призмы по 16 (8+8) + бокс-перемычка 8 = 40.
    expect(NDT_MESHES.goggles.vertices.length).toBeGreaterThanOrEqual(40);
  });

  it('goggles шире вдоль X, чем вдоль Y (горизонтальная раскладка)', () => {
    const b = meshBBox(NDT_MESHES.goggles);
    const dx = b.maxX - b.minX;
    const dy = b.maxY - b.minY;
    expect(dx).toBeGreaterThan(dy);
  });

  it('goggles центрирован (|min| ≈ |max| по каждой оси)', () => {
    const b = meshBBox(NDT_MESHES.goggles);
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    const cz = (b.minZ + b.maxZ) / 2;
    expect(Math.abs(cx)).toBeLessThan(1);
    expect(Math.abs(cy)).toBeLessThan(1);
    expect(Math.abs(cz)).toBeLessThan(1);
  });

  it('weldingMask (slow) состоит из корпуса + стекла (≥16 вершин)', () => {
    // Корпус-бокс = 8. Стекло-бокс = 8. Итого ≥ 16.
    expect(NDT_MESHES.weldingMask.vertices.length).toBeGreaterThanOrEqual(16);
  });

  it('weldingMask вытянут вдоль Y (высокий корпус маски)', () => {
    const b = meshBBox(NDT_MESHES.weldingMask);
    const dx = b.maxX - b.minX;
    const dy = b.maxY - b.minY;
    expect(dy).toBeGreaterThanOrEqual(dx);
  });

  it('weldingMask центрирован по X/Y (допуск 1)', () => {
    // Z может быть слегка смещён из-за стекла (薄的 оффсет ~1 px по +Z).
    const b = meshBBox(NDT_MESHES.weldingMask);
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    expect(Math.abs(cx)).toBeLessThan(1);
    expect(Math.abs(cy)).toBeLessThan(1);
  });

  it.each(['helmet', 'goggles', 'weldingMask'] as const)(
    'экипировка «%s» проходит validateMesh (индексы рёбер в пределах)',
    (kind) => {
      expect(() => validateMesh(NDT_MESHES[kind])).not.toThrow();
    },
  );

  it.each(['helmet', 'goggles', 'weldingMask'] as const)(
    'экипировка «%s» имеет максимальный габарит ≥ 30 px',
    (kind) => {
      expect(maxExtent(NDT_MESHES[kind])).toBeGreaterThanOrEqual(30);
    },
  );
});
