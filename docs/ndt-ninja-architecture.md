---
title: "NDT-Ninja: архитектура"
date: 2026-07-14
type: architecture
status: reviewed
stack: "Phaser 3 + Matter.js + PolyK (+ poly-decomp)"
target: "Браузер (десктоп + мобильный)"
theme: "Неразрушающий контроль (NDT)"
related_doc: "ndt-ninja-plan.md"
---

# 🥷 NDT-Ninja: архитектура

> Клон Fruit Ninja в браузере в теме **неразрушающего контроля (NDT)**. Вместо фруктов режем
> эталоны, линейки, болты, гайки; трубы играют роль бомб. Мечи: кованый, сварка, плазма, радиация.
> Платформа: десктоп + мобильный. Физика: реалистичные твёрдые тела. Стек: JS/TS.
>
> План реализации вынесен в отдельный документ: [`ndt-ninja-plan.md`](./ndt-ninja-plan.md).

**Доверие к материалу.** Движковый/технический блок опирается на верифицированные первичными
источниками факты (18 подтверждённых утверждений из 25 проверенных в ходе глубокого исследования).
Дизайн-специфичные системы игры (эффекты мечей, механика «труб-бомб», комбо, прогрессия) явно
помечены как **инженерная синтез** — отдельных источников по ним нет.

---

## TL;DR — выбор стека

| Слой | Рекомендация | Обоснование |
|---|---|---|
| **Рендер + игровой фреймворк** | **Phaser 3** (или 4) | Полный фреймворк: WebGL-рендер, физика, ввод, аудио, сцены — «всё из коробки» |
| **Физика (твёрдые тела)** | **Matter.js** (встроен в Phaser) | `physics: { default: 'matter' }` — без отдельной npm-установки и ручной синхронизации |
| **Слайсинг (разрезание)** | **PolyK** + recreation тел | Доказанно рабочий паттерн для механики Fruit Ninja в браузере |
| **Альтернатива (макс. перф)** | **Rapier 2D** (`@dimforge/rapier2d`, WASM+SIMD) + **PixiJS** | Если на экране десятки/сотни осколков и Matter.js не тянет |

**Итог:** стартуем на **Phaser 3 + Matter.js + PolyK + poly-decomp** — самый быстрый путь к
рабочему слайсингу. Перф-критичный путь (массовый разлёт осколков) **проверяется fail-fast
бенчмарком в фазах 0 и 3** (количественные пороги — см. [`ndt-ninja-plan.md`](./ndt-ninja-plan.md)).
При провале после субшагов/raycast-ворот/cap velocity — миграция на Rapier+PixiJS **до** старта
фаз 4–6. Продуктовый формат — **аркадный таймкиллер**: тема НК косметическая, фокус на juice.

---

## 1. Сравнение движков (верифицированные факты)

### Рендер / фреймворки

| Движок | Что это | Плюсы | Минусы для нас |
|---|---|---|---|
| **Phaser 3/4** ✅ | Полный game-фреймворк | WebGL+Canvas fallback, **2 физики встроены** (Arcade + Matter.js), унифицированный ввод (мышь/touch/gamepad, multi-touch), аудио, сцены | Рендер «из коробки» чуть менее батч-оптимизирован, чем чистый PixiJS (на гигантских кучах спрайтов) |
| **PixiJS v8** | Только рендер | Лучший батчинг: **до 16 текстур за 1 draw call**; ParticleContainer — 1 000 000 частиц @60fps vs 200 000 спрайтов | **Нет** физики/аудио/сцен/ввода — всё интегрируется вручную |
| PlayCanvas / Kaplay | Полноценные движки | Хороши для 3D / своего подхода | Меньше готовых туториалов именно по Fruit Ninja-слайсингу в JS |

> ⚠️ Утверждение «PixiJS рендерит спрайты быстрее Phaser» в нашем диапазоне нагрузок **не
> подтверждено** (голоса 1-2) — не опирайтесь на него без своего замера.

### Физдвижки

| Движок | Тип | Подключение | Замечания |
|---|---|---|---|
| **Matter.js** ✅ | Чистый JS | **Встроен в Phaser** | Rigid body, constraints, joints, sensors, `fromVertices` для полигонов. **Ограничения:** только выпуклые тела (вогнутые → `poly-decomp`), **нет continuous collision detection (CCD)** → туннелирование быстрых осколков |
| **Rapier 2D** | Rust → WASM+SIMD | Отдельный пакет `@dimforge/rapier2d`, без рендера | Максимальная производительность (compiled code), но нужна явная связка с рендером + инициализация WASM. Официальный пример — связка с PixiJS |
| Planck.js | JS-порт Box2D | Community-плагин `phaser3-planck` (~24★) | Алгоритмы Box2D, но плагин маленький — риск поддержки |

> ⚠️ Популярность/звёзды Matter.js vs Planck.js — **конкретные числа опровергнуты** (0-3). Не
> выбирайте движок по количеству звёзд.

---

## 2. Архитектура систем *(инженерная синтез на верифицированной базе)*

```
┌─────────────────────────────────────────────────────────┐
│  Bootstrap: Phaser.Game (config: matter physics, FIT, landscape)│
│  Scenes: Boot → Preload → Menu → Game ↔ GameOver        │
│          + HUD (overlay, scene.launch('HUD') в параллели с Game)│
├─────────────────────────────────────────────────────────┤
│  GameScene (фасад, связывает системы через events)      │
│                                                         │
│  ┌──────────────┐   ┌──────────────┐  ┌──────────────┐ │
│  │ InputSystem  │   │ SpawnDirector│  │ ScoreSystem  │ │
│  │ (pointer →   │   │ (волны NDT-  │  │ (очки +      │ │
│  │  swipe trail)│   │  объектов)   │  │  комбо)      │ │
│  └──────┬───────┘   └──────┬───────┘  └──────────────┘ │
│         │                  │                            │
│  ┌──────▼──────────────────▼───────┐  ┌──────────────┐ │
│  │     SliceSystem (детектор)      │  │ SwordSystem  │ │
│  │  line-segment ∩ body, каждый кадр│◄─┤ (активный    │ │
│  └──────────────┬──────────────────┘  │  меч: эффект)│ │
│                 │                      └──────────────┘ │
│  ┌──────────────▼──────────────────┐  ┌──────────────┐ │
│  │  BodySplitter (PolyK)           │  │ BombSystem   │ │
│  │  полигон → 2 новых тела + спрайт│  │ (трубы:     │ │
│  └──────────────┬──────────────────┘  │  game over)  │ │
│                 │                      └──────────────┘ │
│  ┌──────────────▼──────────────────┐                    │
│  │  FXSystem: частицы, шейдеры,    │                    │
│  │  screen-shake, haptics, audio   │                    │
│  └─────────────────────────────────┘                    │
├─────────────────────────────────────────────────────────┤
│  Persistence: Storage.ts (localStorage try/catch, ключ ndt-ninja:hi-score:v1) │
└─────────────────────────────────────────────────────────┘
```

### Сцены — жизненный цикл

- **BootScene → PreloadScene → MenuScene.** Линейный старт.
- **MenuScene.** Кнопка Play, отображение рекорда, mute-toggle. По Play →
  `scene.start('Game')` + `scene.launch('HUD')`.
- **GameScene ↔ GameOverScene.** При `isGameOver === true` (потеря жизней или труба):
  `scene.pause('Game')` + `scene.launch('GameOver')`. GameOverScene — оверлей поверх
  паузенной GameScene. Кнопка Restart → `scene.stop('GameOver')` + `scene.restart('Game')`.
- **HUDScene (оверлей).** Запускается параллельно с GameScene через `scene.launch('HUD')`,
  работает поверх неё. Подписана на EventBus: жизни, счёт, активный меч (пост-MVP).

### Ключевые системы — как устроены

**▶ InputSystem (ввод).** Pointer Events — единая device-agnostic модель:
`pointerdown/move/up/cancel` захватывают полную траекторию свайпа. Для быстрых свайпов —
`getCoalescedEvents()` восстанавливает промежуточные точки (иначе `pointermove` коалесцируется).
**Обязательно:** CSS `touch-action: none` на канвасе, иначе браузер перехватит свайп под скролл
и пришлёт `pointercancel`.

**▶ SpawnDirector (спавн по волнам).** Генерирует NDT-объекты с баллистическими дугами (стартовая
скорость + гравитация Matter.js). Состав волны эскалирует: больше болтов/гаек → больше труб-бомб →
выше скорость. Объект — это `Matter body` (выпуклый полигон из `fromVertices`) + спрайт.

**▶ SliceSystem (детектор разреза).** Каждый кадр: берём последний сегмент свайпа
(point_prev → point_curr), проверяем пересечение с баунд-боксами тел, при попадании — точная
проверка пересечения линии с полигоном тела.

**▶ BodySplitter (разбиение, ядро механики).** При разрезе: `PolyK` режет полигон тела на 2 новых
полигона → старое тело удаляется → создаются 2 новых Matter-тела (по половинке) с импульсом вдоль
нормали разреза (имитация «разлёта») + 2 спрайта с текстурной маской. **Практические грабли:**
только выпуклые фрагменты (вогнутые требуют `poly-decomp`); быстрые осколки могут туннелировать
без CCD — нужны субшаги физики или raycast-ворота.

**▶ SwordSystem (4 меча под тему NDT).** Активный меч задаёт свойства разреза + визуальный стиль:

| Меч | Визуальный эффект (синтез) | Геймплей-свойство | Измеримый тест (фаза 5) |
|---|---|---|---|
| 🗡️ **Кованый** (forged) | Металлический блюр-след, чистый срез | Базовый ровный разрез | 1 болт, 1 свайп → ровно 2 осколка. |
| 🔥 **Сварка** (welding) | Искры/брызги (particle emitter), оранжевый glow | Поджигает край среза | После разреза — анимация горения на срезе ≥ 500 мс. |
| ⚡ **Плазма** (plasma) | Шейдер glow + высокотемпературный след, широкий рез | Режет до 3 объектов за свайп | 3 болта в линию, 1 свайп → 3 разреза, 6 осколков. |
| ☢️ **Радиация** (radiation) | Зелёное сияние, частицы, звук счётчика Гейгера | **Slowmo 2–3 сек** при активации | `scene.time.timeScale` = 0.5 на 2–3 сек; осколки замедляются; green-glow оверлей. |

**Slowmo и Matter.js time-scale (меч «Радиация»).** При активации замедляется вся сцена:
`scene.time.timeScale = 0.5` на 2–3 сек + green-glow оверлей. Для физики Matter.js нужно
проверить (фаза 5), корректно ли Matter runner замедляется через `scene.time.timeScale`,
или требуется отдельная настройка `matter.world` (например, увеличение `engine.timing.timeScale`).
Открытый риск №9 в [`ndt-ninja-plan.md`](./ndt-ninja-plan.md).

**▶ SliceEvent — контракт межсистемного обмена (фаза 3).** Единственный канал связи между
системами — `EventBus` (обёртка над `Phaser.Events.EventEmitter`). Прямых ссылок
`SliceSystem → ScoreSystem` нет: всё через события.

```typescript
interface SliceEvent {
  readonly id: string;
  readonly timestamp: number;
  readonly bodyId: number;
  readonly kind: 'bolt' | 'nut' | 'ruler' | 'standard' | 'pipe';
  readonly isBomb: boolean;            // true только для 'pipe'
  readonly slice: { from: Vec2; to: Vec2; angle: number };
  readonly swordType: SwordType | null; // null в MVP (до фазы 5)
  readonly fragments: ReadonlyArray<{ vertices; velocity }>;
}
```

Event-flow:

```
InputSystem ──► SliceSystem (детект segment ∩ body)
                    │
                    ├─► BodySplitter (PolyK + poly-decomp → фрагменты)
                    │
                    └─► EventBus.emit('slice', SliceEvent)
                              │
                              ├─► BombSystem:  if (event.isBomb) → мгновенный game over + взрыв
                              ├─► ScoreSystem: += очки (× комбо в фазе 6)
                              ├─► FXSystem:    звук + частицы + screen-shake
                              └─► SwordSystem: (пост-MVP) применение эффекта меча
```

Контракт фиксируется в фазе 3; фазы 4 и 5 только **расширяют** потребителей, не меняя
полей SliceEvent. Полный текст контракта — в [`ndt-ninja-plan.md`](./ndt-ninja-plan.md).

**▶ BombSystem (трубы).** Труба — это NDT-объект-«бомба» (`isBomb=true`). При разрезе
(через SliceEvent с `isBomb === true`) → **мгновенный game over** (независимо от жизней)
+ взрыв + screen-shake. Упущенная (не разрезанная) труба штрафа не несёт — это мина, не цель.

**▶ LifeSystem + failstate (фаза 4, MVP).** 3 жизни. Упущенный режимый объект
(ушёл за нижний край) → −1 жизнь. При 0 жизнях — `isGameOver = true`. Труба-бомба при разрезе
→ мгновенный game over (срабатывает независимо от числа жизней). Упущенная труба штрафа не несёт.
При `isGameOver === true`: `scene.pause('Game')` + `scene.launch('GameOver')`.

| Событие | Следствие |
|---|---|
| Режимый объект упущен | `lives -= 1`; при `lives === 0` → game over |
| Труба разрезана | `isGameOver = true` (мгновенно) + взрыв + screen-shake |
| Труба упущена | Штрафа нет (мина, не цель) |

**▶ ScoreSystem + прогрессия.** Базовый счёт (MVP, фаза 4) — очки за каждый разрез.
Множитель комбо за серию разрезов в окне времени (пост-MVP, фаза 6). Волны с растущей
сложностью (пост-MVP, фаза 6); параметры волн — метрики `WaveConfig` (см. план).
Рекорд в `localStorage` через `persistence/Storage.ts` (try/catch + версионированный ключ
`ndt-ninja:hi-score:v1`) — входит в MVP.

**▶ Persistence.** `persistence/Storage.ts` оборачивает `localStorage` в `try/catch`
(приватный режим / quota exceeded → не падать). Ключи версионированы: `ndt-ninja:hi-score:v1`.
При смене схемы данных — миграция в новой версии ключа.

> **Важно:** техника themed-эффектов (шейдеры glow/частицы для плазмы/радиации), механика
> «труб-бомб», комбо и прогрессия **не покрыты источниками** — это дизайн-решения.
> Продуктовые решения зафиксированы: failstate (3 жизни + труба = game over), радиация = slowmo,
> формат — аркадный таймкиллер (тема НК косметическая). См. [`ndt-ninja-plan.md`](./ndt-ninja-plan.md).

---

## 3. Кросс-платформенный ввод и адаптив *(верифицировано)*

- **Ввод:** Pointer Events (один код для мыши/pen/touch) + `touch-action: none`.
- **Адаптив:** scale mode **FIT** (масштабирование игры под контейнер). ⚠️ **Избегать RESIZE** на
  full-screen — даёт 1:1 пиксели канваса и легко упирается в **fill-rate GPU**. Если нужен RESIZE —
  ограничивать физическое разрешение канваса.
- **Координаты:** при CSS-масштабировании канваса координаты pointer'а (`clientX/Y`) нужно
  приводить обратно в пространство игры (через scale-ratio) — иначе «промахи».

---

## 4. Оптимизация под мобильный WebGL *(верифицировано)*

- **Draw calls:** целевой ориентир — **<50 на мобильных, <200 на десктопе**. Минимизация
  `gl.drawArrays`/`drawElements` — ключевой рычаг.
- **Батчинг:** Phaser/PixiJS батчат спрайты (до 16 текстур/call) — используйте **texture atlas**
  (все NDT-объекты в одном атласе).
- **Object pooling:** осколки и частицы — переиспользовать, не создавать/удалять каждый кадр
  (сборка мусора убьёт fps).
- **Частицы:** Phaser-частицы / PixiJS `ParticleContainer` (до 1M @60fps). Для мечей-эффектов —
  обязательны.

---

## 5. Источники

- [Phaser — Physics concepts (офиц. доки)](https://docs.phaser.io/phaser/concepts/physics) ·
  [Matter в Phaser](https://docs.phaser.io/phaser/concepts/physics/matter) ·
  [Input](https://docs.phaser.io/phaser/concepts/input)
- [Slicing Matter bodies с PolyK — офиц. Phaser news](https://phaser.io/news/2019/08/slicing-splitting-and-cutting-matter-physics-bodies)
- [Emanuele Feronato — полный туториал Phaser+Matter.js+PolyK](https://emanueleferonato.com/2019/03/15/slicing-splitting-and-cutting-html5-physics-bodies-using-phaser-matter-js-and-polyk/)
- [Rapier — JS getting started (офиц.)](https://rapier.rs/docs/user_guides/javascript/getting_started_js/) ·
  [Rapier.rs](https://rapier.rs)
- [nape-js benchmark (Rapier WASM+SIMD)](https://napejs.org/benchmark.html)
- [Planck.js (JS-порт Box2D)](https://github.com/piqnt/planck.js)
- [PixiJS — performance tips](https://pixijs.com/8.x/guides/concepts/performance-tips) ·
  [ParticleContainer v8](https://pixijs.com/blog/particlecontainer-v8) ·
  [What PixiJS Is Not](https://pixijs.com/7.x/guides/basics/what-pixijs-is-not)
- [MDN — Using Pointer Events](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events/Using_Pointer_Events) ·
  [W3C Pointer Events L3](https://www.w3.org/TR/pointerevents/)
- [Phaser ScaleManager (RESIZE vs FIT)](https://photonstorm.github.io/phaser3-docs/Phaser.Scale.ScaleManager.html)
- [GameDevJS — оптимизация WebGL (draw calls <50 mobile)](https://gamedevjs.com/articles/best-practices-of-optimizing-game-performance-with-webgl/)
- [Phaser performance optimization guide](https://generalistprogrammer.com/tutorials/phaser-performance-optimization-guide)
