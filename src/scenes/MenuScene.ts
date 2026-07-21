import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/game';
import { runBenchmark } from '../benchmark/physics-bench';
import { defaultStorage } from '../persistence/Storage';
import { i18n, type Lang } from '../i18n/I18n';
import { CYBER, MONO_FONT, CyberpunkBackground, zpad } from './CyberpunkBackground';
import { NDT_MESHES } from '../threed/NDTMeshes';
import { compose, projectOrthographic, rotateX, rotateY } from '../threed/Projection';
import type { Mesh3D } from '../threed/Mesh3D';
import type { NDTObjectKind, SwordType } from '../events/types';
import { KIND_COLORS } from '../systems/SpawnDirector';
import { getSwordProps } from '../sword/SwordProps';

/** Данные одного 3D-объекта на панели правил. */
interface RulesObjectSlot {
  kind: NDTObjectKind;
  mesh: Mesh3D;
  color: number;
  descKey: string;
  graphics: Phaser.GameObjects.Graphics;
  centerX: number;
  centerY: number;
}

/** Данные одного меча на панели правил. */
interface SwordSlot {
  type: SwordType;
  color: number;
  descKey: string;
  circleGfx: Phaser.GameObjects.Graphics;
  centerX: number;
  centerY: number;
}

/** Все 14 NDT-объектов для панели правил. */
const RULES_OBJECTS: Array<{ kind: NDTObjectKind; descKey: string }> = [
  { kind: 'bolt', descKey: 'rulesBolt' },
  { kind: 'nut', descKey: 'rulesNut' },
  { kind: 'ruler', descKey: 'rulesRuler' },
  { kind: 'standard', descKey: 'rulesStandard' },
  { kind: 'probe', descKey: 'rulesProbe' },
  { kind: 'magnet', descKey: 'rulesMagnet' },
  { kind: 'penetrant', descKey: 'rulesPenetrant' },
  { kind: 'pipe', descKey: 'rulesPipe' },
  { kind: 'shrink', descKey: 'rulesShrink' },
  { kind: 'grow', descKey: 'rulesGrow' },
  { kind: 'slow', descKey: 'rulesSlow' },
  { kind: 'helmet', descKey: 'rulesHelmet' },
  { kind: 'goggles', descKey: 'rulesGoggles' },
  { kind: 'weldingMask', descKey: 'rulesWeldingMask' },
];

/** 4 меча для панели правил. */
const SWORD_RULES: Array<{ type: SwordType; descKey: string }> = [
  { type: 'forged', descKey: 'rulesForged' },
  { type: 'welding', descKey: 'rulesWelding' },
  { type: 'plasma', descKey: 'rulesPlasma' },
  { type: 'radiation', descKey: 'rulesRadiation' },
];

/**
 * MenuScene — версия CYBERPUNK NEON.
 */
export class MenuScene extends Phaser.Scene {
  static readonly REG_MUTE = 'ndt:mute';

  get isMuted(): boolean {
    return this.registry.get(MenuScene.REG_MUTE) === true;
  }

  private bgm?: Phaser.Sound.BaseSound;

  private subtitleTextObj?: Phaser.GameObjects.Text;
  private cursor?: Phaser.GameObjects.Text;
  private playText?: Phaser.GameObjects.Text;
  private playPanel?: Phaser.GameObjects.Rectangle;
  private hiScoreTextObj?: Phaser.GameObjects.Text;
  private muteButton?: Phaser.GameObjects.Text;
  private langButton?: Phaser.GameObjects.Text;
  private rulesButton?: Phaser.GameObjects.Text;
  private benchButton?: Phaser.GameObjects.Text;
  private benchHint?: Phaser.GameObjects.Text;

  // --- Панель правил ---
  private rulesPanelVisible = false;
  private rulesOverlay?: Phaser.GameObjects.Rectangle;
  private rulesPanelObjects: (Phaser.GameObjects.Rectangle | Phaser.GameObjects.Text | Phaser.GameObjects.Graphics)[] = [];
  private rulesObjectSlots: RulesObjectSlot[] = [];
  private rulesSwordSlots: SwordSlot[] = [];
  private rulesTitleText?: Phaser.GameObjects.Text;
  private rulesCloseBtn?: Phaser.GameObjects.Text;
  private rulesSwipeText?: Phaser.GameObjects.Text;
  private rulesDescTexts: Phaser.GameObjects.Text[] = [];
  private rulesUpdateBound?: () => void;

  constructor() {
    super({ key: 'MenuScene' });
  }

  create(): void {
    if (this.registry.get(MenuScene.REG_MUTE) === undefined) {
      this.registry.set(MenuScene.REG_MUTE, false);
    }

    CyberpunkBackground.add(this);

    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;

    const title = this.add
      .text(cx, cy - 180, i18n.t('title'), {
        fontFamily: MONO_FONT,
        fontSize: '72px',
        color: CYBER.cyanCss,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setShadow(0, 0, CYBER.cyanCss, 24, true, true);

    this.tweens.add({
      targets: title,
      alpha: { from: 1, to: 0.82 },
      duration: 1100,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });

    this.subtitleTextObj = this.add
      .text(cx, cy - 120, i18n.t('subtitle').toUpperCase(), {
        fontFamily: MONO_FONT,
        fontSize: '18px',
        color: CYBER.dimCyanCss,
      })
      .setOrigin(0.5)
      .setShadow(0, 0, CYBER.cyanCss, 4, false, true);

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

    this.playPanel = this.add
      .rectangle(cx, cy - 30, this.playText.width + 24, this.playText.height + 12, CYBER.magenta, 0.12)
      .setStrokeStyle(2, CYBER.magenta, 0.95);
    this.playText.setDepth(this.playPanel.depth + 1);

    this.playText.setInteractive({ useHandCursor: true });
    this.playText.on('pointerover', () => {
      this.playText!.setStyle({ color: CYBER.magentaCss });
      this.playPanel!.setStrokeStyle(3, CYBER.magenta, 1);
    });
    this.playText.on('pointerout', () => {
      this.playText!.setStyle({ color: CYBER.whiteCss });
      this.playPanel!.setStrokeStyle(2, CYBER.magenta, 0.95);
    });
    this.playText.on('pointerup', () => {
      this.playSound('game-start', 0.5);
      this.scene.start('GameScene');
    });

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
      this.playSound('ui-button', 0.5);
      this.applyMuteToBgm();
    });

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
      this.playSound('ui-button', 0.5);
      this.refreshTexts();
    });

    this.rulesButton = this.add
      .text(cx, cy + 165, i18n.t('rules'), {
        fontFamily: MONO_FONT,
        fontSize: '17px',
        color: CYBER.cyanCss,
      })
      .setOrigin(0.5)
      .setShadow(0, 0, CYBER.cyanCss, 6, false, true)
      .setInteractive({ useHandCursor: true });
    this.rulesButton.on('pointerup', () => {
      this.playSound('ui-button', 0.5);
      this.showRulesPanel();
    });

    this.benchButton = this.add
      .text(cx, cy + 210, i18n.t('benchmarkBtn'), {
        fontFamily: MONO_FONT,
        fontSize: '14px',
        color: CYBER.dimCyanCss,
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    this.benchButton.on('pointerup', () => {
      void this.runBenchmarkStub();
    });

    this.benchHint = this.add
      .text(cx, cy + 245, i18n.t('benchmarkHint'), {
        fontFamily: MONO_FONT,
        fontSize: '11px',
        color: CYBER.mutedCss,
      })
      .setOrigin(0.5);

    this.createRulesPanel();

    this.startBgm();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.handleShutdown, this);
  }

  // ---------------------------------------------------------------------------
  // Панель правил
  // ---------------------------------------------------------------------------

  private createRulesPanel(): void {
    const depth = 200;
    // Увеличенная панель: 7 колонок × 2 строки объектов + строка мечей.
    const panelW = 980;
    const panelH = 530;
    const panelX = (GAME_WIDTH - panelW) / 2;
    const panelY = (GAME_HEIGHT - panelH) / 2;

    // Затемняющий оверлей.
    this.rulesOverlay = this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.55)
      .setDepth(depth)
      .setInteractive({ useHandCursor: false });
    this.rulesOverlay.on('pointerup', () => this.hideRulesPanel());
    this.rulesOverlay.visible = false;

    // Фон панели.
    const bg = this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, panelW, panelH, 0x0a0a1a, 0.95)
      .setStrokeStyle(2, CYBER.cyan, 0.6)
      .setDepth(depth + 1);
    this.rulesPanelObjects.push(bg);

    // Заголовок.
    this.rulesTitleText = this.add
      .text(GAME_WIDTH / 2, panelY + 28, i18n.t('rulesTitle'), {
        fontFamily: MONO_FONT,
        fontSize: '24px',
        color: CYBER.cyanCss,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setShadow(0, 0, CYBER.cyanCss, 10, true, true)
      .setDepth(depth + 2);
    this.rulesPanelObjects.push(this.rulesTitleText);

    // Кнопка закрытия.
    this.rulesCloseBtn = this.add
      .text(panelX + panelW - 20, panelY + 10, i18n.t('rulesClose'), {
        fontFamily: MONO_FONT,
        fontSize: '15px',
        color: CYBER.dimCyanCss,
      })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true })
      .setDepth(depth + 2);
    this.rulesCloseBtn.on('pointerup', () => this.hideRulesPanel());
    this.rulesPanelObjects.push(this.rulesCloseBtn);

    // Подсказка про свайп.
    this.rulesSwipeText = this.add
      .text(GAME_WIDTH / 2, panelY + 52, i18n.t('rulesSwipe'), {
        fontFamily: MONO_FONT,
        fontSize: '12px',
        color: CYBER.dimCyanCss,
      })
      .setOrigin(0.5)
      .setDepth(depth + 2);
    this.rulesPanelObjects.push(this.rulesSwipeText);

    // --- Секция объектов (сетка 7×2) ---
    const objectsTop = panelY + 78;
    const cols = 7;
    const cellW = panelW / cols;
    const cellH = 160;
    const meshScale = 0.65;
    const startX = panelX + cellW / 2;
    const startY = objectsTop + 10;

    for (let i = 0; i < RULES_OBJECTS.length; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx2 = startX + col * cellW;
      const cy2 = startY + row * cellH;
      const objDef = RULES_OBJECTS[i];
      const mesh = NDT_MESHES[objDef.kind];
      const color = KIND_COLORS[objDef.kind] ?? CYBER.cyan;

      const gfx = this.add.graphics().setDepth(depth + 3);
      this.rulesPanelObjects.push(gfx);

      const desc = this.add
        .text(cx2, cy2 + 60, i18n.t(objDef.descKey), {
          fontFamily: MONO_FONT,
          fontSize: '10px',
          color: CYBER.whiteCss,
          wordWrap: { width: cellW - 8 },
          align: 'center',
        })
        .setOrigin(0.5, 0)
        .setDepth(depth + 2);
      this.rulesPanelObjects.push(desc);
      this.rulesDescTexts.push(desc);

      this.rulesObjectSlots.push({
        kind: objDef.kind,
        mesh,
        color,
        graphics: gfx,
        centerX: cx2,
        centerY: cy2,
        descKey: objDef.descKey,
      });
    }

    // Разделительная линия.
    const sepY = startY + 2 * cellH + 12;
    const sepLine = this.add
      .rectangle(GAME_WIDTH / 2, sepY, panelW - 40, 1, CYBER.cyan, 0.25)
      .setDepth(depth + 1);
    this.rulesPanelObjects.push(sepLine);

    // --- Секция мечей ---
    const swordsTop = sepY + 16;
    const swordCellW = (panelW - 60) / 4;
    const swordStartX = panelX + 30 + swordCellW / 2;

    for (let i = 0; i < SWORD_RULES.length; i++) {
      const sx = swordStartX + i * swordCellW;
      const sy = swordsTop + 24;
      const swordDef = SWORD_RULES[i];
      const props = getSwordProps(swordDef.type);

      // Цветной круг для иконки меча.
      const circleGfx = this.add.graphics().setDepth(depth + 3);
      this.rulesPanelObjects.push(circleGfx);

      // Номер меча + описание.
      const desc = this.add
        .text(sx, sy + 36, `[${i + 1}] ${i18n.t(swordDef.descKey)}`, {
          fontFamily: MONO_FONT,
          fontSize: '10px',
          color: CYBER.whiteCss,
          wordWrap: { width: swordCellW - 8 },
          align: 'center',
        })
        .setOrigin(0.5, 0)
        .setDepth(depth + 2);
      this.rulesPanelObjects.push(desc);
      this.rulesDescTexts.push(desc);

      this.rulesSwordSlots.push({
        type: swordDef.type,
        color: props.color,
        descKey: swordDef.descKey,
        circleGfx,
        centerX: sx,
        centerY: sy,
      });
    }

    // Рисуем статические иконки мечей.
    for (const slot of this.rulesSwordSlots) {
      this.drawSwordIcon(slot);
    }

    this.hideRulesPanelObjects();

    this.rulesUpdateBound = () => this.updateRulesPanel(meshScale);
    this.events.on('update', this.rulesUpdateBound);
  }

  /** Рисует иконку меча — неоновый круг с halo. */
  private drawSwordIcon(slot: SwordSlot): void {
    const g = slot.circleGfx;
    const cx = slot.centerX;
    const cy = slot.centerY;
    const r = 18;
    g.clear();
    // Halo
    g.lineStyle(4, slot.color, 0.15);
    g.strokeCircle(cx, cy, r);
    // Middle
    g.lineStyle(2.5, slot.color, 0.6);
    g.strokeCircle(cx, cy, r);
    // Core
    g.lineStyle(1, 0xffffff, 0.7);
    g.strokeCircle(cx, cy, r);
    // Заливка центра.
    g.fillStyle(slot.color, 0.25);
    g.fillCircle(cx, cy, r);
  }

  /** Трёхслойный неон, идентичный SpawnDirector. */
  private drawWireframeObject(
    gfx: Phaser.GameObjects.Graphics,
    mesh: Mesh3D,
    cx: number,
    cy: number,
    scale: number,
    angleX: number,
    angleY: number,
    color: number,
  ): void {
    gfx.clear();
    const transform = compose(rotateX(angleX), rotateY(angleY));
    const edges = projectOrthographic(mesh, transform);

    let minD = Infinity;
    let maxD = -Infinity;
    for (const e of edges) {
      if (e.depth < minD) minD = e.depth;
      if (e.depth > maxD) maxD = e.depth;
    }
    const span = maxD - minD || 1;

    const scaled = edges.map((e) => ({
      ax: cx + e.ax * scale,
      ay: cy + e.ay * scale,
      bx: cx + e.bx * scale,
      by: cy + e.by * scale,
      depth: e.depth,
    }));

    // 1. Halo
    gfx.lineStyle(7, color, 0.12);
    gfx.beginPath();
    for (const e of scaled) {
      gfx.moveTo(e.ax, e.ay);
      gfx.lineTo(e.bx, e.by);
    }
    gfx.strokePath();

    // 2. Middle
    gfx.lineStyle(3.5, color, 0.55);
    gfx.beginPath();
    for (const e of scaled) {
      gfx.moveTo(e.ax, e.ay);
      gfx.lineTo(e.bx, e.by);
    }
    gfx.strokePath();

    // 3. Core
    for (const e of scaled) {
      const t = (e.depth - minD) / span;
      const alpha = 0.45 + 0.5 * t;
      gfx.lineStyle(1.5, 0xffffff, alpha);
      gfx.beginPath();
      gfx.moveTo(e.ax, e.ay);
      gfx.lineTo(e.bx, e.by);
      gfx.strokePath();
    }
  }

  private updateRulesPanel(scale: number): void {
    if (!this.rulesPanelVisible) return;
    const t = this.time.now * 0.001;
    for (let i = 0; i < this.rulesObjectSlots.length; i++) {
      const slot = this.rulesObjectSlots[i];
      const angleX = t * 0.7 + i * 0.4;
      const angleY = t * 0.9 + i * 0.6;
      this.drawWireframeObject(slot.graphics, slot.mesh, slot.centerX, slot.centerY, scale, angleX, angleY, slot.color);
    }
  }

  private showRulesPanel(): void {
    if (this.rulesPanelVisible) return;
    this.rulesPanelVisible = true;
    if (this.rulesOverlay) this.rulesOverlay.visible = true;
    for (const obj of this.rulesPanelObjects) obj.visible = true;
  }

  private hideRulesPanel(): void {
    if (!this.rulesPanelVisible) return;
    this.rulesPanelVisible = false;
    if (this.rulesOverlay) this.rulesOverlay.visible = false;
    this.hideRulesPanelObjects();
  }

  private hideRulesPanelObjects(): void {
    for (const obj of this.rulesPanelObjects) obj.visible = false;
  }

  // ---------------------------------------------------------------------------
  // Аудио и BGM
  // ---------------------------------------------------------------------------

  private startBgm(): void {
    if (this.isMuted) return;
    try {
      if (!this.game.cache.audio.exists('bgm')) return;
      this.bgm = this.sound.add('bgm', { loop: true, volume: 0.3 });
      this.bgm.play();
    } catch { /* mute */ }
  }

  private applyMuteToBgm(): void {
    if (!this.bgm) return;
    try {
      if (this.isMuted) this.bgm.pause();
      else if (!this.bgm.isPlaying) this.bgm.play();
    } catch { /* mute */ }
  }

  private playSound(key: string, volume: number): void {
    if (this.isMuted) return;
    try {
      if (!this.game.cache.audio.exists(key)) return;
      this.sound.play(key, { volume });
    } catch { /* mute */ }
  }

  private handleShutdown = (): void => {
    try { this.bgm?.stop(); this.bgm?.destroy(); } catch { /* ok */ }
    this.bgm = undefined;
  };

  // ---------------------------------------------------------------------------
  // Текстовые метки
  // ---------------------------------------------------------------------------

  private muteLabel(): string {
    return `[ ${i18n.t(this.isMuted ? 'soundOff' : 'sound')} ]`;
  }

  private langLabel(): string {
    return `[ ${i18n.t('language')}: ${i18n.getLang().toUpperCase()} ]`;
  }

  private refreshTexts(): void {
    const cx = GAME_WIDTH / 2;
    if (this.subtitleTextObj) {
      this.subtitleTextObj.setText(i18n.t('subtitle').toUpperCase());
      if (this.cursor) this.cursor.x = cx + this.subtitleTextObj.width / 2 + 10;
    }
    if (this.playText && this.playPanel) {
      this.playText.setText(`[ ${i18n.t('play')} ]`);
      this.playPanel.setSize(this.playText.width + 24, this.playText.height + 12);
    }
    if (this.hiScoreTextObj) {
      this.hiScoreTextObj.setText(i18n.t('hiScore', { n: zpad(defaultStorage.getHiScore(), 4) }));
    }
    if (this.muteButton) this.muteButton.setText(this.muteLabel());
    if (this.langButton) this.langButton.setText(this.langLabel());
    if (this.rulesButton) this.rulesButton.setText(i18n.t('rules'));
    if (this.rulesTitleText) this.rulesTitleText.setText(i18n.t('rulesTitle'));
    if (this.rulesCloseBtn) this.rulesCloseBtn.setText(i18n.t('rulesClose'));
    if (this.rulesSwipeText) this.rulesSwipeText.setText(i18n.t('rulesSwipe'));
    if (this.benchButton) this.benchButton.setText(i18n.t('benchmarkBtn'));
    if (this.benchHint) this.benchHint.setText(i18n.t('benchmarkHint'));
    // Обновляем описания объектов.
    for (let i = 0; i < this.rulesDescTexts.length; i++) {
      // Первые 14 — объекты, следующие 4 — мечи.
      if (i < RULES_OBJECTS.length) {
        this.rulesDescTexts[i].setText(i18n.t(RULES_OBJECTS[i].descKey));
      } else {
        const si = i - RULES_OBJECTS.length;
        if (si < SWORD_RULES.length) {
          const swordDef = SWORD_RULES[si];
          this.rulesDescTexts[i].setText(`[${si + 1}] ${i18n.t(swordDef.descKey)}`);
        }
      }
    }
  }

  private async runBenchmarkStub(): Promise<void> {
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
