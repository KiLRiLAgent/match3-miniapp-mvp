# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
npm run dev      # Start Vite dev server with HMR
npm run build    # TypeScript check + Vite production build
npm run preview  # Preview production build locally
```

## Project Overview

This is a Match-3 boss fight game built as a Telegram Mini App using Phaser 3 and TypeScript. The game features turn-based combat where players match tiles to deal damage, heal, and charge skills against an AI boss with multiple abilities.

---

## v2 Architecture

Параллельно с v1 (arena boss fight) разрабатывается **v2 — «Университет Падших»**: story-driven dating sim с механикой цепей в матч-3 боях, прогрессией в стиле Archero и будущей ИИ-интеграцией. v2 живёт в изолированной папке `src/v2/` и активируется **opt-in** через флаг в настройках. **Phase 1A (Lilana vertical slice) завершена** — полный story-loop от Hub до боя с цепями и обратно работает end-to-end.

### Переключение между версиями

- **Default поведение** (чистый `localStorage`) — как было: `BootScene → IntroScene → GameScene`. Никакого меню, никакого визуального изменения. v2 полностью невидим.
- **Переключение на v2** — через существующий `SettingsPanel` (шестерёнка в GameScene). В самом верху панели блок «🔮 Режим игры» с кнопкой `⟳ Переключить на v2 Университет (β)`. Кнопка пишет флаг в `localStorage["match3_active_mode"]` и делает `window.location.reload()`.
- **Обратный путь** — из любого v2 экрана кнопка «← Вернуться в v1» → тот же `setActiveMode("v1") + reload`.
- **Dev-shortcut** — `?mode=v2` или `?mode=v1` в URL **временно** переопределяет флаг на одну сессию, без записи в localStorage.

### Routing

- `src/game/version.ts` — единственный источник истины для текущего режима (`getActiveMode()` / `setActiveMode()`).
- `BootScene.routeToActiveMode()` — единственная точка принятия решения о направлении игрока. v1 → `scene.start("IntroScene")`. v2 → `await import("../v2") → registerV2Scenes(game) → scene.start("HubScene")`.

### Bundle strategy

- `vite.config.ts` использует `manualChunks: { phaser: ["phaser"] }` — Phaser вынесен в отдельный vendor chunk.
- `src/v2/*` грузится через **dynamic import** из BootScene только при активном v2 режиме. v1-игроки не качают v2 chunk.
- Актуальные размеры (после Phase 1A): `phaser-*.js` ~1.2 MB, v1 main `index-*.js` ~132 kB (≤135 kB budget per REFINEMENT 9), v2 chunk ~53 kB (содержит 6 сцен, DialogueRunner, EncounterBuilder, RelationshipSystem, content registry, 3 v2/ui компонента).

### v2 directory layout

```
src/v2/
├── index.ts              # lazy entry point — registerV2Scenes(game)
├── core/                 # инфраструктура
│   ├── SaveManager.ts    # единственная точка чтения/записи v2 state
│   ├── SceneRouter.ts    # push/pop/replace стек над scene.start
│   ├── EventBus.ts       # typed pub/sub для cross-scene событий
│   ├── GameState.ts      # фасад над SaveManager + EventBus
│   └── types.ts          # SaveData interface + вложенные типы
├── scenes/               # Phaser сцены v2 (Phase 1A: 6 сцен)
│   ├── HubScene.ts       # greeting + кнопка к карте кампуса
│   ├── StoryMapScene.ts  # одна локация (Atrium) на Phase 1A
│   ├── LocationScene.ts  # NPC hotspots + dialogue resolver
│   ├── DialogueScene.ts  # рендер DialogueRunner + tap-to-advance
│   ├── CombatBridgeScene.ts  # сборка CombatContext + scene.launch GameScene
│   └── PostCombatScene.ts    # display result + RelationshipMeter before/after
├── content/              # данные на TS (Phase 1A: Лилана)
│   ├── types.ts          # CharacterDef, DialogueGraph, EncounterDef, CombatContext, ...
│   ├── characters/       # lilana.ts + index.ts (CHARACTERS registry)
│   ├── dialogues/        # lilana-act1/2/4.ts + index.ts (DIALOGUES registry)
│   ├── encounters/       # lilana-act4.ts + index.ts (ENCOUNTERS registry)
│   └── locations/        # atrium.ts + index.ts (LOCATIONS registry)
├── systems/              # игровые системы
│   ├── DialogueRunner.ts # pure-logic интерпретатор (zero Phaser deps)
│   ├── RelationshipSystem.ts  # applyDelta/getState/logDecision на gameState.patch
│   ├── StoryFlags.ts     # set/get/has/inc флаги в SaveData.story.flags
│   ├── EncounterBuilder.ts    # build CombatContext + applyResult (SOLE mutation point)
│   └── conditionEval.ts  # ConditionExpr evaluator (shared by Runner + LocationScene)
├── ui/                   # v2-специфичные Container компоненты
│   ├── DialogueChoiceButton.ts  # interactive Container с hitArea
│   ├── CharacterPortrait.ts     # placeholder circle с initial
│   └── RelationshipMeter.ts     # 3 axis bars с three-case fillRadius
├── ai/                   # Phase 3 ИИ-интеграция (не реализовано)
└── config/               # константы v2 (не реализовано)
```

Дополнительно `src/ui/ChainOverlay.ts` (нейтральная локация per REFINEMENT 3) — manager class для рендера chain state поверх Match3 board, инстанцируется напрямую из GameScene при наличии encounterContext.chains.

### Изоляция и правила

Правила описаны в **`.conventions/checks/v2-isolation.md`**. Кратко:

1. `src/scenes/*` **НЕ импортирует** `src/v2/*` runtime-методами. Единственные исключения: динамический `await import("../v2")` в `BootScene` и `import type { CombatContext, GameSceneInitData, RawCombatResult } from "../v2/content/types"` в `GameScene` (type-only, стирается при компиляции).
2. `src/v2/*` импортирует `src/match3/*`, `src/ui/*`, `src/game/*`, `src/utils/*`, `src/telegram/*`, `src/scenes/GameScene.ts` как библиотеку.
3. Правки `GameScene.ts` ради v2 — **только** через `if (this.encounterContext) { ... }` feature-gated ветки с комментарием `// v2:`. См. `.conventions/gold-standards/feature-gated-patches.ts`.
4. **Zero-disruption v1**: с чистым localStorage игра должна запускаться идентично тому, что было до внедрения v2. Любой smoke test v1 обязателен после v2-коммита.
5. SaveData версионируется через `SAVE_VERSION` — при изменении схемы обязательна migration функция в `SaveManager.MIGRATIONS`.
6. v2 не трогает legacy v1 localStorage ключи (`match3_params`, `match3_audio`, `match3_haptic`). SaveManager **зеркалит** аудио/haptic в `SaveData.settings` на первом запуске, не удаляя оригиналы.
7. `ChainVariant` определён в `src/match3/types.ts` (REFINEMENT 7), а не в `src/v2/content/types.ts` — содержит `Chain` концепт Match3Board, не v2-специфичную метадату. v2 content импортирует тип type-only из match3.

### Текущий статус

- **Phase 0 (Foundation)** ✅ completed — инфраструктура: bundle splitting, version flag, SaveManager skeleton, lazy v2 entry, HubScene stub, SettingsPanel toggle, conventions.
- **Phase 1A (Lilana vertical slice)** ✅ completed (apr 2026) — Лилана с тремя актами диалогов, бой с 8 железными цепями, RelationshipSystem с тремя осями, EncounterBuilder, ChainOverlay, full end-to-end loop через все 6 сцен. Все 13 задач завершены, все code reviews approved. v1 chunk 132.30 kB (≤135 kB budget), v2 chunk 52.98 kB.
- **Phase 1B (Progression, Gallery, Bug Fixes)** ✅ completed (apr 2026) — ProgressionSystem с XP-таблицей на 11 уровней и автоматическим level-up stat growth (+20 hp / +10 mp / +1 phys / +1 mag), InventorySystem + ItemDatabase из 6 предметов в 3 слотах, PlayerStatsScene с XP-баром и менеджментом снаряжения, CharacterGalleryScene с модальным окном персонажа, реорганизованный HubScene с 4 кнопками, post-arc gate в DialogueRunner, fix для hammer turn (v1 bug). Все 10 задач завершены, все code reviews approved. v1 chunk 132.77 kB (≤135 kB budget), v2 chunk 73.74 kB (≤80 kB budget).
- **Phase 2+** — не начаты. См. план `~/.claude/plans/iridescent-riding-pudding.md`.

---

## Project Structure

```
src/
├── main.ts                    # Entry point - Phaser game config
├── style.css                  # Global styles
├── scenes/
│   ├── BootScene.ts           # Asset loading & texture generation
│   └── GameScene.ts           # Main gameplay controller (~1100 lines)
├── match3/
│   ├── types.ts               # TileKind enum, Tile, Match, Position types
│   └── Board.ts               # Match3Board class - core game logic (~560 lines)
├── game/
│   ├── config.ts              # Game constants & dynamic UI layout
│   ├── animations.ts          # Animation durations, easing, visual effects
│   ├── assets.ts              # Asset key registry
│   └── BossAbility.ts         # BossAbilityManager class
├── ui/
│   ├── Meter.ts               # HP/MP bar component
│   ├── SkillButton.ts         # Skill button UI component
│   ├── CooldownIcon.ts        # Boss ability cooldown indicator with icons
│   ├── DamageNumber.ts        # Floating combat text
│   └── FlyingTile.ts          # Animated tile trajectory effects
├── utils/
│   └── helpers.ts             # Utility functions (clamp, wait, pulse, pulseController)
└── telegram/
    └── telegram.ts            # Telegram WebApp integration
```

---

## Detailed Architecture

### Entry Point (`src/main.ts`)

Creates Phaser game instance with configuration:
- Resolution: Dynamic (adapts to screen size via Telegram safe areas)
- Scaling: `Phaser.Scale.FIT` with `CENTER_BOTH` for responsive display
- Physics: Arcade (enabled but minimally used)
- Scenes: `[BootScene, GameScene]` loaded sequentially
- Background: Dark theme `#0d0f1a`

---

## Scene System

### BootScene (`src/scenes/BootScene.ts`)

**Purpose**: Asset preloading and texture generation

**Lifecycle**:
1. `preload()` - Loads external assets:
   - Boss sprites: `kristi_1.png` (normal), `kristi_2.png` (damaged), `kristi_ulta.png` (ability cutscene)
   - Tile sprites: `tile_sword.png`, `tile_star.png`, `tile_mana.png`, `tile_heal.jpg`

2. `create()` - Generates special tile textures programmatically:
   - `Bomb` - Black circle with red border, orange fuse, yellow spark
   - Generated at `CELL_SIZE` (46px)

3. `routeToActiveMode()` - Reads `getActiveMode()` and routes to v1 (`IntroScene`) or v2 (lazy `await import("../v2") → registerV2Scenes(game) → HubScene`).

**Note**: special tiles BoosterRow / BoosterCol / Ultimate were removed during the CRIT-multiplier refactor — current Match-3 uses tile multipliers for 4+ matches instead of separate special tile types. See "Match-3 Logic" section below for the current behavior.

---

### GameScene (`src/scenes/GameScene.ts`)

**Purpose**: Main gameplay controller (~1100 lines)

#### State Variables

```typescript
// Game state
private board: Match3Board;              // Logical board
private tileSprites: Map<number, Image>; // Tile ID -> Phaser sprite
private tilePositions: Map<number, Position>; // Tile ID -> grid position
private dragStart: { pos, point } | null; // Drag tracking
private busy: boolean;                   // Animation lock
private currentTurn: "player" | "boss";
private gameOver: boolean;

// Combat stats
private bossHp: number;           // Max: 500
private playerHp: number;         // Max: 200
private mana: number;             // Max: 100
private bossShieldDuration: number; // Active shield turns

// Boss ability
private bossAbilityManager: BossAbilityManager; // Pattern-based ability cycling

// Bomb tracking
private bombCooldownTexts: Map<number, Text>; // Bomb tile ID -> countdown text

// Target position getters (centralized)
private get bossTarget(): FlyTarget;    // Boss center position
private get playerTarget(): FlyTarget;  // Player avatar position
```

#### Initialization Flow (`create()`)

1. `initTelegram()` - Initializes Telegram WebApp SDK
2. Calculate `boardOrigin` from dynamic `UI_LAYOUT`
3. `buildHud()` - Creates UI panels and meters
4. `resetState()` - Initializes game state and creates board
5. `buildBoard()` - Spawns tile sprites for initial grid
6. `buildSkills()` - Creates 4 skill buttons
7. `setupInputHandlers()` - Configures pointer events
8. `updateHud()` - Initial UI sync

#### HUD Layout (Dynamic)

Layout is computed dynamically based on screen size via `getUILayout()`:

```
+------------------------------------------+
|            [Boss Image - flexible]       |
|            [Boss Name]                   |
|            [Boss HP Bar]  [CD]           |
+------------------------------------------+
|                                          |
|           [8x7 Game Board]               |
|            (46px cells)                  |
|                                          |
+------------------------------------------+
| [Avatar] [HP Bar] [Mana Bar]             |
| [Skill1] [Skill2] [Skill3] [Skill4]      |
+------------------------------------------+
```

**UI Elements**:
- `[CD]` - CooldownIcon showing next boss ability with icon and countdown
- Boss image stretches to fill available space above board

#### Input System

**Pointer Events**:
- `pointerdown` on tile sprite: Stores `dragStart` with grid position and screen coordinates
- `pointerup` on scene: Calculates delta, determines tap vs swipe (threshold: 10px)

**Input Guard** (`canPlayerAct()`):
```typescript
return !busy && !gameOver && currentTurn === "player" && playerHp > 0;
```

**Tap Handling** (`handleTap`):
- Tap-only paths (special tile activation) were removed during the CRIT refactor — taps no longer trigger immediate clears. Player must swipe to swap.

**Swipe Handling** (`attemptSwap`):
- Calculates direction from drag delta (4-directional)
- Validates both positions are in bounds
- Performs swap, animates, checks for matches
- If no matches, reverses swap animation

#### Turn System

**Player Turn**:
1. Player can swap tiles or tap specials
2. After successful match: `resolveBoard()` processes cascades
3. Skills can be used anytime (don't end turn)
4. `finishPlayerTurn()` called after board settles:
   - Boss shield duration decrements
   - Bomb cooldowns tick (may explode)
   - Boss ability cooldown ticks
   - If boss ability ready -> execute boss turn

**Boss Turn** (via `executeBossAbility`):
```typescript
switch (bossAbilityManager.currentType) {
  case "attack":     await executeAttack();     break;
  case "bombs":      await executeBombs();      break;
  case "shield":     await executeShield();     break;
  case "powerStrike": await executePowerStrike(); break;
}
bossAbilityManager.advance(); // Move to next ability in pattern
```

#### Boss Ability Cutscene System

**Cutscene Flow** (`withCutscene`):
1. Create overlay (black, 0.85 alpha)
2. Display fullscreen boss image (`kristi_ulta.png`)
3. Show ability name text
4. Fade in (300ms)
5. Execute ability logic
6. Camera shake effect
7. Fade out (300ms)
8. Destroy cutscene elements

**Cutscene Methods**:
- `createAbilityCutscene(name)` - Creates overlay + boss image + text
- `showAbilityCutscene()` - Fade in animation
- `hideAbilityCutscene()` - Fade out and destroy

#### Board Resolution (`resolveBoard`)

**Cascade Loop**:
```typescript
while (matches.length || specials.length) {
  // 1. Calculate what to clear and transforms
  outcome = board.computeClearOutcome(matches, specials, swapTargets);

  // 2. Animate transforms (special tile creation pulse)
  await animateTransforms(outcome.transforms);

  // 3. Animate tiles flying to targets
  await animateClear(outcome, actor);

  // 4. Apply combat results (damage/heal/mana)
  applyMatchResults(outcome.counts, actor);
  if (gameOver) break;

  // 5. Defuse adjacent bombs
  adjacentBombs = board.getAdjacentBombs(clearedPositions);
  await defuseBombs(adjacentBombs);

  // 6. Apply grid changes and collapse
  collapse = board.applyClearOutcome(outcome);
  await animateCollapse(collapse);

  // 7. Check for chain reactions
  matches = board.findMatches();
  specials = [];
}

if (endTurnAfter) await finishPlayerTurn();
```

#### Damage Calculation (`applyMatchResults`)

**Player Attacking Boss** (actor = "player"):
```typescript
physDamage = swordCount * PLAYER_PHYS_ATTACK     // 10 per sword
magDamage  = starCount * PLAYER_MAG_ATTACK       // 10 per star
totalDamage = physDamage + floor(magDamage * 0.5) // Magic is 50% effective
manaGain = manaCount * MP_PER_TILE               // 10 per mana
healGain = healCount * HP_PER_TILE               // 10 per heal
```

**Boss Attacking Player** (actor = "boss"):
- Same tile counting, damage applied to player instead

**Shield Blocking**:
```typescript
if (bossShieldDuration > 0) {
  // Show "Shield" floating text, no damage applied
  return;
}
```

#### Bomb System

**Bomb Placement** (boss "Bombs" ability):
```typescript
const { placed, replaced } = board.placeBombs(5, 3); // 5 bombs, 3-turn cooldown
await animateBombsAppear(placed);
```

**Bomb Tick** (each turn):
```typescript
const { exploded, remaining } = board.tickBombs();
if (exploded.length > 0) {
  await animateBombsExplode(exploded);
  totalDamage = exploded.length * BOMB_DAMAGE; // 30 per bomb
  applyDamageToPlayer(totalDamage);
}
updateBombCooldownTexts(); // Update displayed countdowns
```

**Bomb Defusing**:
- When tiles adjacent to bombs are cleared, those bombs are defused
- Defused bombs flash green and are removed without exploding
- `defuseBombs(positions)` animates and removes them

#### Animation System

**Swap Animation** (`animateSwap`):
- Duration: 140ms
- Easing: `Quad.easeOut`
- Uses centralized `createTween()` helper

**Transform Animation** (`animateTransforms`):
- Special tiles pulse and scale 1.2x
- Easing: `Back.easeOut`

**Clear Animation** (`animateClear`):
- Tiles grouped by target using `bossTarget` and `playerTarget` getters:
  - Damage tiles (Sword/Star) -> opponent
  - Resource tiles (Mana/Heal) -> self
- Bezier curve trajectory with trail effect
- Duration: 350ms with 30ms stagger

**Collapse Animation** (`animateCollapse`):
- Existing tiles fall: 160ms
- New tiles spawn above board, fall: 200ms
- Easing: `Quad.easeIn`

**Bomb Animations**:
- `animateBombsAppear()` - Scale in with bounce
- `animateBombsExplode()` - Red flash + fade out
- `animateDefusedBombs()` - Green flash + fade out

#### Skill System

4 Skills with mana costs:
```typescript
skill1: { name: "Power", cost: 50,  damage: 100, heal: 0,   description: "Физ x10" }
skill2: { name: "Blast", cost: 100, damage: 100, heal: 0,   description: "100 урона" }
skill3: { name: "Heal",  cost: 30,  damage: 0,   heal: 50,  description: "+50 HP" }
skill4: { name: "Ult",   cost: 100, damage: 200, heal: 0,   description: "200 урона" }
```

Skills do NOT end turn - player can still make a match after using skill.

#### Game End States

**Victory** (`showVictory`):
- Triggers when `bossHp <= 0`
- Overlay with "Victory!" text
- Restart button

**Defeat** (`showDefeat`):
- Triggers when `playerHp <= 0`
- Overlay with "Defeat" text
- Retry button

---

## Match-3 Logic (`src/match3/`)

### Types (`types.ts`)

```typescript
enum TileKind {
  Sword = "sword",           // Physical damage
  Star = "star",             // Magic damage
  Mana = "mana",             // Resource
  Heal = "heal",             // Health restoration
  Bomb = "bomb",             // Explodes after cooldown
}

type BaseTileKind = Sword | Star | Mana | Heal;  // Only these spawn naturally

type Tile = {
  id: number;           // Unique identifier for sprite tracking
  kind: TileKind;       // Current visual/behavior type
  base: BaseTileKind;   // Original base type (preserved for bombs)
  cooldown?: number;    // For bombs: turns until explosion
  multiplier?: number;  // For CRIT 4+ matches: 2x or 3x damage multiplier
}

type Match = {
  positions: Position[];
  kind: BaseTileKind;
  direction: "row" | "col";
}

// v2 chain mechanics (Phase 1A — additive, no impact on v1)
export type ChainVariant = "iron" | "thorn" | "gold";
export interface Chain {
  pos: Position;
  hp: number;
  variant: ChainVariant;
}
```

### Board (`Board.ts`)

**Constructor**: Creates `width x height` grid, fills with random tiles avoiding initial matches.

**v2 chain methods** (Phase 1A additive patch — no `// v2:` tags, generic Board capability): `placeChains`, `isChained`, `getChainAt`, `getAllChains`, `getDamagedChains` (returns snapshots), `damageChains` (lookup-and-mutate), `hasActiveChains` getter, `clearChains`. Tiles UNDER chains match normally — chains are positional overlay state, not match-exclusion. See Task #2 spec for details.

#### Core Methods

**`fillInitial()`**
- Iterates through grid left-to-right, top-to-bottom
- For each cell, generates random tile
- Rerolls if placing would create immediate match (checks 2 tiles left and 2 tiles up)

**`findMatches(): Match[]`**
- Scans rows for horizontal runs of 3+
- Scans columns for vertical runs of 3+
- Detects 2x2 square matches (4 same tiles in square)
- **Bombs are excluded** - they don't start or participate in matches
- **Chains do NOT exclude tiles** — chained positions match normally so the chain break mechanic works
- Returns all matches found

**`computeClearOutcome(matches, swapTargets): ClearOutcome`**

Purpose: Determines what tiles to clear and what CRIT transforms to apply.

**CRIT Multiplier Rules** (replaced legacy BoosterRow/BoosterCol/Ultimate special tile creation during the CRIT refactor):
- **3-match** → normal clear, multiplier = 1
- **4-match** → CRIT, multiplier = 2 (damage tiles deal 2x damage)
- **5+ match (or L-shape)** → CRIT, multiplier = 3 (damage tiles deal 3x damage)
- The multiplier is stored on a transform anchor tile (the swapped position or the centre of the run) and applied during `buildClearOutcome` damage calculation. CRIT tiles are also cleared — no special tiles remain on the board after match resolution.

**`applyClearOutcome(outcome): CollapseResult`**

Purpose: Modifies grid state after clearing

**Steps**:
1. Apply transforms (CRIT multiplier display only — informational, no tile mutation)
2. Set cleared positions to `null` (CRIT anchors are also in the cleared list)
3. Call `collapseGrid()` for collapse and refill
4. Return move/newTile data for animation

**`collapseGrid(): CollapseResult`**

Public method for collapsing grid after removals:
- Shift remaining tiles down per column
- Refill empty cells at top with new random tiles
- Returns `{moves, newTiles}` for animation

**Note**: `blastArea`, `expandSpecialsCascade`, `chooseSpecialAnchor` (special tile cascade methods) were removed during the CRIT refactor. Match cascades now happen via natural collapse + re-find loop in `resolveBoard`, not via explicit special tile activation.

#### Bomb Methods

**`isBomb(kind): boolean`**
- Returns true if tile kind is Bomb

**`placeBombs(count, bombCooldown): {placed, replaced}`**
- Places `count` bombs on random non-bomb tiles
- Each bomb preserves the original tile's `base` property
- Sets `cooldown` property for countdown
- Returns `placed` (new bomb tiles) and `replaced` (original tiles)

**`tickBombs(): {exploded, remaining}`**
- Decrements cooldown on all bombs
- Returns bombs that reached 0 (exploded) and remaining bombs

**`getAdjacentBombs(clearedPositions): Position[]`**
- Finds all bombs orthogonally adjacent to cleared positions
- Used for bomb defusing mechanic

---

## Game Configuration (`src/game/config.ts`)

### Dynamic Screen Size

```typescript
// Set at runtime based on device/Telegram
let GAME_WIDTH = 480;
let GAME_HEIGHT = 800;
let SAFE_AREA = { top: 0, bottom: 0, left: 0, right: 0 };

setScreenSize(width, height, safeArea)  // Called from main.ts
updateScaledValues()                     // Recalculates UI_LAYOUT
```

### Board Settings
```typescript
BOARD_WIDTH = 8       // Columns
BOARD_HEIGHT = 7      // Rows
CELL_SIZE = 46        // Pixels per cell (fixed)
BOARD_PADDING = 8     // Border around board
```

### Player Stats
```typescript
PLAYER_HP_MAX = 200
PLAYER_MANA_MAX = 100
PLAYER_PHYS_ATTACK = 10
PLAYER_MAG_ATTACK = 10
PLAYER_MAG_DAMAGE_MULTIPLIER = 0.5  // Magic deals 50% damage
HP_PER_TILE = 10
MP_PER_TILE = 10
```

### Boss Stats
```typescript
BOSS_HP_MAX = 500
BOSS_PHYS_ATTACK = 10
BOSS_DAMAGED_HP_THRESHOLD = 0.5  // Switch to damaged sprite at 50% HP
```

### Boss Abilities
```typescript
BOSS_ABILITIES = {
  attack: {
    name: "Атака",
    cooldown: 1,
    damage: 30,           // BOSS_PHYS_ATTACK * 3
    hasCutscene: false,
  },
  bombs: {
    name: "Бомбы",
    cooldown: 2,
    bombCount: 5,
    bombCooldown: 3,      // Turns until bomb explodes
    bombDamage: 30,       // Per bomb
    hasCutscene: true,
  },
  shield: {
    name: "Щит",
    cooldown: 1,
    shieldDuration: 2,    // Blocks damage for 2 turns
    hasCutscene: true,
  },
  powerStrike: {
    name: "Мощный удар",
    cooldown: 2,
    damage: 100,          // BOSS_PHYS_ATTACK * 10
    manaDrain: 50,        // Removes player mana
    hasCutscene: true,
  },
}
```

### Boss Ability Pattern
```typescript
BOSS_ABILITY_PATTERN = [
  "attack",      // Turn 1: Quick attack
  "bombs",       // Turn 2-3: Place bombs
  "attack",      // Turn 4: Quick attack
  "shield",      // Turn 5: Activate shield
  "attack",      // Turn 6: Quick attack
  "powerStrike", // Turn 7-8: Heavy damage + mana drain
]
// Pattern repeats after powerStrike
```

### Skill Configuration
```typescript
SKILL_CONFIG = {
  skill1: { name: "Power", cost: 50,  damage: 100, heal: 0,  description: "Физ x10" },
  skill2: { name: "Blast", cost: 100, damage: 100, heal: 0,  description: "100 урона" },
  skill3: { name: "Heal",  cost: 30,  damage: 0,   heal: 50, description: "+50 HP" },
  skill4: { name: "Ult",   cost: 100, damage: 200, heal: 0,  description: "200 урона" },
}
```

### Dynamic UI Layout

Layout is computed via `getUILayout()` function based on current screen size:

```typescript
getUILayout() {
  // Builds layout BOTTOM-UP with fixed element sizes
  // 1. Skill buttons at bottom (with safe area)
  // 2. Player MP bar above skills
  // 3. Player HP bar above MP
  // 4. Player avatar spans HP to skills
  // 5. Board above player panel
  // 6. Boss HP bar above board
  // 7. Boss image fills remaining space (flexible)

  return {
    // Board positioning
    boardOriginX, boardOriginY, boardWidth, boardHeight,

    // Boss area
    bossImageCenterY, bossImageHeight, bossNameY,
    bossHpBarY, bossHpBarX, hpBarWidth, hpBarHeight,
    cooldownIconSize, cooldownIconX, cooldownIconY,

    // Player area
    avatarX, avatarY, avatarWidth, avatarHeight,
    playerHpBarX, playerHpBarY, playerMpBarY,
    playerBarWidth, playerBarHeight,

    // Skill buttons
    skillButtonsY, skillButtonSize, skillButtonSpacing, skillButtonsStartX,
  };
}
```

### UI Colors
```typescript
UI_COLORS = {
  background: 0x0d0f1a,
  panelBg: 0x131a2d,
  panelBgAlt: 0x111726,
  boardBg: 0x161820,
  bossHp: 0xde3e3e,
  playerHp: 0x4caf50,
  playerMana: 0x3b82f6,
  playerTurnText: "#9ef7a5",
  bossTurnText: "#ffb347",
  defusedFlash: 0x44ff66,
  overlay: 0x000000,
}
```

### Tile Classification
```typescript
DAMAGE_TILES = [TileKind.Sword, TileKind.Star]   // Fly to opponent
RESOURCE_TILES = [TileKind.Mana, TileKind.Heal]  // Fly to self
```

---

## Animation System (`src/game/animations.ts`)

Centralized animation configuration for consistent feel.

### Durations (milliseconds)
```typescript
ANIMATION_DURATIONS = {
  swap: 140,
  tileCollapse: 160,
  newTileDrop: 200,
  tileFade: 80,
  tileFly: 350,
  abilityOverlay: 200,
  abilityFadeIn: 300,
  abilityFadeOut: 300,
  flashDuration: 100,
  shakeDuration: 50,
}
```

### Easing Functions
```typescript
ANIMATION_EASING = {
  swap: "Quad.easeOut",
  collapse: "Quad.easeIn",
  fade: "Quad.easeIn",
  ability: "Quad.easeOut",
  scale: "Back.easeOut",
}
```

### Visual Effects
```typescript
VISUAL_EFFECTS = {
  tileScaleReduction: 0.5,
  tileFadeAlpha: 0,
  bossShakeOffset: 8,
  damageShakeOffset: 5,
  transformScaleFactor: 1.2,
}
```

### Flying Tile Parameters
```typescript
FLYING_TILE = {
  size: 32,
  arcHeight: 60,
  arcVariation: 30,
  targetSpread: 15,
  trailFade: 0.08,
  trailOpacity: 0.7,
  trailSize: 6,
  delayBetweenTiles: 30,
  flyingTileScaleReduction: 0.6,
}
```

---

## Boss Ability System (`src/game/BossAbility.ts`)

### BossAbilityManager Class

Manages boss ability pattern cycling and cooldown tracking.

```typescript
class BossAbilityManager {
  private patternIndex: number;    // Current position in pattern
  private currentCooldown: number; // Turns until ability fires

  get currentType(): BossAbilityType;  // "attack" | "bombs" | "shield" | "powerStrike"
  get currentAbility(): AbilityConfig; // Full ability configuration
  get state(): BossAbilityState;       // Current state for UI

  tick(): boolean;   // Decrement cooldown, returns true if ready
  advance(): void;   // Move to next ability in pattern
  reset(): void;     // Reset to pattern start
}

interface BossAbilityState {
  type: BossAbilityType;
  name: string;
  currentCooldown: number;
  maxCooldown: number;
  isReady: boolean;
}
```

**Pattern Cycling**:
1. Manager starts at pattern index 0 ("attack")
2. After ability executes, `advance()` moves to next index
3. Pattern wraps around after last ability

---

## UI Components (`src/ui/`)

### Meter (`Meter.ts`)
Reusable progress bar for HP/MP display.

**Structure**:
- Background rectangle with stroke
- Fill rectangle (width animated)
- Label text above
- Value text inside ("150/200")

**API**: `setValue(current: number, max: number)` - Updates fill width and text

### SkillButton (`SkillButton.ts`)
Interactive button for player abilities.

**States**:
- `enabled`: Can be clicked
- `ready`: Highlighted (enough mana)

**Visual Feedback**:
- Ready: Blue background (0x3355ff)
- Disabled: Dark background, low alpha
- Shows mana cost as subtitle

### CooldownIcon (`CooldownIcon.ts`)
Boss ability countdown indicator with ability-specific icons.

**Display**:
- Ability icon (⚔ attack, 💣 bombs, 🛡 shield, ⚡ powerStrike)
- Countdown number below icon
- Red circular background (0x8b0000)
- When ready: Bright red (0xff4444), shows "!", pulses

**API**:
- `setCooldown(value: number)` - Update countdown display
- `setAbility(type: BossAbilityType, cooldown: number)` - Set icon and countdown
- Uses shared `createPulseController` for guarded pulse animation

### DamageNumber (`DamageNumber.ts`)
Floating combat text.

**Types**:
- `damage`: Red, prefix "-"
- `heal`: Green, prefix "+"
- `mana`: Blue, prefix "+"

**Animation**:
- Spawns with scale bounce (Back.easeOut)
- Floats upward with random X offset
- Fades out over 800ms

### FlyingTile (`FlyingTile.ts`)
Animated tile effect when matches are cleared.

**Features**:
- Bezier curve trajectory (quadratic)
- Color trail particles
- Staggered spawn (30ms between tiles)
- Duration: 350-400ms

**Trail System**:
- Stores recent positions with alpha
- Draws circles at each point
- Alpha fades over time

---

## Utility Functions (`src/utils/helpers.ts`)

```typescript
clamp(value, min, max)           // Clamp value to range
wait(scene, ms)                  // Promise-based delay
createPulseAnimation(scene, target, scale, duration)  // Single pulse effect
createPulseController(scene, target, scale, duration) // Guarded pulse controller
```

**`createPulseController`** - Returns a function that triggers pulse animation only if not already pulsing. Used by CooldownIcon to prevent overlapping pulse animations.

---

## Asset Management (`src/game/assets.ts`)

Centralized texture key registry:
```typescript
ASSET_KEYS = {
  boss: {
    normal: "kristi_1",       // HP >= 50%
    damaged: "kristi_2",      // HP < 50%
    ulta: "kristi_ulta",      // Ability cutscene
  },
  tiles: {
    [TileKind.Sword]: "tile_sword",
    [TileKind.Star]: "tile_star",
    [TileKind.Mana]: "tile_mana",
    [TileKind.Heal]: "tile_heal",
    [TileKind.Bomb]: "tile_bomb",
  }
}
```

(BoosterRow / BoosterCol / Ultimate keys were removed during the CRIT refactor along with the special tile types themselves.)

---

## Telegram Integration (`src/telegram/telegram.ts`)

**Functions**:
- `getTelegram()`: Returns `window.Telegram?.WebApp` or null
- `initTelegram()`: Calls `ready()` and `expand()` to initialize Mini App

**Type Definitions**:
```typescript
type TelegramWebApp = {
  ready: () => void;      // Signal app is ready
  expand?: () => void;    // Expand to full height
  initData?: string;      // User data (needs backend validation)
}
```

---

## Key Patterns & Design Decisions

### Tile ID Tracking
Each tile has unique `id` (incrementing counter). Two maps maintain relationships:
- `tileSprites: Map<id, Phaser.GameObjects.Image>` - For animation control
- `tilePositions: Map<id, Position>` - For grid lookups

When grid changes, `rebuildPositionMap()` syncs positions from board state.

### Outcome-Based Rendering
Board operations return descriptive objects before modifying state:
1. `ClearOutcome` - What will be cleared, what transforms happen
2. `CollapseResult` - What moves down, what new tiles spawn

This allows animation to run based on pre-calculated data, then state updates after.

### Async Animation Chain
All animations return `Promise<void>`. Game flow uses `async/await`:
```typescript
await animateTransforms(outcome.transforms);
await animateClear(outcome, actor);
applyMatchResults(outcome.counts, actor);
await animateCollapse(collapse);
```

### Centralized Target Positions
`bossTarget` and `playerTarget` getters provide centralized access to animation target positions, avoiding repeated calculations.

### Actor-Based Animation System
Clear animations differentiate between "player" and "boss" actors:
- Damage tiles fly to opponent (player matching -> fly to boss)
- Resource tiles fly to self
- Enables boss abilities to use same resolution system

### Turn-Based Lock
`busy` flag prevents input during animations. Set `true` at action start, `false` when ready for next input.

### Bomb Mechanics
- Bombs replace existing tiles but preserve `base` property
- Bombs don't participate in matches (excluded from run detection)
- Adjacent bombs are defused when nearby tiles are cleared
- Bombs explode at end of turn when cooldown reaches 0

### Shared Pulse Controller
`createPulseController()` provides guarded pulse animation that prevents overlapping pulses. Used by CooldownIcon.

### Code Reuse in Board.ts
`applyClearOutcome()` delegates to `collapseGrid()` for collapse logic, avoiding code duplication.

---

## Deployment

**GitHub Pages Configuration** (`vite.config.ts`):
```typescript
export default defineConfig({
  base: "/match3-miniapp-mvp/",
});
```

Build output goes to `docs/` for GitHub Pages hosting.

---

## Depth Layer Map (GameScene)

All Phaser `setDepth()` values used in the game, from back to front:

| Depth | Element | Notes |
|-------|---------|-------|
| **-2** | Background image (`bgImage`) | Fullscreen game background |
| **-0.1** | Boss glow layer (`bossImageGlow`) | Fire/aura behind boss |
| **-0.05** | Boss brightness overlay (`bossGlowBrightness`) | Additive pulse, ADD blend |
| **0** | Boss main sprite (`bossImage`) | Solid boss art |
| **0.4** | Shield overlay image | Boss shield sprite |
| **0.5** | Board background / shield glow | Dark board rect, shield pulse |
| **0.6** | Grid lines (`gridGfx`) | Cell grid overlay |
| **0.7** | Hint yellow rectangles | 4+ match border hint |
| **0.99** | Enhanced tile glows (`tileGlows`) | Gold/red radial gradient |
| **1** | Tile sprites | Main game tiles |
| **1.5** | Hint white overlays (`hintOverlays`) | White tintFill clones |
| **2** | Bomb cooldown text / skill buttons | Text on tiles, skill UI |
| **3** | Player avatar frame + background | Gold border, dark bg |
| **4** | HUD elements | HP/MP bars, boss name, cooldown icon |
| **5** | Mute/settings buttons | Top-right controls |
| **8–12** | Shuffle animation | Temporary elevated tiles |
| **100** | Tips, bomb flash, floating text | SpeechBubble, effects |
| **200–202** | Skill unlock tutorial | Overlay + button + bubble |
| **499** | Attack ability overlay | Black rect behind attack art |
| **500** | Cutscene overlay | Black rect behind ability art (alpha 0.6) |
| **500.5** | Cutscene boss glow layer | Fullscreen back texture |
| **501** | Cutscene boss main layer | Fullscreen solid texture |
| **502** | Cutscene ability text | Red ability name |
| **998–999** | Game end overlay + flash | Victory/defeat screen |
| **1000** | Game end UI / settings panel | Buttons, stats, modal |
| **1001** | Confetti/particles | Victory/defeat particles |

---

## Git Workflow

**После каждого изменения кода обязательно выполнять:**

```bash
git add -A && git commit -m "update" && git push origin main
```

Это нужно делать автоматически после любых изменений в коде.
