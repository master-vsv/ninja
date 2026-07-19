---
name: phaser-modal-rules-with-rotating-3d
description: Создание модального окна правил в Phaser с вращающимися 3D-wireframe объектами и иконками мечей — трёхслойный неон, projectOrthographic, depth-cueing, i18n.
source: auto-skill
extracted_at: '2026-07-17T15:57:00.000Z'
---

# Модальное окно с вращающимися 3D-объектами и мечами в Phaser

## Когда применять
Когда нужно добавить в сцену меню модальное окно с информацией, где отображаются вращающиеся 3D-wireframe объекты и иконки мечей (например, правила игры со всеми типами объектов).

## Архитектура

### Слойность (z-order)
```
depth 200     — затемняющий оверлей (Rectangle, весь экран, alpha 0.55)
depth 201     — панель (Rectangle, фон + кайма)
depth 202     — текст (заголовок, описания, кнопка закрытия)
depth 203     — wireframe-графика (Graphics, вращающиеся объекты)
```
Меню остаётся на своих depth (0–10) и **не скрывается** — оверлей + панель рисуются поверх.

### Структура данных

```typescript
interface RulesObjectSlot {
  kind: NDTObjectKind;       // тип объекта для выбора меша
  mesh: Mesh3D;              // сама 3D-меш
  color: number;             // цвет wireframe
  descKey: string;           // ключ i18n для описания
  graphics: Phaser.GameObjects.Graphics;  // graphics-объект для рисования
  centerX: number;           // центр рисования на панели
  centerY: number;
}

interface SwordSlot {
  type: SwordType;
  color: number;
  descKey: string;
  circleGfx: Phaser.GameObjects.Graphics;
  centerX: number;
  centerY: number;
}
```

## Трёхслойный неоновый рендер (как в SpawnDirector)

**Важно:** чтобы объекты в панели правил выглядели идентично объектам в игре, используй тот же трёхслойный подход, что и `SpawnDirector.drawWireframe()`:

```typescript
private drawWireframeObject(
  gfx: Phaser.GameObjects.Graphics,
  mesh: Mesh3D,
  cx: number, cy: number, scale: number,
  angleX: number, angleY: number,
  color: number,
): void {
  gfx.clear();
  const transform = compose(rotateX(angleX), rotateY(angleY));
  const edges = projectOrthographic(mesh, transform);
  // projectOrthographic возвращает readonly ProjectedEdge[]
  // каждый элемент: { ax, ay, bx, by, depth }

  // Нормализуем depth для depth-cueing
  let minD = Infinity, maxD = -Infinity;
  for (const e of edges) {
    if (e.depth < minD) minD = e.depth;
    if (e.depth > maxD) maxD = e.depth;
  }
  const span = maxD - minD || 1;

  // Масштабируем координаты
  const scaled = edges.map(e => ({
    ax: cx + e.ax * scale, ay: cy + e.ay * scale,
    bx: cx + e.bx * scale, by: cy + e.by * scale,
    depth: e.depth,
  }));

  // 1. Halo: широкое полупрозрачное свечение
  gfx.lineStyle(7, color, 0.12);
  gfx.beginPath();
  for (const e of scaled) { gfx.moveTo(e.ax, e.ay); gfx.lineTo(e.bx, e.by); }
  gfx.strokePath();

  // 2. Middle: основной неон средней яркости
  gfx.lineStyle(3.5, color, 0.55);
  gfx.beginPath();
  for (const e of scaled) { gfx.moveTo(e.ax, e.ay); gfx.lineTo(e.bx, e.by); }
  gfx.strokePath();

  // 3. Core: тонкая ярко-белая сердцевина с per-edge depth-cueing
  for (const e of scaled) {
    const t = (e.depth - minD) / span;
    const alpha = 0.45 + 0.5 * t;
    gfx.lineStyle(1.5, 0xffffff, alpha);
    gfx.beginPath();
    gfx.moveTo(e.ax, e.ay); gfx.lineTo(e.bx, e.by);
    gfx.strokePath();
  }
}
```

**Ключевые параметры слоёв:**
| Слой | Толщина | Цвет | Альфа | Назначение |
|------|---------|------|-------|------------|
| Halo | 7 | color | 0.12 | Внешний glow |
| Middle | 3.5 | color | 0.55 | Основной неон |
| Core | 1.5 | #ffffff | 0.45–0.95 | Белая сердцевина, ярче на ближних рёбрах |

**Почему:** однослойный рендер (один `lineStyle` с меняющейся толщиной) даёт плоскую картинку без объёма. Трёхслойный создаёт эффект неоновой трубки — именно так объекты выглядят в игре.

## Цвета объектов — бери из SpawnDirector

Не дублируй палитру в MenuScene. Сделай `KIND_COLORS` экспортируемой в SpawnDirector:

```typescript
// В SpawnDirector.ts: const → export const
export const KIND_COLORS: Record<NDTObjectKind, number> = { ... };
```

```typescript
// В MenuScene.ts:
import { KIND_COLORS } from '../systems/SpawnDirector';
const color = KIND_COLORS[objDef.kind] ?? CYBER.cyan;
```

**Why:** Дублирование палитры приводит к расхождению цветов между панелью правил и игрой. Единый источник правды — `KIND_COLORS`.

## Иконки мечей — неоновые круги

Для мечей нет 3D-мешей. Рисуй цветные круги с тем же трёхслойным подходом:

```typescript
private drawSwordIcon(slot: SwordSlot): void {
  const g = slot.circleGfx;
  const r = 18;
  g.clear();
  // Halo
  g.lineStyle(4, slot.color, 0.15);
  g.strokeCircle(cx, cy, r);
  // Middle
  g.lineStyle(2.5, slot.color, 0.6);
  g.strokeCircle(cx, cy, r);
  // Core + fill
  g.lineStyle(1, 0xffffff, 0.7);
  g.strokeCircle(cx, cy, r);
  g.fillStyle(slot.color, 0.25);
  g.fillCircle(cx, cy, r);
}
```

## Компоновка панели: сетка объектов + строка мечей

Для большого числа объектов (14 типов + 4 меча) используй двухсекционную компоновку:

```
┌──────────────────────────────────────────────┐
│  ПРАВИЛА                         × ЗАКРЫТЬ   │
│  Режь объекты свайпом — зарабатывай очки.    │
│                                              │
│  🔩 🔧 📏 📦 🔬 🧲 💧 💣                    │
│  болт гайка лин  эт  щуп магн пен  труба     │
│  ◆  ⬟  ⬡  ⛑  🥽  😷                        │
│  sh  gr  sl  helm gogg mask                  │
│  ─────────────────────────────────────       │
│  ●     ●     ●     ●                         │
│  [1]   [2]   [3]   [4]                       │
│  forged weld  plasm rad                      │
└──────────────────────────────────────────────┘
```

### Параметры сетки для 14 объектов (7×2)
```typescript
const panelW = 980;
const panelH = 530;
const cols = 7;
const cellW = panelW / cols;        // ~140px на ячейку
const cellH = 160;
const meshScale = 0.65;             // мелкие объекты — меньше масштаб
const startX = panelX + cellW / 2;
const startY = objectsTop + 10;

for (let i = 0; i < RULES_OBJECTS.length; i++) {
  const col = i % cols;
  const row = Math.floor(i / cols);
  const cx = startX + col * cellW;
  const cy = startY + row * cellH;
  // ... создание слота
}
```

### Секция мечей под разделителем
```typescript
// Разделительная линия
const sepY = startY + 2 * cellH + 12;
this.add.rectangle(GAME_WIDTH / 2, sepY, panelW - 40, 1, CYBER.cyan, 0.25);

// Мечи в строку
const swordsTop = sepY + 16;
const swordCellW = (panelW - 60) / 4;
```

## Создание оверлея и панели

### 1. Затемняющий оверлей (кликабельный для закрытия)
```typescript
this.rulesOverlay = this.add
  .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.55)
  .setDepth(200)
  .setInteractive({ useHandCursor: false });
this.rulesOverlay.on('pointerup', () => this.hideRulesPanel());
this.rulesOverlay.visible = false; // скрыт изначально
```

### 2. Update-цикл для вращения (только когда панель видна)
```typescript
this.rulesUpdateBound = () => this.updateRulesPanel(meshScale);
this.events.on('update', this.rulesUpdateBound);

private updateRulesPanel(scale: number): void {
  if (!this.rulesPanelVisible) return;  // не тратим кадры когда панель скрыта
  const t = this.time.now * 0.001;
  for (let i = 0; i < this.rulesObjectSlots.length; i++) {
    const slot = this.rulesObjectSlots[i];
    const angleX = t * 0.7 + i * 0.4;
    const angleY = t * 0.9 + i * 0.6;
    this.drawWireframeObject(slot.graphics, slot.mesh, slot.centerX, slot.centerY, scale, angleX, angleY, slot.color);
  }
}
```

### 3. Показ/скрытие — используй свойство `.visible`
```typescript
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
  for (const obj of this.rulesPanelObjects) obj.visible = false;
}
```

**Не используй `setVisible()`** — в Phaser 4 `GameObject` не гарантирует этот метод. Используй свойство `.visible`. Для массивов указывай union-тип: `(Phaser.GameObjects.Rectangle | Phaser.GameObjects.Text | Phaser.GameObjects.Graphics)[]`.

## Интеграция с i18n

Тексты на панели должны обновляться при смене языка. В методе `refreshTexts()`:
```typescript
if (this.rulesTitleText) this.rulesTitleText.setText(i18n.t('rulesTitle'));
if (this.rulesCloseBtn) this.rulesCloseBtn.setText(i18n.t('rulesClose'));
if (this.rulesSwipeText) this.rulesSwipeText.setText(i18n.t('rulesSwipe'));
for (let i = 0; i < this.rulesDescTexts.length; i++) {
  if (i < RULES_OBJECTS.length) {
    this.rulesDescTexts[i].setText(i18n.t(RULES_OBJECTS[i].descKey));
  } else {
    const si = i - RULES_OBJECTS.length;
    this.rulesDescTexts[i].setText(`[${si + 1}] ${i18n.t(SWORD_RULES[si].descKey)}`);
  }
}
```

## Исправленная ошибка: панель не должна скрывать меню

**Неправильно:** скрывать элементы меню через `setMenuObjectsVisible(false)` при показе панели. Результат: меню исчезает, панель на пустом фоне — выглядит как пропавшее меню, а не модальное окно.

**Правильно:** меню остаётся видимым, поверх него кладётся полупрозрачный затемняющий оверлей + панель. Это даёт ощущение модального окна.

## Проверено на практике
- Проект: NDT Ninja (Phaser 4.2.1, киберпанк-меню)
- 14 типов 3D-объектов в сетке 7×2 + 4 меча отдельной строкой
- Трёхслойный неон: Halo(7px, 12%) + Middle(3.5px, 55%) + Core(1.5px, white, depth-cued)
- Цвета из `KIND_COLORS` (единый источник с SpawnDirector)
- Вращение: непрерывное, 60 fps, сдвиг фазы для каждого объекта
- Закрытие: кнопка `×` или клик по оверлею
