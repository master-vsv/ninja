import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/game';
import { runBenchmark } from '../benchmark/physics-bench';
import { defaultStorage } from '../persistence/Storage';
import { i18n, type Lang } from '../i18n/I18n';
import { CYBER, MONO_FONT, CyberpunkBackground, zpad } from './CyberpunkBackground';

/**
 * MenuScene (фаза 4 — финальная) — версия CYBERPUNK NEON.
 *
 * Показывает:
 *   - заголовок игры (cyan, glow, лёгкая пульсация);
 *   - подзаголовок-терминал с мигающим курсором "_";
 *   - кнопку [ PLAY ] — magenta неоновая кайма + glow;
 *   - текущий рекорд (yellow, "HI-SCORE: 0042");
 *   - mute-toggle (флаг в game.registry 'ndt:mute') — "[ SND: ON ]" / "[ SND: OFF ]";
 *   - переключатель языка RU/EN (i18n.setLang), сохраняется в localStorage;
 *   - отладочную кнопку запуска изолированного бенчмарка физдвижка (фаза 0).
 *
 * Mute-флаг читается FXSystem/BombSystem через game.registry — там, где
 * собираются играть звук. По умолчанию выключен (звук включён).
 *
 * Все видимые тексты локализованы через i18n.t(). При смене языка тексты
 * обновляются методом refreshTexts() (вызывается из клика по кнопке языка).
 */
export class MenuScene extends Phaser.Scene {
  /** Ключ реестра для mute-флага. */
  static readonly REG_MUTE = 'ndt:mute';

  /** Текущее состояние mute (читают системы при игре звука). */
  get isMuted(): boolean {
    return this.registry.get(MenuScene.REG_MUTE) === true;
  }

  /** Ссылка на BGM-трек для stop/pause при уходе со сцены или mute. */
  private bgm?: Phaser.Sound.BaseSound;

  /**
   * Ссылки на текстовые объекты для обновления при смене языка.
   * Заголовок не хранится — "NDT-NINJA" одинаков для всех языков.
   */
  private subtitleTextObj?: Phaser.GameObjects.Text;
  private cursor?: Phaser.GameObjects.Text;
  private playText?: Phaser.GameObjects.Text;
  private playPanel?: Phaser.GameObjects.Rectangle;
  private hiScoreTextObj?: Phaser.GameObjects.Text;
  private muteButton?: Phaser.GameObjects.Text;
  private langButton?: Phaser.GameObjects.Text;
  private benchButton?: Phaser.GameObjects.Text;
  private benchHint?: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'MenuScene' });
  }

  create(): void {
    // Инициализация mute-флага (один раз за сессию).
    if (this.registry.get(MenuScene.REG_MUTE) === undefined) {
      this.registry.set(MenuScene.REG_MUTE, false);
    }

    // Cyberpunk Neon фон: grid + scanlines (depth 0).
    CyberpunkBackground.add(this);

    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;

    // Заголовок игры — cyan, моноширинный, glow (setShadow с fill=true).
    const title = this.add
      .text(cx, cy - 180, i18n.t('title'), {
        fontFamily: MONO_FONT,
        fontSize: '72px',
        color: CYBER.cyanCss,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setShadow(0, 0, CYBER.cyanCss, 24, true, true);

    // Лёгкая пульсация свечения заголовка (tween alpha).
    this.tweens.add({
      targets: title,
      alpha: { from: 1, to: 0.82 },
      duration: 1100,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });

    // Подзаголовок-терминал: dim cyan, UPPERCASE. Локализованный текст
    // приводится к верхнему регистру для терминального стиля (кириллица и латиница).
    this.subtitleTextObj = this.add
      .text(cx, cy - 120, i18n.t('subtitle').toUpperCase(), {
        fontFamily: MONO_FONT,
        fontSize: '18px',
        color: CYBER.dimCyanCss,
      })
      .setOrigin(0.5)
      .setShadow(0, 0, CYBER.cyanCss, 4, false, true);

    // Мигающий курсор "_" справа от подзаголовка — терминальный акцент.
    // Позиция вычисляется по ширине подзаголовка (адаптируется к языку).
    this.cursor = this.add
      .text(cx + this.subtitleTextObj.width / 2 + 10, cy - 120, '_', {
        fontFamily: MONO_FONT,
        fontSize: '20px',
        color: CYBER.cyanCss,
      })
      .setOrigin(0.5)
      .setShadow(0, 0, CYBER.cyanCss, 6, false, true);
    this.tweens.add({
      targets: this.cursor,
      alpha: { from: 1, to: 0.1 },
      duration: 480,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });

    // Кнопка [ PLAY ] — magenta неоновая кайма + glow.
    this.playText = this.add
      .text(cx, cy - 30, `[ ${i18n.t('play')} ]`, {
        fontFamily: MONO_FONT,
        fontSize: '32px',
        color: CYBER.whiteCss,
        fontStyle: 'bold',
        padding: { x: 32, y: 14 },
      })
      .setOrigin(0.5)
      .setShadow(0, 0, CYBER.magentaCss, 18, true, true);

    // Полупрозрачная панель-подложка с magenta-каймой (создаётся после text,
    // чтобы корректно прочитать его размеры).
    this.playPanel = this.add
      .rectangle(
        cx,
        cy - 30,
        this.playText.width + 24,
        this.playText.height + 12,
        CYBER.magenta,
        0.12,
      )
      .setStrokeStyle(2, CYBER.magenta, 0.95);
    this.playText.setDepth(this.playPanel.depth + 1);

    this.playText.setInteractive({ useHandCursor: true });
    // Hover-эффект: текст и кайма вспыхивают ярче.
    this.playText.on('pointerover', () => {
      this.playText!.setStyle({ color: CYBER.magentaCss });
      this.playPanel!.setStrokeStyle(3, CYBER.magenta, 1);
    });
    this.playText.on('pointerout', () => {
      this.playText!.setStyle({ color: CYBER.whiteCss });
      this.playPanel!.setStrokeStyle(2, CYBER.magenta, 0.95);
    });
    this.playText.on('pointerup', () => {
      // Короткий звук старта игры перед переходом в GameScene.
      this.playSound('game-start', 0.5);
      this.scene.start('GameScene');
    });

    // Рекорд (yellow, локализованная метка с форматированным числом).
    const hiScore = defaultStorage.getHiScore();
    this.hiScoreTextObj = this.add
      .text(cx, cy + 55, i18n.t('hiScore', { n: zpad(hiScore, 4) }), {
        fontFamily: MONO_FONT,
        fontSize: '22px',
        color: CYBER.yellowCss,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setShadow(0, 0, CYBER.yellowCss, 10, true, true);

    // Mute-toggle: cyan моноширинный, локализованная метка.
    this.muteButton = this.add
      .text(cx, cy + 100, this.muteLabel(), {
        fontFamily: MONO_FONT,
        fontSize: '18px',
        color: CYBER.cyanCss,
      })
      .setOrigin(0.5)
      .setShadow(0, 0, CYBER.cyanCss, 8, false, true)
      .setInteractive({ useHandCursor: true });

    this.muteButton.on('pointerup', () => {
      const next = !this.isMuted;
      this.registry.set(MenuScene.REG_MUTE, next);
      this.muteButton!.setText(this.muteLabel());
      // Клик кнопки — звук подтверждения (играется до применения mute,
      // чтобы toggling в OFF ещё успел озвучиться).
      this.playSound('ui-button', 0.5);
      // BGM реагирует на mute: pause при OFF, resume при ON.
      this.applyMuteToBgm();
    });

    // Language-toggle: cyan моноширинный, переключает RU/EN.
    // Текст метки — "[ ЯЗЫК: RU ]" / "[ LANGUAGE: EN ]" (показывает ТЕКУЩИЙ язык).
    this.langButton = this.add
      .text(cx, cy + 130, this.langLabel(), {
        fontFamily: MONO_FONT,
        fontSize: '18px',
        color: CYBER.cyanCss,
      })
      .setOrigin(0.5)
      .setShadow(0, 0, CYBER.cyanCss, 8, false, true)
      .setInteractive({ useHandCursor: true });

    this.langButton.on('pointerup', () => {
      const next: Lang = i18n.getLang() === 'ru' ? 'en' : 'ru';
      i18n.setLang(next);
      // Клик кнопки — звук подтверждения.
      this.playSound('ui-button', 0.5);
      // Обновляем все видимые тексты меню под новый язык.
      this.refreshTexts();
    });

    // Отладочная кнопка бенчмарка — мелкий dim cyan, локализованная.
    this.benchButton = this.add
      .text(cx, cy + 175, i18n.t('benchmarkBtn'), {
        fontFamily: MONO_FONT,
        fontSize: '14px',
        color: CYBER.dimCyanCss,
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    this.benchButton.on('pointerup', () => {
      void this.runBenchmarkStub();
    });

    // Подсказка для разработчика (локализованная).
    this.benchHint = this.add
      .text(cx, cy + 215, i18n.t('benchmarkHint'), {
        fontFamily: MONO_FONT,
        fontSize: '11px',
        color: CYBER.mutedCss,
      })
      .setOrigin(0.5);

    // BGM: фоновая мелодия меню (loop, тихий volume). Не играем если muted.
    this.startBgm();

    // При уходе со сцены (scene.start('GameScene') и т.п.) — останавливаем BGM,
    // чтобы он не продолжал играть под GameScene/GameOverScene.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.handleShutdown, this);
  }

  /**
   * Запускает фоновую мелодию меню (loop, volume 0.3).
   * Не падает при отсутствии ассета или ошибки аудио.
   */
  private startBgm(): void {
    if (this.isMuted) return;
    try {
      if (!this.game.cache.audio.exists('bgm')) return;
      this.bgm = this.sound.add('bgm', { loop: true, volume: 0.3 });
      this.bgm.play();
    } catch {
      // Аудио может быть недоступно — не роняем сцену.
    }
  }

  /**
   * Реакция BGM на mute-флаг: pause при muted, resume при unmute.
   * Используется в mute-toggle кнопке.
   */
  private applyMuteToBgm(): void {
    if (!this.bgm) return;
    try {
      if (this.isMuted) {
        this.bgm.pause();
      } else if (!this.bgm.isPlaying) {
        this.bgm.play();
      }
    } catch {
      // Игнорируем ошибки аудио.
    }
  }

  /**
   * Универсальный хелпер проигрывания звука в меню.
   * Соблюдает mute-флаг и проверяет наличие ассета. Не падает при ошибках.
   */
  private playSound(key: string, volume: number): void {
    if (this.isMuted) return;
    try {
      if (!this.game.cache.audio.exists(key)) return;
      this.sound.play(key, { volume });
    } catch {
      // Аудио может быть недоступно — не роняем сцену.
    }
  }

  /** SHUTDOWN/DESTROY: останавливаем и освобождаем BGM. Идемпотентен. */
  private handleShutdown = (): void => {
    try {
      this.bgm?.stop();
      this.bgm?.destroy();
    } catch {
      // Игнорируем — уже уничтожен.
    }
    this.bgm = undefined;
  };

  /** Текст для mute-кнопки в зависимости от текущего состояния и языка. */
  private muteLabel(): string {
    const key = this.isMuted ? 'soundOff' : 'sound';
    return `[ ${i18n.t(key)} ]`;
  }

  /**
   * Текст для кнопки переключения языка. Показывает текущий язык:
   * "[ ЯЗЫК: RU ]" (когда активен русский) / "[ LANGUAGE: EN ]" (когда английский).
   */
  private langLabel(): string {
    return `[ ${i18n.t('language')}: ${i18n.getLang().toUpperCase()} ]`;
  }

  /**
   * Обновляет все видимые тексты меню под текущий язык i18n.
   * Вызывается после переключения языка кнопкой. Переиспользует существущие
   * текстовые объекты (интерактивность и tween'ы сохраняются).
   */
  private refreshTexts(): void {
    const cx = GAME_WIDTH / 2;

    if (this.subtitleTextObj) {
      this.subtitleTextObj.setText(i18n.t('subtitle').toUpperCase());
      // Сдвигаем курсор к новому концу подзаголовка.
      if (this.cursor) {
        this.cursor.x = cx + this.subtitleTextObj.width / 2 + 10;
      }
    }
    if (this.playText && this.playPanel) {
      this.playText.setText(`[ ${i18n.t('play')} ]`);
      // Перерисовываем подложку под новую ширину текста.
      this.playPanel.setSize(this.playText.width + 24, this.playText.height + 12);
    }
    if (this.hiScoreTextObj) {
      const hiScore = defaultStorage.getHiScore();
      this.hiScoreTextObj.setText(i18n.t('hiScore', { n: zpad(hiScore, 4) }));
    }
    if (this.muteButton) {
      this.muteButton.setText(this.muteLabel());
    }
    if (this.langButton) {
      this.langButton.setText(this.langLabel());
    }
    if (this.benchButton) {
      this.benchButton.setText(i18n.t('benchmarkBtn'));
    }
    if (this.benchHint) {
      this.benchHint.setText(i18n.t('benchmarkHint'));
    }
  }

  /**
   * Запускает изолированный бенчмарк физдвижка в текущей сцены.
   * Отчёт печатается в консоль браузера (DevTools).
   */
  private async runBenchmarkStub(): Promise<void> {
    // Защита от повторного нажатия во время прогона.
    this.input.enabled = false;
    try {
      const report = runBenchmark(this, { bodyCount: 50, durationMs: 30_000 });
      // eslint-disable-next-line no-console
      console.log('[NDT-Ninja] Physics benchmark report:', report);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[NDT-Ninja] Benchmark failed:', err);
    } finally {
      this.input.enabled = true;
    }
  }
}
