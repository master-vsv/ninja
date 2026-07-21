/**
 * WaveConfig (фаза 6) — pure-logic параметры одной волны.
 *
 * Назначение (план, фаза 6, «Параметры волн (метрики)»):
 *   - spawnRate — частота спавна, объектов/сек (GameScene переводит в
 *     spawnTimer.delay = 1000 / spawnRate);
 *   - bombPercent — доля труб-бомб в волне [0..1] (SpawnDirector.spawnRandom);
 *   - speedMultiplier — множитель к SPEED_MULTIPLIER (1 = базовая скорость
 *     объектов SpawnDirector; НЕ заменяет SPEED_MULTIPLIER, а умножается НА него,
 *     чтобы не ломать position-Verlet ↔ Ballistics);
 *   - waveDuration — длительность волны в секундах до перехода на следующую.
 *
 * Единицы адаптированы под текущую кодовую базу:
 *   - SPEED_MULTIPLIER = 0.7 (SpawnDirector), baseline-интервал спавна 2500 мс
 *     (= 0.4 объектов/сек). Поэтому baseline-частоты волн — порядка 0.4–1.2/сек.
 *   - baseSpeed из плана (px/сек) НЕ используется: у нас скорость задаётся через
 *     SPEED_MULTIPLIER × Ballistics, поэтому вместо baseSpeed — speedMultiplier.
 *
 * Модуль НЕ зависит от Phaser. Phaser-обёртка — systems/SpawnDirector.ts +
 * scenes/GameScene.ts.
 */

/**
 * Параметры одной волны. Иммутабельный объект — безопасно передавать
 * в системы и кэшировать.
 */
export interface WaveConfig {
  /** Частота спавна, объектов/сек. > 0. */
  readonly spawnRate: number;
  /** Доля труб-бомб [0..1]. */
  readonly bombPercent: number;
  /**
   * Множитель к SPEED_MULTIPLIER объектов (1 = базовая скорость).
   * > 1 = объекты быстрее. НЕ заменяет SPEED_MULTIPLIER.
   */
  readonly speedMultiplier: number;
  /** Длительность волны до перехода на следующую, сек. > 0. */
  readonly waveDuration: number;
}

/**
 * Кривая эскалации волн — 5 шагов с монотонно растущей сложностью.
 *
 * Подобрано под аркадный темп NDT-Ninja (1280×720, SPEED_MULTIPLIER=0.7):
 *   - W1 — лёгкая (0.45/сек ≈ 2222 мс интервал, 10% bombs, базовая скорость);
 *   - W2 — +частота/сложность;
 *   - W3 — средняя (0.8/сек ≈ 1250 мс интервал, 15% bombs);
 *   - W4 — высокая (1.0/сек, 18% bombs, объекты на 15% быстрее);
 *   - W5 — жёсткая (1.2/сек, 20% bombs, объекты на 20% быстрее).
 *
 * Параметры вдохновлены примерами W1/W3 из плана, но адаптированы под наши
 * единицы (spawnRate как объектов/сек, speedMultiplier как множитель к
 * SPEED_MULTIPLIER вместо baseSpeed px/сек).
 */
export const WAVES: ReadonlyArray<WaveConfig> = [
  // W1 — старт: 1.0 объектов/сек (1000мс интервал), 10% bombs.
  { spawnRate: 1.0, bombPercent: 0.1, speedMultiplier: 1.0, waveDuration: 25 },
  // W2 — разгон.
  { spawnRate: 1.25, bombPercent: 0.12, speedMultiplier: 1.05, waveDuration: 25 },
  // W3 — средняя.
  { spawnRate: 1.5, bombPercent: 0.15, speedMultiplier: 1.1, waveDuration: 25 },
  // W4 — высокая.
  { spawnRate: 1.75, bombPercent: 0.18, speedMultiplier: 1.15, waveDuration: 25 },
  // W5 — жёсткая (2.0/сек, 20% bombs).
  { spawnRate: 2.0, bombPercent: 0.2, speedMultiplier: 1.2, waveDuration: 30 },
];
