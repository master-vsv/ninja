import PolyK from 'polyk';
import type { Polygon, Segment, Vec2 } from './Geometry';

/**
 * PolyKSlicer (фаза 3) — обёртка над PolyK.Slice.
 *
 * Назначение: разрезать выпуклый (или простой) полигон отрезком линии реза на 2 части.
 * PolyK работает в flat-формате [x1,y1,x2,y2,...], мы принимаем/возвращаем массив {x,y}.
 *
 * Контракт sliceConvex:
 *   - Успешный разрез: возвращает кортеж из 2 полигонов ([A, B]).
 *   - Линия не пересекает полигон / касается снаружи / один конец внутри → null.
 *   - Каждый выходной полигон имеет ≥ 3 вершин (иначе разрез некорректен).
 *
 * Примечание: имя «sliceConvex» историческое — PolyK.Slice работает с любым простым
 * полигоном, не только выпуклым. Но в нашем применении (NDT-объекты из OBJECT_REGISTRY)
 * входные полигоны выпуклые, а после разреза могут стать вогнутыми — для них есть
 * отдельный модуль Decomposer.
 *
 * Pure-logic: не импортирует Phaser.
 */

/** Минимальное число вершин в валидном полигоне. */
const MIN_VERTICES = 3;

/**
 * Разрезает полигон отрезком линии.
 *
 * @returns кортеж из 2 полигнов или null, если разрез не состоялся.
 */
export function sliceConvex(polygon: Polygon, line: Segment): [Polygon, Polygon] | null {
  if (polygon.length < MIN_VERTICES) return null;

  const flat = toFlat(polygon);
  // PolyK.Slice возвращает массив плоских полигонов. Если линия не пересекает
  // полигон (или один конец внутри, или касается ребра) — возвращается [original].
  const sliced = PolyK.Slice(
    flat,
    line.from.x,
    line.from.y,
    line.to.x,
    line.to.y,
  );

  // PolyK возвращает [original] в случаях:
  //   - нет пересечения;
  //   - линия только касается вершины без сквозного прохода;
  //   - один конец линии внутри полигона.
  // Для нашего контракта это null (нет полноценного разреза).
  if (!sliced || sliced.length < 2) return null;

  const polygons = sliced.map(fromFlat).filter((p) => p.length >= MIN_VERTICES);
  if (polygons.length < 2) return null;

  // Возвращаем первые 2 валидных полигона. PolyK для одного отрезка через
  // простой полигон даёт ровно 2 — но защищаемся от edge-case'ов.
  return [polygons[0], polygons[1]];
}

/** Конвертация Polygon → flat-формат PolyK [x1,y1,x2,y2,...]. */
function toFlat(poly: Polygon): number[] {
  const flat: number[] = [];
  for (const v of poly) {
    flat.push(v.x, v.y);
  }
  return flat;
}

/** Конвертация flat-формата PolyK → Polygon (массив {x,y}). */
function fromFlat(flat: number[]): Vec2[] {
  const result: Vec2[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) {
    result.push({ x: flat[i], y: flat[i + 1] });
  }
  return result;
}
