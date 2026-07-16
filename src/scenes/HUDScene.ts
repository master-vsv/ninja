import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/game';
import type { LifeState } from '../game/LifeState';
import type { ScoreState } from '../game/ScoreState';
import type { ComboState } from '../game/ComboState';
import type { LevelState } from '../game/LevelState';
import type { WaveState } from '../wave/WaveState';
import type { PowerUpState } from '../game/PowerUpState';
import type { SwordSystem } from '../systems/SwordSystem';
import type { SwordType } from '../events/types';
import { getAllSwordProps, getSwordProps } from '../sword/SwordProps';
import { isSwordUnlocked, getUnlockedSwords } from '../sword/SwordUnlock';
import { SWORD_CYCLE_ORDER } from '../sword/SwordState';
import { defaultStorage } from '../persistence/Storage';
import { i18n, type Lang } from '../i18n/I18n';
import { CYBER, MONO_FONT, CyberpunkBackground, zpad } from './CyberpunkBackground';

/**
 * HUDScene (фаза 4 + расширение фазы 5) — оверлей: жизни + счёт + рекорд +
 * индикатор меча + переключение. Версия CYBERPUNK NEON.
 *
 * Запускается через scene.launch('HUDScene') из GameScene как параллельная
 * (не останавливает Game). Читает shared state из game.registry каждый кадр.
 *
 * Назначение (Cyberpunk Neon):
 *   - верхняя полупрозрачная панель + тонкая cyan divider-линия;
 *   - 3 неоновых hex-иконки жизней (потерянная — только контур alpha 0.2);
 *   - текущий счёт — cyan моноширинный glow, формат "000000", по центру сверху;
 *   - рекорд — yellow "HI 0042" справа сверху;
 *   - фаза 5: панель мечей (4 иконки в нижней части экрана) с подсветкой
 *     активного. Переключение клавишами 1-4, способность — Space.
 *
 * Сцена НЕ отвечает за gameplay-логику — только отображение + переключение меча
 * (делегирует в SwordSystem). Подписок на EventBus не делает.
 */
export class HUDScene extends Phaser.Scene {
  /** Ключ сцены. */
  static readonly KEY = 'HUDScene';

  /** Ключи реестра для shared state (см. GameScene). */
  private static readonly REG_LIFE_STATE = 'ndt:lifeState';
  private static readonly REG_SCORE_STATE = 'ndt:scoreState';
  private static readonly REG_SWORD_SYSTEM = 'ndt:swordSystem';
  private static readonly REG_COMBO_STATE = 'ndt:comboState';
  private static readonly REG_WAVE_STATE = 'ndt:waveState';
  private static readonly REG_LEVEL_STATE = 'ndt:levelState';
  /** Ключ реестра для PowerUpState (shield-индикация в HUD). */
  private static readonly REG_POWERUP_STATE = 'ndt:powerUpState';

  /** Геометрия HUD. */
  private static readonly TOP_BAR_HEIGHT = 64;
  private static readonly ICON_RADIUS = 14;
  private static readonly ICON_SPACING = 40;
  private static readonly ICON_X = 30;
  private static readonly ICON_Y = 32;

  /**
   * Фича «прогресс-бар до следующего уровня»: тонкая полоса под LEVEL N.
   * Геометрия выровнена по левому краю с levelText (x=20). Прогресс =
   * (score % 1000) / 1000 — доля пути от текущего уровня к следующему.
   */
  private static readonly PROGRESS_BAR_X = 20;
  private static readonly PROGRESS_BAR_Y = HUDScene.TOP_BAR_HEIGHT + 52;
  private static readonly PROGRESS_BAR_HEIGHT = 4;
  private static readonly PROGRESS_BAR_MAX_WIDTH = 120;

  /** Геометрия панели мечей (фаза 5). */
  private static readonly SWORD_ICON_RADIUS = 22;
  private static readonly SWORD_ICON_SPACING = 70;
  /** Серый цвет для заблокированных иконок (соответствует CYBER.mutedCss). */
  private static readonly LOCKED_GRAY = 0x4a5566;
  /** Громкость звука разблокировки нового меча при росте уровня. */
  private static readonly UNLOCK_SOUND_VOLUME = 0.4;
  // ВАЖНО: SWORD_BAR_BOTTOM_Y / CENTER_X — static GETTERS (не field-инициализаторы).
  // config/game.ts ↔ HUDScene образуют circular import (game.ts импортирует HUDScene
  // в массиве сцен). Field-инициализатор `= GAME_HEIGHT - 10` выполнится при загрузке
  // модуля, когда GAME_HEIGHT ещё в TDZ → ReferenceError → Phaser не создаётся.
  // Getter вычисляется при доступе (runtime) — к этому моменту GAME_HEIGHT загружен.
  private static get SWORD_BAR_BOTTOM_Y(): number {
    return GAME_HEIGHT - 10;
  }
  private static get SWORD_BAR_CENTER_X(): number {
    return GAME_WIDTH / 2;
  }

  private lifeIcons: Phaser.GameObjects.Graphics[] = [];
  private swordIcons: Phaser.GameObjects.Graphics[] = [];
  private swordLabels: Phaser.GameObjects.Text[] = [];
  /** Кэш позиций иконок мечей (cx, cy) — Graphics рисует в world-координатах. */
  private swordIconPositions: ReadonlyArray<{ readonly x: number; readonly y: number }> = [];
  /**
   * Shared red-flash overlay для сигнала блокировки меча при клике/горячей клавише.
   * Один Graphics переиспользуется для всех иконок (репозиционируется и затухает).
   */
  private swordLockFlash?: Phaser.GameObjects.Graphics;
  private scoreText?: Phaser.GameObjects.Text;
  private hiScoreText?: Phaser.GameObjects.Text;
  /** Фаза 6: метка текущей волны (WAVE N) — слева сверху под панелью. */
  private waveText?: Phaser.GameObjects.Text;
  /** Метка текущего уровня (LEVEL N) — под WAVE, обновляется при росте score. */
  private levelText?: Phaser.GameObjects.Text;
  /**
   * Фаза 6: крупный glow-индикатор комбо (COMBO ×N) — над игровым полем,
   * виден только при активном комбо (combo >= 2).
   */
  private comboText?: Phaser.GameObjects.Text;
  /** Кэш для перерисовки только при изменении. */
  private lastLives = -1;
  private lastScore = -1;
  private lastSword: SwordType | null = null;
  /** Кэш slowmo — для подсветки иконки radiation при активном slowmo. */
  private lastSlowmoActive = false;
  /** Кэш уровня для перерисовки иконок мечей при разблокировке (отдельно от levelText). */
  private lastSwordUnlockLevel = -1;
  /** Кэш волны — для перерисовки waveText только при смене индекса. */
  private lastWaveIndex = -1;
  /** Кэш уровня — для перерисовки levelText только при смене. */
  private lastLevel = -1;
  /** Кэш комбо — для перерисовки comboText только при смене значения. */
  private lastCombo = -1;
  /**
   * Фича «прогресс-бар до следующего уровня»: Graphics-полоса под LEVEL N.
   * Перерисовывается только при смене прогресса > 0.5% (кэш lastProgress).
   */
  private progressBar?: Phaser.GameObjects.Graphics;
  /** Кэш прогресса уровня (0..1) — для перерисовки полосы при delta > 0.5%. */
  private lastProgress = -1;
  /**
   * Подсказка управления справа от панели мечей. Сохраняем ссылку, чтобы
   * перерисовывать текст при смене языка.
   */
  private swordHintText?: Phaser.GameObjects.Text;
  /**
   * Shield-рамка: золотая неоновая рамка вокруг верхней HUD-панели, видимая
   * только при активном shield-эффекте (каска). Graphics + alpha-pulse tween,
   * Canvas-совместимо. Лениво создаётся при первом включении.
   */
  private shieldFrame?: Phaser.GameObjects.Graphics;
  /** Кэш shield-состояния — для перерисовки только при смене. */
  private lastShielded = false;
  /**
   * Кэш текущего языка — для перерисовки локализованных текстов (HI-score,
   * подсказка, WAVE/LEVEL/COMBO) при смене языка в MenuScene. HUD запускается
   * параллельно с GameScene и живёт несколько волн; язык может смениться в
   * меню перед стартом новой игры — тогда при следующем create() кэш уже
   * актуален. Перерисовка на лету нужна для случая, когда язык меняется в
   * той же сессии до ухода с HUD (например, через будущий hot-key).
   */
  private lastLang: Lang | null = null;

  constructor() {
    super({ key: HUDScene.KEY });
  }

  create(): void {
    // Cyberpunk Neon фон с минимальной непрозрачностью — overlay над GameScene,
    // поэтому базовый тёмный слой отключён, grid/scanlines едва заметны.
    CyberpunkBackground.add(this, {
      fillBase: false,
      gridAlpha: 0.04,
      scanAlpha: 0.02,
      animated: false,
    });

    // Верхняя HUD-панель: полупрозрачная тёмная полоса.
    const panel = this.add.graphics();
    panel.fillStyle(CYBER.bgPanel, 0.6);
    panel.fillRect(0, 0, GAME_WIDTH, HUDScene.TOP_BAR_HEIGHT);
    // Тонкая cyan divider-линия под панелью.
    panel.lineStyle(1, CYBER.cyan, 0.6);
    panel.beginPath();
    panel.moveTo(0, HUDScene.TOP_BAR_HEIGHT);
    panel.lineTo(GAME_WIDTH, HUDScene.TOP_BAR_HEIGHT);
    panel.strokePath();
    panel.setDepth(1);

    // Иконки жизней — 3 неоновых hexagon'а в верхнем-левом углу.
    this.lifeIcons = [];
    for (let i = 0; i < 3; i++) {
      const g = this.add.graphics();
      const x = HUDScene.ICON_X + i * HUDScene.ICON_SPACING;
      const y = HUDScene.ICON_Y;
      this.drawHexIcon(g, x, y, true);
      this.lifeIcons.push(g);
    }

    // Счёт — cyan моноширинный glow, центр панели, формат "000000".
    this.scoreText = this.add
      .text(GAME_WIDTH / 2, 14, zpad(0, 6), {
        fontFamily: MONO_FONT,
        fontSize: '30px',
        color: CYBER.cyanCss,
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 0)
      .setShadow(0, 0, CYBER.cyanCss, 14, true, true);
    this.scoreText.setDepth(2);

    // Рекорд — yellow моноширинный, справа сверху. Локализованная короткая
    // метка (РЕК/HI) + zpad-число. Перерисовывается при смене языка в update().
    const hi = defaultStorage.getHiScore();
    this.hiScoreText = this.add
      .text(GAME_WIDTH - 20, 16, `${i18n.t('hi')} ${zpad(hi, 4)}`, {
        fontFamily: MONO_FONT,
        fontSize: '16px',
        color: CYBER.yellowCss,
        fontStyle: 'bold',
      })
      .setOrigin(1, 0)
      .setShadow(0, 0, CYBER.yellowCss, 8, true, true);
    this.hiScoreText.setDepth(2);

    // Фаза 6: индикатор текущей волны — magenta моноширинный, слева сверху
    // под HUD-панелью. Перерисовывается при смене currentWaveIndex.
    this.waveText = this.add
      .text(20, HUDScene.TOP_BAR_HEIGHT + 8, i18n.t('wave', { n: 1 }), {
        fontFamily: MONO_FONT,
        fontSize: '18px',
        color: CYBER.magentaCss,
        fontStyle: 'bold',
      })
      .setOrigin(0, 0)
      .setShadow(0, 0, CYBER.magentaCss, 8, true, true);
    this.waveText.setDepth(2);

    // Метка текущего уровня (LEVEL N) — cyan моноширинный, под WAVE.
    // level = floor(score/1000)+1, обновляется при росте score.
    this.levelText = this.add
      .text(20, HUDScene.TOP_BAR_HEIGHT + 30, i18n.t('level', { n: 1 }), {
        fontFamily: MONO_FONT,
        fontSize: '16px',
        color: CYBER.cyanCss,
        fontStyle: 'bold',
      })
      .setOrigin(0, 0)
      .setShadow(0, 0, CYBER.cyanCss, 8, true, true);
    this.levelText.setDepth(2);

    // Фича «прогресс-бар до следующего уровня»: тонкая полоса под LEVEL N.
    // Graphics (Canvas-совместимо), перерисовка при смене score (кэш lastProgress).
    this.progressBar = this.add.graphics();
    this.progressBar.setDepth(2);

    // Фаза 6: крупный glow-индикатор комбо — yellow, по центру над игровым полем.
    // Изначально невидим (комбо неактивно); показывается при combo >= 2.
    this.comboText = this.add
      .text(GAME_WIDTH / 2, 110, i18n.t('combo', { n: 1 }), {
        fontFamily: MONO_FONT,
        fontSize: '32px',
        color: CYBER.yellowCss,
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 0.5)
      .setShadow(0, 0, CYBER.yellowCss, 16, true, true);
    this.comboText.setDepth(3);
    this.comboText.setVisible(false);

    this.createSwordBar();

    // Переключение мечей (фаза 5): клавиши 1-4 = выбор меча, Space = способность.
    this.bindSwordHotkeys();

    // Принудительная перерисовка на первом кадре.
    this.lastLives = -1;
    this.lastScore = -1;
    this.lastSword = null;
    this.lastSlowmoActive = false;
    this.lastWaveIndex = -1;
    this.lastCombo = -1;
    this.lastLevel = -1;
    this.lastSwordUnlockLevel = -1;
    this.lastProgress = -1;
    this.lastShielded = false;
    // Кэш языка — для перерисовки локализованных текстов при смене языка.
    this.lastLang = i18n.getLang();
  }

  /**
   * Per-frame апдейт: читает shared state из registry и обновляет HUD.
   * Перерисовка только при изменении (дёшево для 60 fps).
   *
   * Фаза 6: дополнительно обновляет waveText (при смене волны) и comboText
   * (при смене combo + мерцание-glow через sin(time) при активном комбо).
   */
  override update(): void {
    // Смена языка: сбрасываем кэши WAVE/LEVEL/COMBO и перерисовываем статичные
    // локализованные тексты (HI-score, подсказка). Сам text-объект переиспользуется.
    const lang = i18n.getLang();
    if (lang !== this.lastLang) {
      this.lastLang = lang;
      this.lastWaveIndex = -1;
      this.lastLevel = -1;
      this.lastCombo = -1;
      this.refreshHiScoreText();
      this.refreshSwordHint();
    }

    const lifeState = this.registry.get(HUDScene.REG_LIFE_STATE) as LifeState | undefined;
    const scoreState = this.registry.get(HUDScene.REG_SCORE_STATE) as
      | ScoreState
      | undefined;
    const swordSystem = this.registry.get(HUDScene.REG_SWORD_SYSTEM) as
      | SwordSystem
      | undefined;
    const comboState = this.registry.get(HUDScene.REG_COMBO_STATE) as
      | ComboState
      | undefined;
    const waveState = this.registry.get(HUDScene.REG_WAVE_STATE) as
      | WaveState
      | undefined;
    const levelState = this.registry.get(HUDScene.REG_LEVEL_STATE) as
      | LevelState
      | undefined;

    if (lifeState && lifeState.lives !== this.lastLives) {
      // Фича «комбо → +жизнь»: всплывающий «+1» при РОСТЕ жизней (любая причина).
      // lastLives >= 0 защищает от ложного срабатывания на первом кадре (-1 → 3).
      if (this.lastLives >= 0 && lifeState.lives > this.lastLives) {
        this.showLifeGainFloat();
      }
      this.lastLives = lifeState.lives;
      this.updateLivesIcons(lifeState.lives);
    }

    if (scoreState && scoreState.score !== this.lastScore) {
      this.lastScore = scoreState.score;
      this.scoreText?.setText(zpad(scoreState.score, 6));
      // Фича «прогресс-бар до следующего уровня»: прогресс = (score%1000)/1000.
      // Перерисовка при delta > 0.5% (кэш lastProgress) — дёшево для 60 fps.
      const progress = (scoreState.score % 1000) / 1000;
      if (Math.abs(progress - this.lastProgress) > 0.005) {
        this.lastProgress = progress;
        this.drawProgressBar(progress);
      }
    }

    if (swordSystem) {
      const current = swordSystem.current();
      const slowmoActive = swordSystem.slowmoState.isActive;
      // Уровень для разблокировки: при росте уровня новые мечи открываются
      // (замок исчезает, иконка яркая) + звук разблокировки.
      const level = levelState?.level ?? 1;
      const prevLevel = this.lastSwordUnlockLevel;
      const levelChanged = level !== prevLevel;
      if (
        current !== this.lastSword ||
        slowmoActive !== this.lastSlowmoActive ||
        levelChanged
      ) {
        // Звук разблокировки: уровень вырос и открылся хотя бы один новый меч.
        if (
          levelChanged &&
          prevLevel >= 0 &&
          level > prevLevel &&
          getUnlockedSwords(level).length > getUnlockedSwords(prevLevel).length
        ) {
          this.playSound('new-best', HUDScene.UNLOCK_SOUND_VOLUME);
        }
        this.lastSword = current;
        this.lastSlowmoActive = slowmoActive;
        this.lastSwordUnlockLevel = level;
        this.updateSwordIcons(current, slowmoActive, level);
      }
    }

    // Фаза 6: индикатор текущей волны — только при смене индекса.
    if (waveState && waveState.currentWaveIndex !== this.lastWaveIndex) {
      this.lastWaveIndex = waveState.currentWaveIndex;
      this.waveText?.setText(i18n.t('wave', { n: waveState.currentWaveIndex + 1 }));
    }

    // Метка уровня — перерисовка только при смене level + flash при росте.
    if (levelState && levelState.level !== this.lastLevel) {
      const grew = this.lastLevel >= 0 && levelState.level > this.lastLevel;
      this.lastLevel = levelState.level;
      this.levelText?.setText(i18n.t('level', { n: levelState.level }));
      if (grew) this.flashLevelText();
    }

    // Фаза 6: комбо-индикатор. Перерисовка только при смене значения combo;
    // пульсация glow дёшево считается каждый кадр (Math.sin).
    const combo = comboState?.getCombo() ?? 0;
    if (combo !== this.lastCombo) {
      this.lastCombo = combo;
      this.updateComboText(combo);
    }
    if (combo >= 2 && this.comboText) {
      // Лёгкая пульсация масштабом/альфой — эффект «живого» неона.
      const t = this.time.now / 150;
      const pulse = 1 + Math.sin(t) * 0.06;
      this.comboText.setScale(pulse);
    }

    // Shield-эффект (каска): золотая рамка вокруг HUD при активной неуязвимости.
    // Перерисовка только при смене состояния (дёшево для 60 fps).
    const powerUpState = this.registry.get(HUDScene.REG_POWERUP_STATE) as
      | PowerUpState
      | undefined;
    const shielded = powerUpState?.isShielded ?? false;
    if (shielded !== this.lastShielded) {
      this.lastShielded = shielded;
      this.updateShieldFrame(shielded);
    }
  }

  /**
   * Фаза 6: обновляет comboText. При combo >= 2 — показывает «COMBO ×N»,
   * иначе скрывает. Множитель берётся из ComboState (через registry).
   */
  private updateComboText(combo: number): void {
    if (!this.comboText) return;
    if (combo >= 2) {
      const comboState = this.registry.get(HUDScene.REG_COMBO_STATE) as
        | ComboState
        | undefined;
      const multiplier = comboState?.getMultiplier() ?? 1;
      this.comboText.setText(i18n.t('combo', { n: multiplier }));
      this.comboText.setVisible(true);
    } else {
      this.comboText.setVisible(false);
      this.comboText.setScale(1);
    }
  }

  /**
   * Перерисовка HI-score метки под текущий язык. Вызывается при смене языка.
   * Число берётся из storage (актуальный рекорд), метка — из i18n ('РЕК'/'HI').
   */
  private refreshHiScoreText(): void {
    if (!this.hiScoreText) return;
    const hi = defaultStorage.getHiScore();
    this.hiScoreText.setText(`${i18n.t('hi')} ${zpad(hi, 4)}`);
  }

  /**
   * Перерисовка подсказки управления под текущий язык. Вызывается при смене языка.
   */
  private refreshSwordHint(): void {
    this.swordHintText?.setText(i18n.t('swordHint'));
  }

  /**
   * Вспышка levelText при повышении уровня: короткий scale-pulse (1.4 → 1.0).
   * Существующие tween'ы на той же цели убираются, чтобы не накапливаться.
   */
  private flashLevelText(): void {
    if (!this.levelText) return;
    this.tweens.killTweensOf(this.levelText);
    this.levelText.setScale(1.4);
    this.tweens.add({
      targets: this.levelText,
      scale: 1,
      duration: 200,
      ease: 'Cubic.easeOut',
    });
  }

  /**
   * Фича «прогресс-бар до следующего уровня»: рисует тонкую полосу под LEVEL N.
   * Фон — cyan dim (alpha 0.3) на всю ширину; заливка — cyan (alpha 0.8) длиной
   * progress × MAX_WIDTH. Graphics (fillRect) — совместимо с Canvas-рендером.
   *
   * @param progress доля пути к следующему уровню (0..1), рассчитывается в update.
   */
  private drawProgressBar(progress: number): void {
    const g = this.progressBar;
    if (!g) return;
    g.clear();
    const x = HUDScene.PROGRESS_BAR_X;
    const y = HUDScene.PROGRESS_BAR_Y;
    const h = HUDScene.PROGRESS_BAR_HEIGHT;
    const maxW = HUDScene.PROGRESS_BAR_MAX_WIDTH;
    // Фон полосы (dim).
    g.fillStyle(CYBER.cyan, 0.3);
    g.fillRect(x, y, maxW, h);
    // Заливка прогресса (clamp на [0, maxW] на случай численного дрейфа).
    const fillW = Math.max(0, Math.min(maxW, progress * maxW));
    if (fillW > 0) {
      g.fillStyle(CYBER.cyan, 0.8);
      g.fillRect(x, y, fillW, h);
    }
  }

  /**
   * Фича «комбо → +жизнь»: всплывающий «+1» у иконок жизней при росте lives.
   * Появляется у последней иконки, поднимается вверх и затухает за 800 мс.
   * Каждый вызов создаёт отдельный Text — допускает редкие наложения без
   * конфликтов tween'ов (у каждого своя цель).
   */
  private showLifeGainFloat(): void {
    const startX = HUDScene.ICON_X + HUDScene.ICON_SPACING * 2.5;
    const text = this.add
      .text(startX, HUDScene.ICON_Y, '+1', {
        fontFamily: MONO_FONT,
        fontSize: '18px',
        color: CYBER.cyanCss,
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 0.5)
      .setShadow(0, 0, CYBER.cyanCss, 10, true, true);
    text.setDepth(5);
    this.tweens.add({
      targets: text,
      y: text.y - 22,
      alpha: { from: 1, to: 0 },
      duration: 800,
      ease: 'Cubic.easeOut',
      onComplete: () => text.destroy(),
    });
  }

  /**
   * Визуальный сигнал блокировки меча при клике/горячей клавише: magenta-кольцо
   * вокруг иконки, затухающее за 350 мс. Звук отказа уже проигрывает SwordSystem.set,
   * поэтому здесь только визуал. Идемпотентен: повторный клик перезапускает tween.
   */
  private flashSwordLocked(iconIndex: number): void {
    const pos = this.swordIconPositions[iconIndex];
    const flash = this.swordLockFlash;
    if (!pos || !flash) return;
    flash.clear();
    flash.lineStyle(3, CYBER.magenta, 1);
    flash.beginPath();
    flash.arc(pos.x, pos.y, HUDScene.SWORD_ICON_RADIUS + 4, 0, Math.PI * 2);
    flash.strokePath();
    flash.setAlpha(1);
    this.tweens.killTweensOf(flash);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 350,
      ease: 'Cubic.easeOut',
    });
  }

  /**
   * Безопасное проигрывание звука: уважает mute-флаг ('ndt:mute') и проверяет
   * наличие ассета. Не падает при ошибках аудио (headless/тесты). По образцу
   * GameScene.playSound / MenuScene.playSound.
   */
  private playSound(key: string, volume: number): void {
    try {
      if (this.registry.get('ndt:mute') === true) return;
      if (!this.game.cache.audio.exists(key)) return;
      this.sound.play(key, { volume });
    } catch {
      // Аудио недоступно — не роняем HUD-оверлей.
    }
  }

  /**
   * Shield-эффект (каска): золотая неоновая рамка вокруг верхней HUD-панели,
   * видимая только при активном shield-эффекте (временная неуязвимость).
   * Graphics (strokeRect) + alpha-pulse tween (золотой пульсация) — совместимо
   * с Canvas. Лениво создаётся при первом включении; tween убирается при
   * выключении (killTweensOf) во избежание утечки на уничтоженном объекте.
   *
   * @param active true — показать и запустить пульсацию; false — скрыть.
   */
  private updateShieldFrame(active: boolean): void {
    if (active) {
      if (!this.shieldFrame) {
        const g = this.add.graphics();
        g.setDepth(4); // над верхней HUD-панелью (depth 1), под текстами (depth 2..3).
        this.shieldFrame = g;
      }
      const g = this.shieldFrame;
      g.clear();
      // Двойная линия для неон-glow: широкая halo + тонкий яркий core.
      g.lineStyle(6, CYBER.yellow, 0.18);
      g.strokeRect(2, 2, GAME_WIDTH - 4, HUDScene.TOP_BAR_HEIGHT - 4);
      g.lineStyle(2, CYBER.yellow, 0.9);
      g.strokeRect(2, 2, GAME_WIDTH - 4, HUDScene.TOP_BAR_HEIGHT - 4);
      g.setVisible(true);
      g.setAlpha(1);
      // Пульсация alpha — эффект «живого» golden-shield.
      this.tweens.killTweensOf(g);
      this.tweens.add({
        targets: g,
        alpha: { from: 1, to: 0.55 },
        duration: 350,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    } else {
      const g = this.shieldFrame;
      if (!g) return;
      this.tweens.killTweensOf(g);
      g.setVisible(false);
      g.setAlpha(0);
    }
  }

  /**
   * Фаза 5: панель мечей (4 неоновых круга в нижней части экрана).
   * Каждый меч помечен цифрой (1-4) — это же клавиша переключения.
   *
   * Разблокировка по уровню: заблокированные мечи (level < unlockLevel)
   * рисуются dim (серый контур) с badge-замком, метка клавиши — "?".
   * Клик/клавиша по заблокированному мечу — no-op в SwordSystem.set + визуальный
   * flash (см. flashSwordLocked).
   */
  private createSwordBar(): void {
    const allProps = getAllSwordProps();
    // Текущий уровень для разблокировки: LevelState из registry (по умолчанию 1).
    const levelState = this.registry.get(HUDScene.REG_LEVEL_STATE) as
      | LevelState
      | undefined;
    const level = levelState?.level ?? 1;
    // Центрируем 4 иконки: шаг SWORD_ICON_SPACING, центр экрана.
    const totalWidth = (allProps.length - 1) * HUDScene.SWORD_ICON_SPACING;
    const startX = HUDScene.SWORD_BAR_CENTER_X - totalWidth / 2;

    this.swordIcons = [];
    this.swordLabels = [];
    const positions: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < allProps.length; i++) {
      const props = allProps[i];
      const x = startX + i * HUDScene.SWORD_ICON_SPACING;
      const y = HUDScene.SWORD_BAR_BOTTOM_Y - HUDScene.SWORD_ICON_RADIUS;
      const isLocked = !isSwordUnlocked(props.type, level);
      const g = this.add.graphics();
      this.drawSwordIcon(g, x, y, props.type, false, isLocked);
      // Клик по иконке меча — выбор мышью (надёжнее клавиш на overlay-сцене).
      // Hit-area — круг в world-координатах иконки (Graphics g.x=0, рисунок в x,y).
      const hitArea = new Phaser.Geom.Circle(x, y, HUDScene.SWORD_ICON_RADIUS + 10);
      g.setInteractive(hitArea, Phaser.Geom.Circle.Contains);
      g.on('pointerup', () => {
        const sys = this.registry.get(HUDScene.REG_SWORD_SYSTEM) as
          | SwordSystem
          | undefined;
        if (!sys) return;
        sys.set(props.type);
        // SwordSystem.set — no-op для заблокированного: если активный меч НЕ сменился
        // на запрошенный, значит меч заблокирован → визуальный сигнал отказа.
        if (sys.current() !== props.type) {
          this.flashSwordLocked(i);
        }
      });
      // Курсор-подсказка при наведении.
      g.on('pointerover', () => g.setAlpha(1));
      g.on('pointerout', () => g.setAlpha(1));
      this.swordIcons.push(g);
      positions.push({ x, y });

      // Метка под иконкой: "?" для заблокированного, иначе цифра клавиши (1-4).
      const labelText = isLocked ? '?' : String(i + 1);
      const label = this.add
        .text(x, y + HUDScene.SWORD_ICON_RADIUS + 6, labelText, {
          fontFamily: MONO_FONT,
          fontSize: '12px',
          color: CYBER.mutedCss,
          fontStyle: 'bold',
        })
        .setOrigin(0.5, 0);
      this.swordLabels.push(label);
    }
    this.swordIconPositions = positions;

    // Shared red-flash overlay для сигнала блокировки (репозиционируется при клике).
    this.swordLockFlash = this.add.graphics();
    this.swordLockFlash.setDepth(4);
    this.swordLockFlash.setAlpha(0);

    // Подсказка управления справа от панели мечей. Ссылка хранится для
    // перерисовки текста при смене языка (см. refreshSwordHint).
    this.swordHintText = this.add
      .text(
        GAME_WIDTH - 12,
        HUDScene.SWORD_BAR_BOTTOM_Y - HUDScene.SWORD_ICON_RADIUS,
        i18n.t('swordHint'),
        {
          fontFamily: MONO_FONT,
          fontSize: '11px',
          color: CYBER.dimCyanCss,
        },
      )
      .setOrigin(1, 0.5);
  }

  /**
   * Привязывает клавиши переключения мечей (1-4) и активации способности (Space).
   * Делегирует в SwordSystem через registry — HUD НЕ владеет мечом, только управляет.
   * При попытке выбрать заблокированный меч — flash-сигнал (set уже no-op).
   */
  private bindSwordHotkeys(): void {
    // key → { меч, индекс иконки для flash-сигнала при блокировке }.
    const swordByKey: Record<string, { sword: SwordType; iconIndex: number }> = {
      ONE: { sword: 'forged', iconIndex: 0 },
      TWO: { sword: 'welding', iconIndex: 1 },
      THREE: { sword: 'plasma', iconIndex: 2 },
      FOUR: { sword: 'radiation', iconIndex: 3 },
    };
    for (const key of Object.keys(swordByKey)) {
      this.input.keyboard?.on(`keydown-${key}`, () => {
        const sys = this.registry.get(HUDScene.REG_SWORD_SYSTEM) as
          | SwordSystem
          | undefined;
        if (!sys) return;
        const { sword, iconIndex } = swordByKey[key];
        sys.set(sword);
        if (sys.current() !== sword) {
          this.flashSwordLocked(iconIndex);
        }
      });
    }
    // Space — активировать способность текущего меча (для radiation → slowmo).
    this.input.keyboard?.on('keydown-space', () => {
      const sys = this.registry.get(HUDScene.REG_SWORD_SYSTEM) as
        | SwordSystem
        | undefined;
      sys?.activateAbility();
    });
  }

  /**
   * Перерисовывает иконки мечей: активная — яркая заливка цветом меча,
   * неактивные — только контур. Заблокированные (level < unlockLevel) — dim
   * серый контур + badge-замок + метка "?". При активном slowmo radiation-иконка
   * получает дополнительный halo (внешнее свечение).
   */
  private updateSwordIcons(
    activeSword: SwordType,
    slowmoActive: boolean,
    level: number,
  ): void {
    for (let i = 0; i < this.swordIcons.length; i++) {
      const g = this.swordIcons[i];
      const pos = this.swordIconPositions[i];
      if (!pos) continue;
      const props = getSwordProps(SWORD_CYCLE_ORDER[i]);
      const isActive = props.type === activeSword;
      const isLocked = !isSwordUnlocked(props.type, level);
      // Halo только для активной radiation-иконки при активном slowmo.
      const halo = isActive && slowmoActive && props.type === 'radiation';
      g.clear();
      this.drawSwordIcon(g, pos.x, pos.y, props.type, isActive, isLocked, halo);
      // Метка: "?" + приглушённый серый для заблокированного; иначе цвет меча
      // для активного / muted для неактивного. Текст метки меняется только при
      // смене состояния блокировки (setText идемпотентен по значению).
      const labelText = isLocked ? '?' : String(i + 1);
      const labelColor = isLocked ? CYBER.mutedCss : isActive ? props.colorCss : CYBER.mutedCss;
      const label = this.swordLabels[i];
      if (label && label.text !== labelText) label.setText(labelText);
      label?.setColor(labelColor);
    }
  }

  /**
   * Рисует неоновую иконку меча.
   * Активный меч — заливка цветом меча + яркий stroke;
   * неактивный — только контур alpha 0.3;
   * заблокированный (isLocked) — dim серый контур/заливка alpha 0.2 + badge-замок.
   * halo — дополнительное внешнее свечение (для radiation при slowmo).
   */
  private drawSwordIcon(
    g: Phaser.GameObjects.Graphics,
    cx: number,
    cy: number,
    swordType: SwordType,
    isActive: boolean,
    isLocked = false,
    halo = false,
  ): void {
    const props = getSwordProps(swordType);
    const r = HUDScene.SWORD_ICON_RADIUS;
    // Halo: внешнее свечение (slowmo-индикация для radiation).
    if (halo) {
      g.lineStyle(8, props.color, 0.2);
      g.beginPath();
      g.arc(cx, cy, r + 6, 0, Math.PI * 2);
      g.strokePath();
    }
    if (isLocked) {
      // Заблокирован: dim серый контур + лёгкая серая заливка (alpha 0.2).
      g.fillStyle(HUDScene.LOCKED_GRAY, 0.2);
      g.lineStyle(2, HUDScene.LOCKED_GRAY, 0.45);
    } else if (isActive) {
      g.fillStyle(props.color, 0.85);
      g.lineStyle(2.5, props.color, 1);
    } else {
      g.lineStyle(2, props.color, 0.3);
    }
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    if (isLocked || isActive) g.fillPath();
    g.strokePath();
    // Badge-замок поверх заблокированной иконки.
    if (isLocked) {
      this.drawLockBadge(g, cx, cy);
    }
  }

  /**
   * Рисует маленький badge-замок поверх иконки меча (маркер «заблокировано»).
   * Серый корпус-прямоугольник + дужка-полукольцо сверху.
   */
  private drawLockBadge(g: Phaser.GameObjects.Graphics, cx: number, cy: number): void {
    const gray = HUDScene.LOCKED_GRAY;
    // Дужка замка: полукольцо сверху (arc от PI до 0 — верхняя полуокружность).
    g.lineStyle(2, gray, 0.95);
    g.beginPath();
    g.arc(cx, cy - 3, 3.5, Math.PI, 0);
    g.strokePath();
    // Корпус замка: прямоугольник под дужкой.
    g.fillStyle(gray, 0.95);
    g.fillRect(cx - 4, cy - 3, 8, 6);
  }

  /** Обновляет цвет hex-иконок жизней по текущему lives. */
  private updateLivesIcons(lives: number): void {
    for (let i = 0; i < this.lifeIcons.length; i++) {
      const g = this.lifeIcons[i];
      const x = HUDScene.ICON_X + i * HUDScene.ICON_SPACING;
      const y = HUDScene.ICON_Y;
      const isLive = i < lives;
      g.clear();
      this.drawHexIcon(g, x, y, isLive);
    }
  }

  /**
   * Рисует неоновую hex-иконку.
   * live  — cyan fill + brighter stroke (целая жизнь);
   * lost  — только контур alpha 0.2 (пустая ячейка).
   */
  private drawHexIcon(g: Phaser.GameObjects.Graphics, cx: number, cy: number, isLive: boolean): void {
    const r = HUDScene.ICON_RADIUS;
    if (isLive) {
      g.fillStyle(CYBER.cyan, 0.85);
      g.lineStyle(2, CYBER.cyan, 1);
    } else {
      // Потерянная жизнь — только контур, без заливки.
      g.lineStyle(2, CYBER.cyan, 0.2);
    }
    g.beginPath();
    // Стартовый угол -π/6: плоская вершина слева/справа (классический hex).
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 6;
      const px = cx + Math.cos(a) * r;
      const py = cy + Math.sin(a) * r;
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.closePath();
    if (isLive) g.fillPath();
    g.strokePath();
  }

  /**
   * Статические помощники для регистрации shared state в game.registry.
   * GameScene вызывает при создании, HUDScene/GameOverScene — читают.
   */
  static registerLifeState(
    registry: Phaser.Data.DataManager,
    lifeState: LifeState,
  ): void {
    registry.set(HUDScene.REG_LIFE_STATE, lifeState);
  }

  static registerScoreState(
    registry: Phaser.Data.DataManager,
    scoreState: ScoreState,
  ): void {
    registry.set(HUDScene.REG_SCORE_STATE, scoreState);
  }

  /** Регистрирует SwordSystem (фаза 5) — HUD переключает меч через него. */
  static registerSwordSystem(
    registry: Phaser.Data.DataManager,
    swordSystem: SwordSystem,
  ): void {
    registry.set(HUDScene.REG_SWORD_SYSTEM, swordSystem);
  }

  /** Регистрирует ComboState (фаза 6) — HUD читает combo/multiplier. */
  static registerComboState(
    registry: Phaser.Data.DataManager,
    comboState: ComboState,
  ): void {
    registry.set(HUDScene.REG_COMBO_STATE, comboState);
  }

  /** Регистрирует WaveState (фаза 6) — HUD читает currentWaveIndex. */
  static registerWaveState(
    registry: Phaser.Data.DataManager,
    waveState: WaveState,
  ): void {
    registry.set(HUDScene.REG_WAVE_STATE, waveState);
  }

  /** Регистрирует LevelState — HUD читает level для отображения LEVEL N. */
  static registerLevelState(
    registry: Phaser.Data.DataManager,
    levelState: LevelState,
  ): void {
    registry.set(HUDScene.REG_LEVEL_STATE, levelState);
  }

  /**
   * Регистрирует PowerUpState — HUD читает isShielded для показа золотой
   * рамки вокруг верхней панели при активной неуязвимости (каска).
   */
  static registerPowerUpState(
    registry: Phaser.Data.DataManager,
    powerUpState: PowerUpState,
  ): void {
    registry.set(HUDScene.REG_POWERUP_STATE, powerUpState);
  }
}
