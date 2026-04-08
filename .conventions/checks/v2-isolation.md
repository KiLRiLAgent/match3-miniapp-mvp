# Convention: v2 Isolation Rules

Правила изоляции между v1 (классический match-3 boss fight) и v2
(«Университет Падших» — dating sim с цепями). Обе версии живут в одном
репозитории, одном bundle, одном боте — но должны быть **чётко разделены**,
чтобы геймдизайнер v1 не ломал v2, а разработчик v2 не задевал v1.

## Routing

- **`src/game/version.ts`** — **единственный** источник истины для
  текущего режима. Используй `getActiveMode()` / `setActiveMode(mode)`.
- **`BootScene.routeToActiveMode()`** — единственная точка принятия
  решения о том, в какую ветку сцен направлять игрока после preload.
- Переключение режима всегда требует `window.location.reload()` — никаких
  горячих переключений. BootScene должен отрабатывать с чистого листа.

## Import boundaries

### Запрещено

- **`src/scenes/*` НЕ импортирует `src/v2/*`.**
  Существующие v1-сцены (`BootScene`, `IntroScene`, `GameScene`) не знают
  о существовании v2. Единственное исключение — `BootScene` делает
  `await import("../v2")` как динамический импорт, а не статический.

- **Никаких `import "../v2/..."` в v1-коде.** Если v1 сцене нужно что-то
  из v2, значит это должно быть переиспользуемо и вынесено в общий
  модуль (`src/ui/`, `src/game/`, `src/utils/`, `src/match3/`).

### Разрешено

- **v2 импортирует v1 как библиотеку.** `src/v2/*` может импортировать:
  - `src/match3/*` — Board, types
  - `src/ui/*` — SpeechBubble, PerkCard, Meter, LayeredMeter, DamageNumber, FlyingTile
  - `src/game/*` — config, animations, assets, PerkManager, BossAbility, version
  - `src/utils/*` — helpers, audioSettings, haptics
  - `src/telegram/*` — Telegram WebApp wrapper
  - `src/scenes/GameScene.ts` — **только** через `scene.start("GameScene", { encounterContext })` с feature-gated патчем (см. ниже).

## GameScene extension rules

v2 использует `GameScene` как "боевой движок" внутри новой истории. При
этом любые правки `GameScene.ts` ради v2 должны быть **feature-gated** —
без `data.encounterContext` поведение должно быть идентично v1.

```ts
// ДОПУСТИМО — ветка активируется только для v2
if (this.encounterContext) {
  // v2-specific logic: chains, relationship-driven boss stats, onComplete emit
}

// ЗАПРЕЩЕНО — безусловное изменение v1-пути
this.bossHp = this.encounterContext?.bossOverride.hp ?? GAME_PARAMS.boss.hpMax;
//                                                      ^^^^^^^^^^^^^^^^^^^^^
// Если v1 пользователь сейчас в бою с ломающим изменением boss HP, это
// поломает его состояние. Лучше — локальный getter:

private effectiveBossHpMax(): number {
  return this.encounterContext?.bossOverride?.hp ?? GAME_PARAMS.boss.hpMax;
}
```

Правило: **любое ветвление ради v2 помечается комментарием `// v2:`**,
чтобы при git diff сразу было видно, что это v2-хук, а не обычная правка
v1 механики.

## Persistence

- **`src/v2/core/SaveManager.ts`** — **единственная** точка чтения/записи
  v2 state. Сцены и системы v2 используют `gameState.get()` / `gameState.patch()`.

- Не читать `localStorage` напрямую из v2-кода (кроме SaveManager и
  legacy migration внутри него).

- v2 **не трогает** v1 localStorage ключи: `match3_params`, `match3_audio`,
  `match3_haptic`. Эти ключи — собственность v1. SaveManager на первом
  запуске v2 зеркалит `match3_audio` / `match3_haptic` в `SaveData.settings`,
  но никогда не удаляет и не переписывает legacy ключи.

## SaveData versioning

- `SaveData.version` всегда совпадает с `SAVE_VERSION` в `src/v2/core/types.ts`.
- При добавлении/удалении/переименовании полей в SaveData:
  1. Увеличить `SAVE_VERSION` на 1.
  2. Добавить запись в `MIGRATIONS` в `SaveManager.ts`: функция, которая
     трансформирует save старой версии в новую.
  3. Никогда не ломать совместимость молча — игроки с существующими
     save-ами должны мигрировать.

## File locations

- **`src/v2/core/`** — инфраструктура (SaveManager, SceneRouter, EventBus,
  GameState, types). Без UI-зависимостей от Phaser в большинстве файлов.
- **`src/v2/scenes/`** — Phaser сцены v2 (HubScene, StoryMapScene,
  DialogueScene, CombatBridgeScene, PostCombatScene, InventoryScene...).
- **`src/v2/content/`** — данные (CharacterDef, DialogueGraph, EncounterDef,
  ItemDef, LocationDef). TS-объекты на Phase 1, возможна миграция на
  `public/v2/content/` JSON на Phase 2+ если контента станет много.
- **`src/v2/systems/`** — игровые системы (DialogueRunner, RelationshipSystem,
  StoryFlags, EncounterBuilder, ProgressionSystem, InventorySystem).
- **`src/v2/ui/`** — v2-специфичные UI компоненты (ChainOverlay,
  DialogueChoiceButton, CharacterPortrait, RelationshipMeter).
- **`src/v2/ai/`** — Phase 3 ИИ-интеграция (AIClient, PromptBuilder).
- **`src/v2/config/`** — константы v2 (v2Config, lore).

## Zero-disruption rule (критично)

**С чистым `localStorage` (без `match3_active_mode`) игра должна запускаться
идентично тому, что было до внедрения v2.** После preload сразу
`IntroScene → GameScene`. Никакого меню, никаких заглушек, никаких
"бета-кнопок" на старте. v2 — opt-in.

Это главное правило. Если хоть какой-то v1-смоук-тест показывает визуальные
или поведенческие отличия vs коммит до v2 — значит изоляция нарушена.

## Smoke test checklist (после каждого v2-коммита)

1. Открой DevTools, очисти localStorage.
2. Hard reload (Ctrl+Shift+R).
3. Игра должна стартовать в точности как v1 до внедрения v2:
   BootScene → IntroScene → GameScene.
4. Пройти 2-3 хода, открыть шестерёнку — SettingsPanel работает, видна
   новая секция "🔮 Режим игры" сверху, остальные параметры работают.
5. В DevTools Network tab: должен быть загружен `phaser-*.js` +
   `index-*.js`, но **не** v2 chunk (пока переключение не сделано).
6. Если любой из этих пунктов нарушен — v2 ломает v1, немедленный revert.

## EventBus shared event types (Phase 1C)

`src/v2/core/EventBus.ts` declares a single `V2Events` interface that is the
**shared contract** between SaveManager, DialogueRunner, scenes, and the Toast
wiring. When adding a new event type:

1. Add the entry to `V2Events` in `EventBus.ts` first. Emitters and
   subscribers across `src/v2/systems/`, `src/v2/scenes/`, and
   `src/v2/index.ts` rely on the typed keys — if two coders extend the
   interface in parallel, they MUST serialize through one commit that locks
   the final shape (DECISIONS §2 — first-claimer rule).
2. Use kebab-case `source` discriminators inside payloads
   (`"dialogue-effect"`, `"missing-encounter"`) so the Toast wiring can switch
   on a stable string set without touching the event name itself.
3. Never introduce a second event bus. The single singleton is wired once at
   boot via `wireToastSubscriptions(game)` in `src/v2/index.ts` — per-scene
   subscriptions duplicate on Vite HMR.

Current Phase 1C events (see `EventBus.ts` for the exact shape):

| Event         | Emitter                                       | Consumer                 |
|---------------|-----------------------------------------------|--------------------------|
| `saveError`   | SaveManager.save catch block                  | Toast wiring → red toast |
| `contentError`| DialogueRunner.applyEffects, CombatBridgeScene| Toast wiring → amber toast|
| `assetError`  | LocationScene texture load failure            | Console only (LocationScene shows its own toast in-place)|

Adding an event without adding a corresponding `wireToastSubscriptions`
handler is a valid choice — for telemetry-only signals, `console.warn` is
enough. Don't toast everything.

## Review protocol (Phase 1C governance lessons)

Three governance gaps surfaced during Phase 1C. These are not architecture
rules — they are coordination rules that every future multi-coder feature
team MUST follow.

### 1. Bundle budget bumps broadcast to ALL architects

When tech-lead raises a chunk budget mid-phase (e.g. Phase 1C 80 → 85 → 90
KB), the change MUST be broadcast to ALL architects via team-lead in the
team channel. It is NOT OK for tech-lead to directly tell a single coder
"it's fine, commit it" — the systems architect (who owns the budget metric)
needs to record the change, the frontend architect needs to evaluate whether
a UI task should use the headroom, and the backend architect needs to assess
whether Phase 2 can realistically return to the old budget.

**Enforcement**: every budget bump must be accompanied by a DECISIONS.md §1
amendment committed BEFORE the coder's merge.

### 2. Joint frontend + backend tasks require both architect approvals

Some tasks cross the UI/data boundary — HubScene XP bar (#10) reads
`progressionSystem.getLevelEntryXp()`; PlayerStatsScene pagination (#11)
reads `inventorySystem.getBackpackItems()`. These joint tasks MUST collect
approvals from BOTH architect-frontend AND architect-backend before merge,
not "whichever architect answers first".

**Enforcement**: the REVIEW request message must explicitly address both
architects by name, and the coder must wait for two `APPROVED` replies
before committing. The third architect (systems) checks cross-cutting
concerns (build, isolation, naming) and can approve independently.

### 3. Approval is signalled by an explicit `APPROVED` string

Coders MUST wait for an explicit `APPROVED` verdict in an architect's reply
message — NOT a task list status change, NOT a thumbs-up emoji, NOT an
implicit "sounds good". The approval string is searchable in the team
channel history and makes the review record auditable.

Inversely, a `NEEDS FIX` verdict MUST name the specific changes required;
drive-by nits without an explicit verdict are treated as informational only.

**Enforcement**: if a coder commits without two explicit APPROVALs (for
joint tasks) or three explicit APPROVALs (for systems tasks that touch
cross-cutting concerns like EventBus or save schema), the commit is eligible
for revert by any reviewer.

These three rules cost ~30 seconds per task to follow and save hours of
disentangling when a multi-week phase ships.
