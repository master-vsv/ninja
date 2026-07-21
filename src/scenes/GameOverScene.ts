import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/game';
import type { ScoreState } from '../game/ScoreState';
import type { LifeState } from '../game/LifeState';
import { defaultStorage } from '../persistence/Storage';
import { i18n } from '../i18n/I18n';
import { HUDScene } from './HUDScene';
import { CYBER, MONO_FONT, CyberpunkBackground, zpad } from './CyberpunkBackground';

/** Ключ соседней GameScene — невынесен в модуль, поэтому локальная константа. */
const GAME_KEY = 'GameScene';

/**
 * GameOverScene (фаза 4) — оверлей поверх паузенной GameScene. Версия CYBERPUNK NEON.
 *
 * Запускается через scene.launch('GameOverScene') из GameScene (когда пришёл
 * 'game-over'). GameScene при этом уже scene.pause('GameScene') — физика и ввод
 * остановлены, но кадр виден под полупрозрачным затемнением GameOverScene.
 *
 * Назначение (Cyberpunk Neon):
 *   - фон-сетка + полупрозрачное затемнение (overlay alpha 0.75);
 *   - заголовок "GAME OVER" — magenta glow с лёгкой glitch-пульсацией;
 *   - причина — dim cyan моноширинный;
 *   - score / hi-score — cyan / yellow;
 *   - кнопка [ RESTART ] — cyan неоновая кайма + glow.
 *
 * НЕ мгновенный — игрок должен успеть прочитать результат. Поэтому сцена
 * активна до явного нажатия Restart.
 *
 * Сцена НЕ переинициализирует shared state — это делает GameScene в create()
 * при restart.
 */
export class GameOverScene extends Phaser.Scene {
  /** Ключ сцены. */
  static readonly KEY = 'GameOverScene';

  /** Ключи реестра (см. GameScene / HUDScene). */
  private static readonly REG_LIFE_STATE = 'ndt:lifeState';
  private static readonly REG_SCORE_STATE = 'ndt:scoreState';
  private static readonly REG_GAMEOVER_REASON = 'ndt:gameOverReason';

  constructor() {
    super({ key: GameOverScene.KEY });
  }

  create(): void {
    // Cyberpunk Neon фон (grid + scanlines).
    CyberpunkBackground.add(this);
    // Полупрозрачное затемнение поверх GameScene.
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.75).setOrigin(0);

    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;

    // Получаем shared state из registry.
    const scoreState = this.registry.get(GameOverScene.REG_SCORE_STATE) as
      | ScoreState
      | undefined;
    const lifeState = this.registry.get(GameOverScene.REG_LIFE_STATE) as
      | LifeState
      | undefined;
    const reason = this.registry.get(GameOverScene.REG_GAMEOVER_REASON) as
      | string
      | undefined;

    const finalScore = scoreState?.score ?? 0;
    // Обновляем рекорд: max(текущий, новый). Возвращается итог.
    const newHi = defaultStorage.updateHiScore(finalScore);
    // Жизни на момент game over (для информативности).
    const livesLeft = lifeState?.lives ?? 0;

    // Заголовок — magenta glow.
    const title = this.add
      .text(cx, cy - 150, i18n.t('gameOver'), {
        fontFamily: MONO_FONT,
        fontSize: '64px',
        color: CYBER.magentaCss,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setShadow(0, 0, CYBER.magentaCss, 26, true, true);

    // VHS/glitch акцент: лёгкое смещение + микро-скалирование (tween yoyo).
    this.tweens.add({
      targets: title,
      x: { from: cx - 2, to: cx + 2 },
      scaleX: { from: 1, to: 1.02 },
      scaleY: { from: 1, to: 0.99 },
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });

    // Причина — dim cyan моноширинный (терминальный тон). Локализованная.
    const reasonText =
      reason === 'bomb' ? `> ${i18n.t('reasonBomb')}` : `> ${i18n.t('reasonNoLives')}`;
    this.add
      .text(cx, cy - 80, reasonText, {
        fontFamily: MONO_FONT,
        fontSize: '18px',
        color: CYBER.dimCyanCss,
      })
      .setOrigin(0.5)
      .setShadow(0, 0, CYBER.cyanCss, 4, false, true);

    // Финальный счёт — cyan glow. Локализованная метка ('СЧЁТ'/'SCORE').
    this.add
      .text(cx, cy - 30, `${i18n.t('score')}  ${zpad(finalScore, 6)}`, {
        fontFamily: MONO_FONT,
        fontSize: '36px',
        color: CYBER.cyanCss,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setShadow(0, 0, CYBER.cyanCss, 16, true, true);

    // Рекорд с пометкой NEW!, если побит. Локализованные метки ('РЕК'/'HI',
    // 'НОВЫЙ!'/'NEW!').
    const isNewRecord = finalScore > 0 && finalScore >= newHi;
    const hiLabel = isNewRecord
      ? `${i18n.t('hi')}  ${zpad(newHi, 4)}   ${i18n.t('newRecord')}`
      : `${i18n.t('hi')}  ${zpad(newHi, 4)}`;
    this.add
      .text(cx, cy + 20, hiLabel, {
        fontFamily: MONO_FONT,
        fontSize: '22px',
        color: CYBER.yellowCss,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setShadow(0, 0, CYBER.yellowCss, isNewRecord ? 16 : 8, true, true);

    // Доп.инфо: сколько жизний осталось. Локализованная фраза с плейсхолдером {n}.
    this.add
      .text(cx, cy + 60, i18n.t('livesLeft', { n: livesLeft }), {
        fontFamily: MONO_FONT,
        fontSize: '14px',
        color: CYBER.mutedCss,
      })
      .setOrigin(0.5);

    // Кнопка [ RESTART ] — cyan неоновая кайма + glow. Локализованная метка.
    const restartText = this.add
      .text(cx, cy + 130, `[ ${i18n.t('restart')} ]`, {
        fontFamily: MONO_FONT,
        fontSize: '28px',
        color: CYBER.whiteCss,
        fontStyle: 'bold',
        padding: { x: 28, y: 12 },
      })
      .setOrigin(0.5)
      .setShadow(0, 0, CYBER.cyanCss, 16, true, true);

    // Полупрозрачная панель-подложка с cyan-каймой.
    const restartPanel = this.add
      .rectangle(
        cx,
        cy + 130,
        restartText.width + 24,
        restartText.height + 12,
        CYBER.cyan,
        0.12,
      )
      .setStrokeStyle(2, CYBER.cyan, 0.95);
    restartText.setDepth(restartPanel.depth + 1);

    restartText.setInteractive({ useHandCursor: true });
    // Hover-эффект: текст и кайма вспыхивают ярче.
    restartText.on('pointerover', () => {
      restartText.setStyle({ color: CYBER.cyanCss });
      restartPanel.setStrokeStyle(3, CYBER.cyan, 1);
    });
    restartText.on('pointerout', () => {
      restartText.setStyle({ color: CYBER.whiteCss });
      restartPanel.setStrokeStyle(2, CYBER.cyan, 0.95);
    });
    restartText.on('pointerup', () => {
      this.restart();
    });

    // Enter/Space как альтернатива мыши (a11y).
    this.input.keyboard?.once('keydown-ENTER', () => this.restart());
    this.input.keyboard?.once('keydown-SPACE', () => this.restart());

    // Звуковой сопровождение game-over оверлея.
    this.playSound('game-over', 0.5);
    // При побитии рекорда — дополнительный звук 'new-best' с задержкой,
    // чтобы он не накладывался с 'game-over' в первые миллисекунды.
    if (isNewRecord) {
      this.time.delayedCall(450, () => this.playSound('new-best', 0.6));
    }
  }

  /**
   * Универсальный хелпер проигрывания звука в GameOver-оверлее.
   * Соблюдает mute-флаг ('ndt:mute' из MenuScene) и проверяет наличие ассета.
   * Не падает при ошибках аудио.
   */
  private playSound(key: string, volume: number): void {
    try {
      // Respect mute: флаг устанавливается в MenuScene, читается всеми сценами.
      if (this.registry.get('ndt:mute') === true) return;
      if (!this.game.cache.audio.exists(key)) return;
      this.sound.play(key, { volume });
    } catch {
      // Аудио может быть недоступно — оверлей всё равно должен работать.
    }
  }

  /**
   * Перезапуск: стопаем HUD и себя, стартуем GameScene заново.
   * GameScene была scene.stop (не pause) в handleGameOver → она в SHUTDOWN-статусе,
   * поэтому scene.start даёт гарантированный fresh create() с новым Clock и системами.
   */
  private restart(): void {
    this.scene.stop(HUDScene.KEY);
    this.scene.stop(GameOverScene.KEY);
    this.scene.start(GAME_KEY);
  }

  /**
   * Статический помощник для регистрации причины game over в registry.
   * GameScene вызывает перед scene.launch('GameOverScene').
   */
  static registerReason(
    registry: Phaser.Data.DataManager,
    reason: 'bomb' | 'no-lives',
  ): void {
    registry.set(GameOverScene.REG_GAMEOVER_REASON, reason);
  }
}
