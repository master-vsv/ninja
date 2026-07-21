---
name: phaser-3-to-4-migration
description: Миграция игры с Phaser 3.x на Phaser 4.x — проверка совместимости API, установка, исправление ошибок типов и верификация.
source: auto-skill
extracted_at: '2026-07-17T14:14:35.688Z'
---

# Миграция с Phaser 3 на Phaser 4

## Предварительный анализ (без установки)

1. **Узнай последнюю стабильную версию Phaser 4** из npm: `npm view phaser versions --json | grep '"4\.'`.
2. **Установи Phaser 4 во временную директорию** и изучи типы, не трогая проект:
   ```bash
   cd /tmp && mkdir phaser4-check && cd phaser4-check && npm init -y && npm install phaser@4.x
   ```
3. **Проверь все используемые API** по файлу `node_modules/phaser/types/phaser.d.ts`. Ищи:
   - `class Scene` — базовый класс сцен
   - `class Game` — конструктор игры
   - `GameConfig` — структура конфига
   - `class Graphics`, `class Text` — игровые объекты
   - `namespace Matter`, `fromVertices` — физика
   - `class EventEmitter` — события
   - `SHUTDOWN`, `DESTROY`, `PRE_UPDATE`, `UPDATE` — события сцен
   - `Scale.FIT`, `Scale.CENTER_BOTH` — масштабирование
   - `sound.play`, `sound.add`, `sound.unlock` — аудио
   - `tweens.add`, `killTweensOf` — твины
   - `time.addEvent`, `time.delayedCall` — таймеры
   - `input.on`, `input.keyboard`, `activePointer` — ввод
   - `cameras.main.shake`, `cameras.main.flash` — камера
   - `Math.Between`, `Math.Clamp`, `Math.Vector2` — математика
   - `Geom.Circle`, `Circle.Contains` — геометрия
   - `DataManager` / `registry.get/set` — данные
   - `LoaderPlugin` / `load.audio` — загрузка

   **Why:** Phaser 4 API на 95% совместимо с 3.x, но есть точечные изменения в конфигах (см. ниже). Предварительная проверка типов исключает сюрпризы.
   **How to apply:** После подтверждения совместимости — переходи к установке в проекте.

## Шаги миграции

### 1. Обнови `package.json`
```diff
- "phaser": "3.90.0",
+ "phaser": "^4.2.1",
```

### 2. Установи и проверь типы
```bash
npm install
npx tsc --noEmit
```

### 3. Типовые ошибки и их исправления

| Ошибка | Причина | Исправление |
|--------|---------|-------------|
| `'preventPointer' does not exist in type 'TouchInputConfig'` | Поле переименовано | Заменить на `capture: true` |
| `'mouseIsDisabled' does not exist in type 'InputConfig'` | Поле удалено | Удалить строку |
| `Property 'length' does not exist on type 'boolean'` (на `world.has()`) | `Matter.World.has()` теперь возвращает `boolean`, а не объект | Убрать `.length`, использовать как `boolean` |
| `Property 'setVisible' does not exist on type 'GameObject'` | `GameObject` не имплементирует `Components.Visible` напрямую — метод `setVisible` недоступен на базовом типе | Использовать свойство `.visible` (есть у `Rectangle`, `Text`, `Graphics`) или union-тип `(Rectangle \| Text \| Graphics)[]` |
| `Property 'visible' does not exist on type 'GameObject'` | Та же причина — `GameObject[]` не даёт доступ к `visible` | Использовать union-тип массива: `(Phaser.GameObjects.Rectangle \| Phaser.GameObjects.Text \| Phaser.GameObjects.Graphics)[]` |

### 4. `projectOrthographic` — изменился возвращаемый тип
В Phaser 4 `projectOrthographic(mesh, transform)` возвращает **плоский массив** `readonly ProjectedEdge[]`, а не объект с полем `edges`. Поля ребра: `ax`, `ay`, `bx`, `by`, `depth` (вместо `projected[0]/[1]`).

### 5. Запусти тесты и сборку
```bash
npm run test:run   # все тесты должны пройти
npm run build      # production-сборка (Vite + PWA)
```

### 5. Если тесты падают — ищи рантайм-изменения
Phaser 4 может изменить поведение методов, не отражённое в типах. Проверяй:
- Порядок и типы аргументов `scene.tweens.add()`
- Формат конфига `scene.add.graphics()` (теперь принимает `Options` объект, но без аргументов работает как раньше)
- Поведение `scene.matter.add.fromVertices()` с `poly-decomp`

## Проверено на практике
- Проект: NDT Ninja (Phaser 3.90.0 → 4.2.1, 107 .ts файлов, 25 с Phaser-зависимостью)
- Результат: 3 ошибки типов (все исправлены), 959 тестов прошли, сборка успешна
