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
│   ├── ShieldIcon.ts          # Boss shield duration indicator
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
   - `BoosterRow` - Yellow rounded rectangle (0xf7c948)
   - `BoosterCol` - Red-orange rounded rectangle (0xf17c67)
   - `Ultimate` - White rounded rectangle (0xffffff)
   - `Bomb` - Black circle with red border, orange fuse, yellow spark
   - All generated at `CELL_SIZE` (46px)

3. Transitions to `GameScene` via `this.scene.start("GameScene")`

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
- If tapped tile is special (BoosterRow/BoosterCol/Ultimate), activates it immediately
- Triggers `resolveBoard()` with manual special activation

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
  BoosterRow = "boosterRow", // Clears entire row
  BoosterCol = "boosterCol", // Clears entire column
  Ultimate = "ultimate",     // Clears row + column (cross)
  Bomb = "bomb",             // Explodes after cooldown
}

type BaseTileKind = Sword | Star | Mana | Heal;  // Only these spawn naturally

type Tile = {
  id: number;           // Unique identifier for sprite tracking
  kind: TileKind;       // Current visual/behavior type
  base: BaseTileKind;   // Original base type (preserved for specials/bombs)
  cooldown?: number;    // For bombs: turns until explosion
}

type Match = {
  positions: Position[];
  kind: BaseTileKind;
  direction: "row" | "col";
}
```

### Board (`Board.ts`)

**Constructor**: Creates `width x height` grid, fills with random tiles avoiding initial matches

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
- Returns all matches found

**`computeClearOutcome(matches, manualSpecials, swapTargets): ClearOutcome`**

Purpose: Determines what tiles to clear and what transforms to apply

**Special Tile Creation Rules**:
- **5-match** -> BoosterRow (horizontal) or BoosterCol (vertical)
- **6+ match** -> Ultimate

**Cascade Logic**:
- If clearing hits a special tile, expands clear area
- BoosterRow clears entire row
- BoosterCol clears entire column
- Ultimate clears both row AND column (cross pattern)
- Recursive: if cleared special triggers another special

**`applyClearOutcome(outcome): CollapseResult`**

Purpose: Modifies grid state after clearing

**Steps**:
1. Apply transforms (convert tiles to specials)
2. Set cleared positions to `null`
3. Call `collapseGrid()` for collapse and refill
4. Return move/newTile data for animation

**`collapseGrid(): CollapseResult`**

Public method for collapsing grid after removals:
- Shift remaining tiles down per column
- Refill empty cells at top with new random tiles
- Returns `{moves, newTiles}` for animation

**`blastArea(pos, kind): Position[]`**

Returns positions affected by special tile activation:
- `BoosterRow`: All positions in row `pos.y`
- `BoosterCol`: All positions in column `pos.x`
- `Ultimate`: Union of row and column

#### Bomb Methods

**`isBomb(kind): boolean`**
- Returns true if tile kind is Bomb

**`placeBombs(count, bombCooldown): {placed, replaced}`**
- Places `count` bombs on random non-special, non-bomb tiles
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

### ShieldIcon (`ShieldIcon.ts`)
Boss shield duration indicator.

**Display**:
- Shield emoji (🛡) with duration number
- Blue background (0x3366ff)
- Pulses when activated
- Hidden when shield inactive

**API**:
- `show(duration: number)` - Display with initial duration
- `updateDuration(duration: number)` - Update countdown, auto-hides at 0
- `hide()` - Manual hide
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

**`createPulseController`** - Returns a function that triggers pulse animation only if not already pulsing. Used by CooldownIcon and ShieldIcon to prevent overlapping pulse animations.

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
    [TileKind.BoosterRow]: "tile_booster_row",
    [TileKind.BoosterCol]: "tile_booster_col",
    [TileKind.Ultimate]: "tile_ultimate",
    [TileKind.Bomb]: "tile_bomb",
  }
}
```

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
`createPulseController()` provides guarded pulse animation that prevents overlapping pulses. Used by CooldownIcon and ShieldIcon.

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

## Git Workflow

**После каждого изменения кода обязательно выполнять:**

```bash
git add -A && git commit -m "update" && git push origin main
```

Это нужно делать автоматически после любых изменений в коде.
