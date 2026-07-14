---
title: "NDT-Ninja: план реализации (аркадный формат)"
date: 2026-07-14
updated: 2026-07-14
type: plan
status: reviewed
revision: 2
stack: "Phaser 3 + Matter.js + PolyK (+ poly-decomp)"
target: "Браузер (десктоп + мобильный, landscape)"
theme: "Неразрушающий контроль (NDT) — косметическая тема"
related_doc: "ndt-ninja-architecture.md"
review_status: "needs-rework → переработан по замечаниям plan-reviewer"
---

# NDT-Ninja: план реализации (аркадный формат)

> Клон Fruit Ninja в теме неразрушающего контроля (NDT). Болты, гайки, линейки, эталоны
> режутся; трубы играют роль бомб. Четыре меча (кованый / сварка / плазма / радиация=slowmo).
>
> Продуктовый формат: **B — аркадный таймкиллер**. Тема НК косметическая, не обучающая.
> Фокус — на ощущении «нарезки» (juice), комбо, скорости, эффектах.
>
> Архитектура и стек: [`ndt-ninja-architecture.md`](./ndt-ninja-architecture.md).

## Зафиксированные продуктовые решения (не обсуждаются)

1. **Формат (B): аркадный таймкиллер.** Тема НК — косметическая.
2. **Failstate:** 3 жизни. Потеря жизни = упущенный объект. Труба-бомба = мгновенный game over.
3. **Меч «Радиация» = Slowmo:** активация замедляет время на 2–3 сек через time-scale
   физики Matter.js + визуальный green-glow. Открывает окно для длинного комбо.
4. **Ориентация: Landscape.**
5. **Целевые устройства:** iPhone SE 2020 (A13, iOS), Samsung Galaxy A52 (Snapdragon 720G, Android).

## Принцип плана

Каждый этап имеет **verifiable checkpoint** — объективный, проверяемый в браузере критерий.
Этап закрыт, когда checkpoint пройден. На критичных развилках (фазы 0/3) стоят
**fail-fast gate** с количественными порогами — при провале возвращаемся к выбору стека
(Matter.js → Rapier + PixiJS), не дожидаясь фазы 7.

## MVP-граница (явно)

**MVP = фазы 0–4** + базовый счёт (очки за разрез) + жизни (failstate) + минимальный juice
(звук/частицы/screen-shake — заложены в фазу 3) + UI-сцены (Menu / GameOver / HUD) +
рекорд в localStorage. Это самостоятельный, играбельный таймкиллер без 4 мечей и эскалации волн.

**Пост-MVP:** фаза 5 целиком (4 меча, шейдеры, slowmo), остаток фазы 6 (комбо-множитель,
волны — рекорд уже в MVP), фаза 7 (pooling/atlas/haptics/тюн).

---

## Структура проекта (детализация фазы 0)

```
src/
├── main.ts                    # точка входа, создаёт Phaser.Game
├── config/
│   ├── game.ts                # Phaser.Types.Core.GameConfig (matter physics, FIT, landscape)
│   ├── physics.ts             # matter runner: isFixed, substeps, delta
│   ├── objects.ts             # реестр NDT-объектов: kind → {vertices, sprite, slicable, isBomb}
│   ├── waves.ts               # параметры волн (пост-MVP, фаза 6)
│   └── swords.ts              # конфиг мечей (пост-MVP, фаза 5)
├── scenes/
│   ├── BootScene.ts           # инициализация, переход в Preload
│   ├── PreloadScene.ts        # загрузка ассетов, атлас, аудио
│   ├── MenuScene.ts           # кнопка Play, рекорд, mute-toggle        [MVP, фаза 4]
│   ├── GameScene.ts           # фасад: создаёт системы, связывает через EventBus
│   ├── GameOverScene.ts       # оверлей поверх GameScene: финальный счёт, рекорд, Restart [MVP, фаза 4]
│   └── HUDScene.ts            # оверлей: жизни, счёт, активный меч (пост-MVP). scene.launch('HUD')
├── systems/
│   ├── InputSystem.ts         # pointer events + coalesced + audio unlock   [фаза 1]
│   ├── SpawnDirector.ts       # баллистика + волны                          [фаза 2 / 6]
│   ├── SliceSystem.ts         # детектор segment ∩ body, эмитит SliceEvent  [фаза 3]
│   ├── BodySplitter.ts        # PolyK + poly-decomp, создаёт фрагменты      [фаза 3]
│   ├── BombSystem.ts          # труба → game over + взрыв                   [фаза 4]
│   ├── LifeSystem.ts          # 3 жизни, упущенный объект → −1              [фаза 4]
│   ├── ScoreSystem.ts         # очки за разрез + комбо (пост-MVP)           [фаза 4 / 6]
│   ├── SwordSystem.ts         # активный меч, slowmo для радиации           [пост-MVP, фаза 5]
│   └── FXSystem.ts            # звук/частицы/screen-shake                   [фаза 3 (min), 5/7 (full)]
├── events/
│   ├── EventBus.ts            # обёртка над Phaser.Events.EventEmitter
│   ├── SliceEvent.ts          # контракт SliceEvent (см. ниже)              [фаза 3]
│   └── types.ts               # NDTObjectKind, SwordType, общие типы
├── objects/
│   ├── NDTObject.ts           # фабрика Matter body + sprite из config.objects
│   └── Fragment.ts            # осколок (тело + спрайт + маска), TTL
├── persistence/
│   └── Storage.ts             # localStorage с try/catch + версионированием  [фаза 4]
└── benchmark/
    └── physics-bench.ts       # изолированный бенчмарк Matter vs Rapier     [фаза 0 / 3]
```

Принцип: `events/` — единственный канал связи между системами. Никаких прямых ссылок
`SliceSystem → ScoreSystem`. Сцены общаются через `scene.launch()`/`scene.pause()` и EventBus.

---

## Пошаговый план (фазы 0–7)

| # | Этап | Задачи | Checkpoint (измеримый) |
|---|---|---|---|
| **0** | **Скаффолд + бенчмарк физдвижка** | Vite + TS + Phaser 3; структура проекта (см. выше); пустые сцены Boot → Preload → Menu-stub; FIT-scale (landscape, напр. 1280×720); `touch-action: none` на канвасе; dev-сервер. **Изолированный бенчмарк** `benchmark/physics-bench.ts`: N Matter-тел в коробке с гравитацией, без слайсинга, на целевых устройствах. | Канвас рендерится на десктопе и мобиле; свайп по странице не скроллит её. Бенчмарк: при N=50 тел fps ≥ 55 на iPhone SE 2020 и Galaxy A52 (среднее за 30 сек). **Retina-gate (риск №10): на iPhone SE 2020 (DPR ≥ 2) fps удерживается при FIT-scale; при провале — ограничить `resolution` канваса ≤ 2 и повторить замер.** Отчёт сохранён. |
| **1** | **InputSystem + AudioContext unlock** | Pointer Events (`pointerdown/move/up/cancel`); буфер траектории свайпа (последние N точек); **`getCoalescedEvents()` с fallback на обычный `pointermove`** для Safari iOS < 14.5; отрисовка следа (Graphics). **`AudioContext` unlock на первом `pointerdown`** через `this.sound.unlock()` (мобильные браузеры блокируют автостарт). | Плавный след за пальцем/мышью без разрывов на быстрых свайпах (≥ 2 свайпа/сек, длина ≥ 400px). На iOS аудио после первого тапа играет (тест: короткий click-сэмпл). |
| **2** | **SpawnDirector + физика** | `physics: { default: 'matter', matter: { ...config.physics } }` (isFixed, substeps). Спавн NDT-объекта как `Matter body` (`fromVertices`) + спрайт; баллистическая дуга (стартовая скорость + гравитация + вращение). Деспавн при выходе за пределы экрана (событие для LifeSystem в фазе 4). | Болт взлетает дугой с нижней кромки, вращается, падает под гравитацией; уходит за нижний край → корректно удаляется (нет утечки тел в мире Matter). |
| **3** | **Ядро слайсинга + SliceEvent + juice + fail-fast gate** | (а) **SliceSystem**: пересечение segment свайпа ∩ баунд-бокс тела → точная проверка ∩ полигон. (б) **BodySplitter через PolyK** + **`poly-decomp` как прямая зависимость** (для вогнутых фрагментов после разреза). 2 новых тела + 2 спрайта с маской; импульс разлёта вдоль нормали реза. (в) **Контракт `SliceEvent` зафиксировать** (см. ниже) + **EventBus event-flow**: `SliceSystem → emits SliceEvent → {BombSystem (заглушка), ScoreSystem (заглушка), FXSystem} consume`. Заглушки нужны, чтобы фазы 4/5 расширяли, а не переписывали. (г) **Минимальный juice**: звук разреза, частицы слайса (до 10), микро screen-shake (≤ 4px, 80 мс). (д) **Повторный бенчмарк с реальным слайсингом** → fail-fast gate (см. ниже). | Свайп через тело → 2 физических осколка разлетаются. SliceEvent эмитится, его поля соответствуют контракту. Звук и частицы срабатывают на каждом разрезе. **Fail-fast gate пройден** (количественные пороги — см. ниже). При провале — переключение на Rapier+PixiJS ДО старта фазы 4. |
| **4** | **[MVP] Контент + failstate + UI-сцены + рекорд** | (а) Контент: болты, гайки, линейки, эталоны (режутся); **трубы-бомбы** (`isBomb=true`). (б) **BombSystem**: труба при разрезе → мгновенный game over + взрыв (частицы + screen-shake). (в) **LifeSystem**: 3 жизни, упущенный объект (деспавн за нижним краем) → −1 жизни, при 0 → game over. (г) **ScoreSystem (базовый счёт)**: +очки за каждый разрез (фикс. очки за объект). (д) **HUDScene** (оверлей через `scene.launch('HUD')`): жизни, счёт. (е) **MenuScene**: Play, отображение рекорда, mute-toggle. (ж) **GameOverScene** (оверлей через `scene.pause('Game'); scene.launch('GameOver')`): финальный счёт, рекорд, Restart. (з) **`persistence/Storage.ts`**: localStorage в try/catch + версионированный ключ `ndt-ninja:hi-score:v1`. Рекорд входит в MVP. | Полный цикл: Menu → Game → (потеря жизней / труба) → GameOver → Restart. HUD показывает жизни и счёт в реальном времени. Рекорд сохраняется между сессиями (проверка: 2 запуска вкладки). После перезагрузки вкладки приватного режима (localStorage запрещён) — игра не падает. |
| **5** | **[пост-MVP] SwordSystem + 4 меча + slowmo** | 4 меча: кованый / сварка / плазма / радиация. Активный меч задаёт свойство разреза и визуальный стиль (через `SliceEvent.swordType`). **Радиация = slowmo**: при активации `scene.time.timeScale = 0.5` (или эквивалент Matter) на 2–3 сек + green-glow оверлей. Переключение мечей (пауза/кнопки в HUD). | Геймплей-свойство каждого меча **измеримо** (см. ниже — тест-сцены). Slowmo: при активации радиации падение осколков замедляется в 2 раза на 2–3 сек (проверка таймером и визуально). |
| **6** | **[пост-MVP] Прогрессия волн + комбо-множитель** | SpawnDirector эскалирует волны. Параметры волн как метрики (см. ниже). Комбо-множитель за серию разрезов в окне времени (напр. 800 мс). | Параметры волн измеримы (см. ниже). Комбо ×2/×3/×4 — счёт растёт нелинейно, множитель обнуляется по таймауту. |
| **7** | **[пост-MVP] Полировка + перф** | Object pooling осколков/частиц; texture atlas (все NDT-объекты в одном атласе); аудит draw calls (`<50` mobile / `<200` desktop); haptics (`navigator.vibrate`) на мобайл; тюн Physical Resolution и субшагов. | Целевые устройства: **p95 frame time ≤ 16.67 мс** за 60-сек сессию; draw calls `<50` mobile. Haptics работает на Android (на iOS — в Safari поддерживается частично). |

---

## Граф зависимостей

```
0 (скаффолд + изолированный бенчмарк)
 └─ 1 (ввод + audio unlock)
     └─ 2 (физика/спавн)
         └─ 3 (слайсинг + SliceEvent + min-juice + повторный бенчмарк)  ← FAIL-FAST GATE
             └─ 4 [MVP] (контент + бомбы + жизни + UI-сцены + рекорд)
                 ├─ 5 [пост-MVP] (4 меча + slowmo)
                 │   └─ 6 [пост-MVP] (волны + комбо)
                 │       └─ 7 [пост-MVP] (полировка + перф)
                 └─ 7 [пост-MVP] (часть перф-задач можно вести параллельно с 5/6)
```

Фазы 4 — обязательный gate для пост-MVP. Внутри MVP фазы строго последовательны.

---

## Контракт SliceEvent (фиксируется в фазе 3)

Файл `src/events/SliceEvent.ts`:

```typescript
import Phaser from 'phaser';
import { NDTObjectKind, SwordType } from './types';

/** Событие разреза NDT-объекта. Эмитится SliceSystem, консамится другими системами. */
export interface SliceEvent {
  /** Уникальный id события (uuid). */
  readonly id: string;
  /** performance.now() на момент разреза. */
  readonly timestamp: number;
  /** id Matter-тела исходного объекта. */
  readonly bodyId: number;
  /** Тип объекта. */
  readonly kind: NDTObjectKind;
  /** true только для 'pipe'. */
  readonly isBomb: boolean;
  /** Геометрия реза. */
  readonly slice: {
    readonly from: Phaser.Math.Vector2;
    readonly to: Phaser.Math.Vector2;
    readonly angle: number; // радианы
  };
  /** Активный меч. null в MVP (до фазы 5). */
  readonly swordType: SwordType | null;
  /** Фрагменты, созданные BodySplitter. */
  readonly fragments: ReadonlyArray<{
    readonly vertices: ReadonlyArray<Phaser.Math.Vector2>;
    readonly velocity: Phaser.Math.Vector2;
  }>;
}
```

**Event-flow:**

```
InputSystem ──► SliceSystem (детект segment ∩ body)
                    │
                    ├─► BodySplitter (PolyK + poly-decomp → фрагменты)
                    │
                    └─► EventBus.emit('slice', SliceEvent)
                              │
                              ├─► BombSystem:    if (event.isBomb) → game over + взрыв
                              ├─► ScoreSystem:   += очки (× комбо в фазе 6)
                              ├─► FXSystem:      звук + частицы + screen-shake
                              └─► SwordSystem:   (пост-MVP) применение эффекта меча
```

В фазе 3 BombSystem и ScoreSystem создаются как stubs (только `console.log` или счётчик),
чтобы проверить, что SliceEvent проходит по всем потребителям. В фазе 4 stubs заменяются
реальной логикой без изменения контракта.

> **Фрагменты создаются всегда** — в том числе для `isBomb`-объектов (труба тоже визуально
> рвётся + поверх идёт взрыв). BombSystem не имеет вето на создание фрагментов.

---

## Контракт MissEvent (фиксируется в фазе 2/4)

Упущенный объект (вышел за нижний край экрана) эмитит `MissEvent` — консамит `LifeSystem` (фаза 4).
Аналог SliceEvent: контракт фиксируется до реализации потребителя.

```typescript
/** Событие упущенного объекта. Эмитит SpawnDirector/деспавнер, консамит LifeSystem. */
export interface MissEvent {
  readonly bodyId: number;
  readonly kind: NDTObjectKind;
  readonly isBomb: boolean; // true для 'pipe' — но труба штрафа не несёт (мина, не цель)
}
```

**Event-flow:**

```
SpawnDirector (деспавн за нижним краем)
        │
        └─► EventBus.emit('miss', MissEvent)
                  │
                  └─► LifeSystem: if (!event.isBomb) → lives -= 1; при 0 → game over
                                  (труба-бомба упущена → штрафа нет)
```

---

## Дизайн failstate (зафиксировано решением 2)

**Состояние игры** (в GameScene, передаётся в HUDScene через EventBus):

```typescript
interface GameState {
  lives: number;       // начать с 3
  score: number;
  hiScore: number;     // из Storage
  isGameOver: boolean;
}
```

**Правила:**

| Событие | Следствие |
|---|---|
| Режимый объект (`bolt/nut/ruler/standard`) упущен (ушёл за нижний край) | `lives -= 1`. При `lives === 0` → `isGameOver = true`. |
| Труба-бомба разрезана | `isGameOver = true` (мгновенно, независимо от lives) + взрыв + screen-shake. |
| Труба упущена (не разрезана) | Штрафа нет (труба — мина, не цель). |
| `isGameOver === true` | `scene.pause('Game')`, `scene.launch('GameOver')`. GameOverScene показывает финальный счёт, обновляет hi-score через Storage, кнопка Restart перезапускает GameScene. |

Жизни отображаются в HUDScene (3 иконки-болта, потерянная — серая/прозрачная).

**GameOverFlow (кто эмитит / кто консамит).** И BombSystem, и LifeSystem могут перевести
игру в game over — оба эмитят `EventBus.emit('game-over', { reason: 'bomb' | 'no-lives' })`.
**Единственный консамер — GameScene**: выполняет `scene.pause('Game') + scene.launch('GameOver')`,
обработчик **идемпотентен** (флаг `isGameOver` защищает от двойного эмитта в одном кадре двумя системами).

---

## Бенчмарк и fail-fast критерии Matter.js

**Двухступенчатая защита** (решает замечания 1 и 2):

### Ступень A — фаза 0: изолированный бенчмарк

`src/benchmark/physics-bench.ts` — отдельная сцена/режим, доступная из Menu-stub по
отладочной кнопке. N Matter-тел в прямоугольной коробке с гравитацией, без слайсинга.
Замер: fps, frame time, physics step — на iPhone SE 2020 и Galaxy A52.

**Критерий ступени A:** при N = 50 тел средний fps ≥ 55 за 30 сек на обоих целевых устройствах.
Провал → сразу поднимаем вопрос о Rapier+PixiJS, не дожидаясь слайсинга.

### Ступень B — фаза 3: реальный ворклоуд со слайсингом

После реализации SliceSystem/BodySplitter. Нагрузочный тест — **обязательно автоскрипт**
(детерминированный синтетический спавн по расписанию + синтетические свайпы): ~30
одновременно живущих осколков, часть из них режутся → ещё больше фрагментов. Ручной замер
не допускается — на этом gate принимается решение о миграции на Rapier (дорогостоящее),
замер обязан быть воспроизводимым.

**Количественные fail-fast пороги (все должны выполняться):**

| Метрика | Порог | Как измерить |
|---|---|---|
| Средний fps | ≥ 55 | Phaser registry/stats, 30 сек сессии |
| p95 frame time | ≤ 18 мс (запас для 16.67) | `performance.now()` в `update()` |
| p95 physics step | ≤ 6 мс | Замер вокруг `matter.world.step()` |
| Частота туннелирования | < 1% на скоростях ≥ 25 px/frame | Тест: спавним осколок сквозь ряд тел, считаем пропущенные коллизии |
| Задержка разреза (input → slice event) | ≤ 1 кадр | `timestamp` в SliceEvent vs pointerdown |

**Эскалация при провале** (по порядку):

1. Увеличить субшаги физики: `matter.runner.isFixed = true`, увеличить `delta` / substeps.
2. Raycast-ворота на линии реза (дополнительный детектор между `pointermove`-сэмплами).
3. Ограничить максимальную скорость осколков (cap velocity).
4. Если ничего не помогло → **переход на Rapier + PixiJS** (см. архитектуру, альтернативный стек).
   Внимание: переписывать физику дорого — этот gate именно для того, чтобы выявить нужду до фаз 4–6.

**Решение о переходе принимает архитектор** по результатам замеров; при переходе фазы 4+
начинаются только после миграции физического слоя.

---

## Измеримые checkpoints для размытых фаз

### Фаза 5 — геймплей-свойства каждого меча (тест-сцены)

| Меч | Свойство | Тест-сцена | Критерий |
|---|---|---|---|
| Кованый (forged) | Базовый ровный разрез | 1 болт, 1 свайп | Ровно 2 осколка, 1 разрез. |
| Сварка (welding) | Поджигает край среза (визуально) | 1 болт, 1 свайп | На срезе горит анимация ≥ 500 мс. |
| Плазма (plasma) | Режет до 3 объектов за свайп | 3 болта в линию, 1 горизонтальный свайп | 3 разреза зарегистрированы, 6 осколков. |
| Радиация (radiation) | Slowmo 2–3 сек | Активация меча в полёте осколков | `scene.time.timeScale` становится 0.5 на 2–3 сек; осколки визуально замедляются; green-glow оверлей включается. |

### Фаза 6 — параметры волн (метрики)

```typescript
interface WaveConfig {
  spawnRate: number;      // объектов/сек
  bombPercent: number;    // % труб в волне [0..1]
  baseSpeed: number;      // px/сек стартовой скорости
  waveDuration: number;   // сек до перехода на следующую
}
```

Измеримо: каждая волна — конкретные числа. Пример первой и третьей волны:
W1: `{ spawnRate: 0.8, bombPercent: 0.1, baseSpeed: 600, waveDuration: 30 }`.
W3: `{ spawnRate: 1.4, bombPercent: 0.18, baseSpeed: 800, waveDuration: 30 }`.

### Фаза 7 — целевые устройства + метрика fps

- **Целевые устройства:** iPhone SE 2020 (A13, iOS Safari), Samsung Galaxy A52 (Snapdragon 720G, Chrome Android).
- **Метрика:** p95 frame time ≤ 16.67 мс за 60-сек игровую сессию. Замер через самописный
  профайлер, пишущий в массив; отчёт выводится по кнопке в Menu-stub.
- **Draw calls:** `<50` mobile, `<200` desktop — через WebGL inspector или `renderer.renderCount`.

---

## Риски и открытые вопросы

> Технические обоснования — в [`ndt-ninja-architecture.md`](./ndt-ninja-architecture.md).
> Часть рисков закрыта fail-fast gate в фазах 0/3 — они не доживают до продакшена.

1. **Туннелирование осколков в Matter.js (нет CCD).** Закрыто fail-fast gate (фаза 3):
   субшаги физики → raycast-ворота → cap velocity → при провале Rapier+PixiJS.
   _Статус: снят количественно в фазе 3._
2. **Сравнительная производительность физдвижков.** Закрыта двухступенчатым бенчмарком
   (фаза 0 — изолированный, фаза 3 — реальный ворклоуд) **до** старта фаз 4–6.
   _Статус: снят ранним бенчмарком._
3. **Themed-эффекты мечей** (шейдеры glow для плазмы, частицы сварки, green-glow для радиации).
   Прототипирование в фазе 5. Запасти время на эксперименты с Phaser-частицами и WebGL-фильтрами.
   _Статус: открыт, фаза 5._
4. **Дизайн NDT-геймплея** — failstate зафиксирован (3 жизни + труба = мгновенный game over),
   slowmo зафиксирован (решение 3). Кривая сложности волн (W1, W2, W3…) — пост-MVP, фаза 6,
   потребует игротестов. _Статус: частично закрыт; кривая волн — открыт, фаза 6._
5. **Вогнутые фрагменты при слайсинге.** Закрыт включением **`poly-decomp` как прямой
   зависимости** в фазе 3 (не «если столкнёмся», а сразу). Тестируется на реальной геометрии
   (болт, гайка, линейка) в фазе 3. _Статус: закрыт прямой зависимостью._
6. **AudioContext на iOS.** Закрыто задачей `this.sound.unlock()` на первом `pointerdown` в фазе 1.
   _Статус: закрыт._
7. **`getCoalescedEvents()` на Safari iOS < 14.5.** Закрыт fallback на обычный `pointermove`
   в фазе 1. _Статус: закрыт._
8. **localStorage в приватном режиме / quota exceeded.** Закрыт `try/catch` и версионированным
   ключом `ndt-ninja:hi-score:v1` в `persistence/Storage.ts` (фаза 4). _Статус: закрыт._
9. **Slowmo и Matter.js time-scale.** Нужно проверить, корректно ли `scene.time.timeScale`
   замедляет matter runner (или нужен отдельный масштаб для `matter.world`). Снимается
   экспериментом в начале фазы 5. _Статус: открыт, начало фазы 5._
10. **Разрешение канваса на retina (iPhone SE).** FIT-scale + высокое DPR может перегрузить
    fill-rate. Опция: ограничить `resolution` канваса ≤ 2. Проверить в фазе 0 на реальном устройстве.
    _Статус: открыт, фаза 0._

---

## Что изменилось по сравнению с рев. 1 (для plan-reviewer)

- Бенчмарк физдвижка перенесён с фазы 7 → фазы 0 + 3 (замечание 1).
- Добавлены количественные fail-fast критерии Matter.js (замечание 2).
- MVP-граница описана явно (замечание 3).
- Радиация = slowmo вошёл в SwordSystem (замечание 4, решение 3).
- Добавлены MenuScene/GameOverScene/HUD и дизайн failstate (замечание 5).
- Минимальный juice перенесён в фазу 3 (замечание 6).
- AudioContext unlock в фазе 1 (замечание 7).
- SliceEvent-контракт зафиксирован в фазе 3 с явным event-flow (замечание 8).
- LifeSystem — часть фазы 4/MVP (замечание 9).
- `poly-decomp` — прямая зависимость фазы 3 (замечание 10).
- `getCoalescedEvents()` fallback для Safari iOS < 14.5 в фазе 1 (замечание 11).
- localStorage в `try/catch` + версионирование `ndt-ninja:hi-score:v1` (замечание 12).
- Геймплей-свойства мечей → измеримые тест-сцены (замечание 13).
- Параметры волн → метрики `WaveConfig` (замечание 14).
- Фаза 7 → целевые устройства + p95 frame time (замечание 15).
- Добавлена структура проекта `src/{scenes,systems,events,config,objects,persistence,benchmark}`.
