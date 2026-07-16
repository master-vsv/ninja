/**
 * FragmentPool (фаза 7) — pure-logic пул переиспользуемых объектов.
 *
 * Назначение (план, фаза 7 «полировка + перф»): избежать new/destroy на каждый
 * slice. BodySplitter создаёт фрагменты при разрезе и удаляет их при деспавне —
 * переиспользование объектов снижает давление на GC.
 *
 * Контракт:
 *   - acquire() → элемент из пула (LIFO) ИЛИ новый через factory;
 *   - release(item) → вернуть в пул. true если принят, false если пул полон;
 *   - size ограничен maxSize (при превышении release возвращает false, элемент NOT added);
 *   - clear()/reset() — опустошить пул (без уничтожения элементов — жизненный цикл
 *     самих T владеет вызывающий код; пул хранит только ссылки).
 *
 * Пул НЕ Владеет элементами и НЕ вызывает их очистку: ответственность за освобождение
 * ресурсов (Phaser body/sprite и т.п.) лежит на владельце пула (см. BodySplitter).
 *
 * Модуль НЕ зависит от Phaser — дженерик по T. Тестируется в чистом окружении.
 */

/** Размер пула по умолчанию (крышка аллокаций под типичный геймплей). */
const DEFAULT_MAX_POOL_SIZE = 64;

/**
 * Дженерик-пул объектов. T — любой ссылочный тип (number[] не подходит как пулируемый,
 * но формально допускается; пул работает с ссылками, не валидирует содержимое).
 *
 * LIFO-порядок: acquire возвращает последний освобождённый элемент (локальность кэша,
 * меньше сканирования). Не потокобезопасен — Single-threaded JS.
 */
export class FragmentPool<T> {
  /** Стек свободных элементов (LIFO). */
  private readonly stack: T[] = [];
  private readonly _maxSize: number;
  private readonly factory: () => T;

  /**
   * @param factory фабрика новых элементов (вызывается при пустом пуле).
   * @param maxSize максимальный размер пула (крышка памяти). По умолчанию 64.
   */
  constructor(factory: () => T, maxSize: number = DEFAULT_MAX_POOL_SIZE) {
    this._maxSize = Math.max(0, Math.floor(maxSize));
    this.factory = factory;
  }

  /** Текущее число свободных элементов в пуле. */
  get size(): number {
    return this.stack.length;
  }

  /** Максимальная ёмкость пула. */
  get maxSize(): number {
    return this._maxSize;
  }

  /**
   * Получить элемент: из пула (LIFO) или новый через factory.
   * ВАЖНО: возвращённый элемент исключается из пула (size уменьшается).
   */
  acquire(): T {
    return this.stack.pop() ?? this.factory();
  }

  /**
   * Вернуть элемент в пул.
   * @returns true если принят, false если пул полон (элемент НЕ добавлен —
   *   вызывающий код должен сам освободить ресурсы элемента при false).
   */
  release(item: T): boolean {
    if (this.stack.length >= this._maxSize) {
      return false;
    }
    this.stack.push(item);
    return true;
  }

  /** Опустошить пул (ссылки выбрасываются; элементы НЕ уничтожаются). Идемпотентен. */
  clear(): void {
    this.stack.length = 0;
  }

  /** Сброс — алиас clear() (опустошает пул). Для семантической совместимости с другими state-классами. */
  reset(): void {
    this.clear();
  }
}
