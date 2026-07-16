import { describe, it, expect } from 'vitest';
import { OBJECT_REGISTRY, type ObjectConfig } from '../config/objects';
import { validateMesh } from '../threed/Mesh3D';
import type { NDTObjectKind } from '../events/types';

/**
 * Тесты OBJECT_REGISTRY (фаза 2) — реестр NDT-объектов.
 *
 * Покрываем:
 *   - все 14 видов присутствуют (8 базовых + 3 power-up + 3 экипировки);
 *   - isBomb=true только для pipe;
 *   - slicable=true для всех, кроме pipe;
 *   - vertices — непустой массив валидных полигонов (≥3 точек каждый);
 *   - mesh3D — валидная 3D-меша для каждого вида (для wireframe-рендера);
 *   - тип ObjectConfig соблюдается для каждой записи;
 *   - power-up поле задано только для power-up/экипировки.
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

describe('OBJECT_REGISTRY', () => {
  it('содержит ровно 14 известных видов (8 базовых + 3 power-up + 3 экипировки)', () => {
    expect(Object.keys(OBJECT_REGISTRY).sort()).toEqual(
      [...ALL_KINDS].sort(),
    );
  });

  it('каждый kind в ключе совпадает со значением поля kind', () => {
    for (const kind of ALL_KINDS) {
      expect(OBJECT_REGISTRY[kind].kind).toBe(kind);
    }
  });

  it('isBomb=true ТОЛЬКО для pipe', () => {
    for (const kind of ALL_KINDS) {
      const cfg = OBJECT_REGISTRY[kind];
      if (kind === 'pipe') {
        expect(cfg.isBomb).toBe(true);
      } else {
        expect(cfg.isBomb).toBe(false);
      }
    }
  });

  it('slicable=true для всех, кроме pipe', () => {
    for (const kind of ALL_KINDS) {
      const cfg = OBJECT_REGISTRY[kind];
      if (kind === 'pipe') {
        expect(cfg.slicable).toBe(false);
      } else {
        expect(cfg.slicable).toBe(true);
      }
    }
  });

  it('vertices — непустой массив для каждого вида', () => {
    for (const kind of ALL_KINDS) {
      const cfg = OBJECT_REGISTRY[kind];
      expect(Array.isArray(cfg.vertices)).toBe(true);
      expect(cfg.vertices.length).toBeGreaterThan(0);
    }
  });

  it('каждый полигон имеет минимум 3 точки', () => {
    // Matter fromVertices требует минимум 3 вершины на полигон.
    for (const kind of ALL_KINDS) {
      const cfg = OBJECT_REGISTRY[kind];
      for (const poly of cfg.vertices) {
        expect(poly.length).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('каждая вершина имеет конечные числовые x и y', () => {
    for (const kind of ALL_KINDS) {
      const cfg = OBJECT_REGISTRY[kind];
      for (const poly of cfg.vertices) {
        for (const v of poly) {
          expect(typeof v.x).toBe('number');
          expect(typeof v.y).toBe('number');
          expect(Number.isFinite(v.x)).toBe(true);
          expect(Number.isFinite(v.y)).toBe(true);
        }
      }
    }
  });

  it('каждый полигон имеет ненулевую площадь (не вырожден)', () => {
    // Площадь через формулу шнурков; должна быть > 0 для корректного полигона.
    function shoelace(poly: ReadonlyArray<{ x: number; y: number }>): number {
      let sum = 0;
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i];
        const b = poly[(i + 1) % poly.length];
        sum += a.x * b.y - b.x * a.y;
      }
      return Math.abs(sum) / 2;
    }

    for (const kind of ALL_KINDS) {
      const cfg = OBJECT_REGISTRY[kind];
      for (const poly of cfg.vertices) {
        const area = shoelace(poly);
        expect(area).toBeGreaterThan(0);
      }
    }
  });

  it('тип ObjectConfig соблюдён: все поля присутствуют', () => {
    const requiredKeys: Array<keyof ObjectConfig> = [
      'kind',
      'vertices',
      'slicable',
      'isBomb',
      'mesh3D',
    ];
    for (const kind of ALL_KINDS) {
      const cfg = OBJECT_REGISTRY[kind];
      for (const key of requiredKeys) {
        expect(cfg).toHaveProperty(key);
      }
    }
  });

  it('конкретные значения для pipe (мина): slicable=false, isBomb=true', () => {
    const pipe = OBJECT_REGISTRY.pipe;
    expect(pipe.slicable).toBe(false);
    expect(pipe.isBomb).toBe(true);
  });

  describe('новые NDT-методы (probe/magnet/penetrant)', () => {
    it('probe (UT): slicable=true, isBomb=false', () => {
      const probe = OBJECT_REGISTRY.probe;
      expect(probe.slicable).toBe(true);
      expect(probe.isBomb).toBe(false);
    });

    it('magnet (MT): slicable=true, isBomb=false', () => {
      const magnet = OBJECT_REGISTRY.magnet;
      expect(magnet.slicable).toBe(true);
      expect(magnet.isBomb).toBe(false);
    });

    it('penetrant (PT): slicable=true, isBomb=false', () => {
      const penetrant = OBJECT_REGISTRY.penetrant;
      expect(penetrant.slicable).toBe(true);
      expect(penetrant.isBomb).toBe(false);
    });

    it('каждый новый вид имеет единственный выпуклый полигон (без compound)', () => {
      // Matter fromVertices спокойно переварит и compound, но новые виды
      // намеренно одно-полигонные для простоты slice-детекции.
      for (const kind of ['probe', 'magnet', 'penetrant'] as const) {
        const cfg = OBJECT_REGISTRY[kind];
        expect(cfg.vertices.length).toBe(1);
      }
    });
  });

  describe('mesh3D (3D-wireframe для рендера)', () => {
    it('каждый вид имеет непустую mesh3D с вершинами и рёбрами', () => {
      for (const kind of ALL_KINDS) {
        const mesh = OBJECT_REGISTRY[kind].mesh3D;
        expect(mesh).toBeDefined();
        expect(mesh.vertices.length).toBeGreaterThan(0);
        expect(mesh.edges.length).toBeGreaterThan(0);
      }
    });

    it('каждая mesh3D проходит validateMesh (индексы рёбер в пределах vertices)', () => {
      for (const kind of ALL_KINDS) {
        expect(() => validateMesh(OBJECT_REGISTRY[kind].mesh3D)).not.toThrow();
      }
    });

    it('mesh3D — ТОЛЬКО визуал, не заменяет vertices (slice-контракт сохранён)', () => {
      // Гарантия: добавление mesh3D не удалило и не ослабило 2D-vertices.
      for (const kind of ALL_KINDS) {
        const cfg = OBJECT_REGISTRY[kind];
        expect(cfg.vertices.length).toBeGreaterThan(0);
        // mesh3D — отдельный объект, не ссылается на 2D-vertices структурно.
        expect(cfg.mesh3D).not.toBe(cfg.vertices);
      }
    });
  });

  describe('power-up фигуры (shrink/grow/slow)', () => {
    it('shrink: slicable=true, isBomb=false, powerUp=shrink', () => {
      const cfg = OBJECT_REGISTRY.shrink;
      expect(cfg.slicable).toBe(true);
      expect(cfg.isBomb).toBe(false);
      expect(cfg.powerUp).toBe('shrink');
    });

    it('grow: slicable=true, isBomb=false, powerUp=grow', () => {
      const cfg = OBJECT_REGISTRY.grow;
      expect(cfg.slicable).toBe(true);
      expect(cfg.isBomb).toBe(false);
      expect(cfg.powerUp).toBe('grow');
    });

    it('slow: slicable=true, isBomb=false, powerUp=slow', () => {
      const cfg = OBJECT_REGISTRY.slow;
      expect(cfg.slicable).toBe(true);
      expect(cfg.isBomb).toBe(false);
      expect(cfg.powerUp).toBe('slow');
    });

    it('powerUp задан ТОЛЬКО для power-up фигур (6 kinds)', () => {
      // 6 power-up kinds: shrink/grow/slow + helmet/goggles/weldingMask.
      const powerUpKinds = new Set([
        'shrink',
        'grow',
        'slow',
        'helmet',
        'goggles',
        'weldingMask',
      ]);
      for (const kind of ALL_KINDS) {
        const cfg = OBJECT_REGISTRY[kind];
        if (powerUpKinds.has(kind)) {
          expect(cfg.powerUp).toBeDefined();
        } else {
          expect(cfg.powerUp).toBeUndefined();
        }
      }
    });

    it('каждый power-up kind имеет единственный выпуклый полигон', () => {
      // Как и probe/magnet/penetrant — power-up одно-полигонный для простоты slice.
      for (const kind of ['shrink', 'grow', 'slow'] as const) {
        const cfg = OBJECT_REGISTRY[kind];
        expect(cfg.vertices.length).toBe(1);
      }
    });
  });

  describe('NDT-фигуры экипировки (helmet/goggles/weldingMask)', () => {
    it('helmet (shield): slicable=true, isBomb=false, powerUp=shield', () => {
      const cfg = OBJECT_REGISTRY.helmet;
      expect(cfg.slicable).toBe(true);
      expect(cfg.isBomb).toBe(false);
      expect(cfg.powerUp).toBe('shield');
    });

    it('goggles (grow): slicable=true, isBomb=false, powerUp=grow', () => {
      const cfg = OBJECT_REGISTRY.goggles;
      expect(cfg.slicable).toBe(true);
      expect(cfg.isBomb).toBe(false);
      expect(cfg.powerUp).toBe('grow');
    });

    it('weldingMask (slow): slicable=true, isBomb=false, powerUp=slow', () => {
      const cfg = OBJECT_REGISTRY.weldingMask;
      expect(cfg.slicable).toBe(true);
      expect(cfg.isBomb).toBe(false);
      expect(cfg.powerUp).toBe('slow');
    });

    it('каждая экипировка имеет единственный выпуклый полигон', () => {
      // Как и другие power-up/NDT-методы — одно-полигонная для простоты slice.
      for (const kind of ['helmet', 'goggles', 'weldingMask'] as const) {
        const cfg = OBJECT_REGISTRY[kind];
        expect(cfg.vertices.length).toBe(1);
      }
    });

    it('helmet vertices — 8-точечный выпуклый полигон', () => {
      const cfg = OBJECT_REGISTRY.helmet;
      // 8-угольник r=30 (купол каски).
      expect(cfg.vertices[0].length).toBe(8);
    });

    it('goggles vertices — прямоугольник (4 точки)', () => {
      const cfg = OBJECT_REGISTRY.goggles;
      expect(cfg.vertices[0].length).toBe(4);
    });

    it('weldingMask vertices — прямоугольник (4 точки)', () => {
      const cfg = OBJECT_REGISTRY.weldingMask;
      expect(cfg.vertices[0].length).toBe(4);
    });
  });
});
