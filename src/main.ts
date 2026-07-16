import Phaser from 'phaser';
import decomp from 'poly-decomp';
import { gameConfig } from './config/game';

/**
 * Точка входа NDT-Ninja.
 *
 * Перед созданием Phaser.Game регистрируем poly-decomp глобально (window.decomp).
 * Matter.Bodies.fromVertices требует poly-decomp для разложения вогнутых полигонов
 * на выпуклые (BodySplitter в фазе 3 использует fromVertices для фрагментов после
 * разреза — они могут оказаться вогнутыми). Без регистрации Matter берёт выпуклую
 * оболочку как fallback, что портит геометрию.
 *
 * Доступные способы регистрации:
 *   - window.decomp = decomp (используем — Matter Common.getDecomp проверяет global).
 *   - Phaser.Physics.Matter.Matter.Common.setDecomp(decomp) — альтернатива.
 */
function registerPolyDecomp(): void {
  if (typeof window !== 'undefined') {
    (window as unknown as { decomp: unknown }).decomp = decomp;
  }
}

window.addEventListener('load', () => {
  registerPolyDecomp();
  // Debug-expose game instance для e2e-тестирования через Playwright.
  // На production-поведение не влияет.
  const game = new Phaser.Game(gameConfig);
  (window as unknown as { __ndtGame?: Phaser.Game }).__ndtGame = game;
});
