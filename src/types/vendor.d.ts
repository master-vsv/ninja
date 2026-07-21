/**
 * Ambient-типы для библиотек polyk и poly-decomp.
 *
 * polyk (модуль polyk@0.24):
 *   - Полигон в flat-формате [x1,y1,x2,y2,...] (number[]).
 *   - Slice(polygon, startX, startY, endX, endY) → number[][] (массив плоских полигонов).
 *
 * poly-decomp (модуль poly-decomp@0.3):
 *   - Полигон в формате массива точек [[x,y], [x,y], ...].
 *   - decomp(polygon) и quickDecomp(polygon, ...) возвращают массив полигонов
 *     (каждый полигон — массив точек).
 *   - Регистрация для Matter.js: window.decomp = decomp либо
 *     Phaser.Physics.Matter.Matter.Common.setDecomp(decomp).
 */

declare module 'polyk' {
  /** Плоский полигон PolyK: [x1, y1, x2, y2, ...]. */
  export type PolyPolygon = number[];

  /** AABB-прямоугольник. */
  export interface AABB {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  }

  export interface RaycastResult {
    readonly dist: number;
    readonly edge: number;
    readonly norm: { readonly x: number; readonly y: number };
    readonly refl: { readonly x: number; readonly y: number };
  }

  export interface ClosestEdgeResult {
    readonly dist: number;
    readonly edge: number;
    readonly point: { readonly x: number; readonly y: number };
    readonly norm: { readonly x: number; readonly y: number };
  }

  export interface PolyKStatic {
    /** Разрезает полигон отрезком (startX,startY)-(endX,endY). Возвращает массив полигонов. */
    Slice(
      polygon: number[],
      startX: number,
      startY: number,
      endX: number,
      endY: number,
    ): PolyPolygon[];
    /** Проверяет, находится ли точка внутри полигона. */
    ContainsPoint(polygon: number[], x: number, y: number): boolean;
    /** Выпуклый ли полигон. */
    IsConvex(polygon: number[]): boolean;
    /** Площадь полигона. */
    GetArea(polygon: number[]): number;
    /** AABB полигона. */
    GetAABB(polygon: number[]): AABB;
    /** Простая ли проверка (рёбра не пересекаются). */
    IsSimple(polygon: number[]): boolean;
    /** Триангуляция полигона. */
    Triangulate(polygon: number[]): PolyPolygon[];
    /** Рейкаст внутри полигона. */
    Raycast(
      polygon: number[],
      originX: number,
      originY: number,
      directionX: number,
      directionY: number,
    ): RaycastResult | null;
    /** Ближайшее ребро к точке. */
    ClosestEdge(polygon: number[], x: number, y: number): ClosestEdgeResult | null;
    /** Разворот порядка вершин. */
    Reverse(polygon: number[]): void;
  }

  const PolyK: PolyKStatic;
  export default PolyK;
}

declare module 'poly-decomp' {
  /**
   * Точка полигона в формате [x, y]. poly-decomp использует массивы, не объекты.
   */
  export type DecompPoint = [number, number];

  /** Полигон: массив точек [[x, y], ...]. */
  export type DecompPolygon = DecompPoint[];

  export interface DecompStatic {
    /**
     * Полная декомпозиция (оптимальная, O(N^4)). Возвращает массив выпуклых полигонов.
     */
    decomp(polygon: DecompPolygon): DecompPolygon[];
    /**
     * Быстрая декомпозиция. Возвращает массив выпуклых полигонов.
     * Используется Matter.js для fromVertices.
     */
    quickDecomp(
      polygon: DecompPolygon,
      result?: DecompPolygon[],
      reflexVertices?: DecompPoint[],
      steinerPoints?: DecompPoint[],
      delta?: number,
      maxlevel?: number,
      level?: number,
    ): DecompPolygon[];
    /** Простой ли полигон (рёбра не пересекаются). */
    isSimple(polygon: DecompPolygon): boolean;
    /** Удаление коллинеарных точек. Возвращает число удалённых. */
    removeCollinearPoints(polygon: DecompPolygon, precision?: number): number;
    /** Удаление дубликатов точек. */
    removeDuplicatePoints(polygon: DecompPolygon, precision?: number): void;
    /** Делает порядок вершин CCW. Возвращает true, если порядок был изменён. */
    makeCCW(polygon: DecompPolygon): boolean;
  }

  const decomp: DecompStatic;
  export default decomp;
}
