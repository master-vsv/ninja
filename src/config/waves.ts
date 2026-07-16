/**
 * Конфигурация волн (заглушка фазы 0). Параметры как метрики — фаза 6.
 */
export interface WaveConfig {
  /** Спавн-рейт, объектов/сек. */
  readonly spawnRate: number;
  /** Доля труб-бомб в волне [0..1]. */
  readonly bombPercent: number;
  /** Базовая стартовая скорость, px/сек. */
  readonly baseSpeed: number;
  /** Длительность волны до перехода, сек. */
  readonly waveDuration: number;
}

/** Плейсхолдер первой волны. Реальная кривая сложности — фаза 6. */
export const WAVES: ReadonlyArray<WaveConfig> = [
  { spawnRate: 0.8, bombPercent: 0.1, baseSpeed: 600, waveDuration: 30 },
];
