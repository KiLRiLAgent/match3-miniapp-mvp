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
