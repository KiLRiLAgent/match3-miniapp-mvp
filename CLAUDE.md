# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
npm run dev      # Start Vite dev server with HMR
npm run build    # TypeScript check + Vite production build
npm run preview  # Preview production build locally
```

## Project Overview

This is a Match-3 boss fight game built as a Telegram Mini App using Phaser 3 and TypeScript. The game features turn-based combat where players match tiles to deal damage, heal, and charge skills against an AI boss.

---

## Detailed Architecture

### Entry Point (`src/main.ts`)

Creates Phaser game instance with configuration:
- Resolution: 480x800 pixels (mobile-optimized)
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
   - All generated at `CELL_SIZE` (56px) with 10px border radius

3. Transitions to `GameScene` via `this.scene.start("GameScene")`

---

### GameScene (`src/scenes/GameScene.ts`)

**Purpose**: Main gameplay controller (950+ lines)

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
private bossHp: number;      // Max: 500
private playerHp: number;    // Max: 200
private mana: number;        // Max: 100

// Boss ability
private bossAbility: BossAbility; // Cooldown-based special attack
```

#### Initialization Flow (`create()`)

1. `initTelegram()` - Initializes Telegram WebApp SDK
2. Calculate `boardOrigin` - Centers board horizontally at y=220
3. `buildHud()` - Creates UI panels and meters
4. `resetState()` - Initializes game state and creates board
5. `buildBoard()` - Spawns tile sprites for initial grid
6. `buildSkills()` - Creates 4 skill buttons
7. `setupInputHandlers()` - Configures pointer events
8. `updateHud()` - Initial UI sync

#### HUD Layout

```
+------------------------------------------+
| Lv. 30                        [Turn Text]|
|                                          |
|            [Boss Image 180x180]          |
|            [Boss HP Bar 300x16]  [CD]    |
+------------------------------------------+
|                                          |
|           [8x7 Game Board]               |
|            (56px cells)                  |
|                                          |
+------------------------------------------+
| [Avatar] [HP Bar] [Mana Bar]             |
| [Skill1] [Skill2] [Skill3] [Skill4]      |
+------------------------------------------+
```

#### Input System

**Pointer Events**:
- `pointerdown` on tile sprite: Stores `dragStart` with grid position and screen coordinates
- `pointerup` on scene: Calculates delta, determines tap vs swipe

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
3. `finishPlayerTurn()` called after board settles
4. Boss ability cooldown ticks down
5. If cooldown reaches 0, boss turn begins

**Boss Turn** (`finishPlayerTurn` -> `executeBossAbility`):
1. Cooldown icon shows "!" and pulses
2. Full-screen cutscene with `kristi_ulta.png`
3. Ability name displayed ("Mighty Strike")
4. Camera shake effect
5. Damage applied to player (100 damage = 10 * 10 multiplier)
6. Cooldown resets to 3 turns
7. Control returns to player

#### Board Resolution (`resolveBoard`)

**Cascade Loop**:
```
while (matches.length || specials.length):
    1. computeClearOutcome() - Calculate what to clear, transforms
    2. animateClear() - Flying tiles, fade out
    3. applyMatchResults() - Deal damage, heal, gain mana
    4. applyClearOutcome() - Remove tiles, collapse, refill
    5. animateCollapse() - Falling animation
    6. findMatches() - Check for chain reactions
```

#### Damage Calculation (`applyMatchResults`)

**Player Attacking Boss**:
- Sword tiles: `count * PLAYER_PHYS_ATTACK` (10 per tile)
- Star tiles: `count * PLAYER_MAG_ATTACK * 0.5` (5 per tile, magic reduced)
- Mana tiles: `count * MP_PER_TILE` (10 MP per tile)
- Heal tiles: `count * HP_PER_TILE` (10 HP per tile)

**Boss Attacking Player** (via special ability):
- Fixed 100 damage when ability activates

#### Animation System

**Swap Animation** (`animateSwap`):
- Duration: 140ms
- Easing: `Quad.easeOut`

**Clear Animation** (`animateClear`):
- Transforms pulse (scale 1.2x) with `Back.easeOut`
- Tiles fly to targets:
  - Damage tiles -> Boss (Sword/Star)
  - Resource tiles -> Player (Mana/Heal)
- Bezier curve trajectory with trail effect
- Duration: 350ms with 30ms stagger

**Collapse Animation** (`animateCollapse`):
- Existing tiles fall: 160ms
- New tiles spawn above board, fall: 200ms
- Easing: `Quad.easeIn`

#### Skill System

4 Skills with mana costs:
```typescript
skill1: { name: "Power", cost: 50, damage: 100 }  // 10x physical
skill2: { name: "Blast", cost: 100, damage: 100 }
skill3: { name: "Heal", cost: 30, heal: 50 }
skill4: { name: "Ult", cost: 100, damage: 200 }
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
  Sword = "sword",      // Physical damage
  Star = "star",        // Magic damage
  Mana = "mana",        // Resource
  Heal = "heal",        // Health restoration
  BoosterRow = "boosterRow",   // Clears entire row
  BoosterCol = "boosterCol",   // Clears entire column
  Ultimate = "ultimate",       // Clears row + column (cross)
}

type BaseTileKind = Sword | Star | Mana | Heal;  // Only these spawn naturally

type Tile = {
  id: number;        // Unique identifier for sprite tracking
  kind: TileKind;    // Current visual/behavior type
  base: BaseTileKind; // Original base type (preserved for specials)
}

type Match = {
  positions: Position[];
  kind: BaseTileKind;
  direction: "row" | "col";
}
```

### Board (`Board.ts`)

**Constructor**: Creates `width x height` grid, fills with random tiles avoiding initial matches

**Key Methods**:

#### `fillInitial()`
- Iterates through grid left-to-right, top-to-bottom
- For each cell, generates random tile
- Rerolls if placing would create immediate match (checks 2 tiles left and 2 tiles up)

#### `findMatches(): Match[]`
- Scans rows for horizontal runs of 3+
- Scans columns for vertical runs of 3+
- Detects 2x2 square matches (4 same tiles in square)
- Returns all matches found

#### `computeClearOutcome(matches, manualSpecials, swapTargets): ClearOutcome`
**Purpose**: Determines what tiles to clear and what transforms to apply

**Special Tile Creation Rules**:
- 4-match horizontal -> BoosterRow at swap position
- 4-match vertical -> BoosterCol at swap position
- 5+ match -> Ultimate at swap position

**Cascade Logic**:
- If clearing hits a special tile, expands clear area
- BoosterRow clears entire row
- BoosterCol clears entire column
- Ultimate clears both row AND column (cross pattern)
- Recursive: if cleared special triggers another special

#### `applyClearOutcome(outcome): CollapseResult`
**Purpose**: Modifies grid state after clearing

**Steps**:
1. Apply transforms (convert tiles to specials)
2. Set cleared positions to `null`
3. Collapse: shift remaining tiles down per column
4. Refill: generate new random tiles at top
5. Return move/newTile data for animation

#### `blastArea(pos, kind): Position[]`
Returns positions affected by special tile activation:
- `BoosterRow`: All positions in row `pos.y`
- `BoosterCol`: All positions in column `pos.x`
- `Ultimate`: Union of row and column

---

## Game Configuration (`src/game/config.ts`)

### Board Settings
```typescript
BOARD_WIDTH = 8       // Columns
BOARD_HEIGHT = 7      // Rows
CELL_SIZE = 56        // Pixels per cell
BOARD_PADDING = 12    // Border around board
```

### Game Balance
```typescript
// Player stats
PLAYER_HP_MAX = 200
PLAYER_MANA_MAX = 100
PLAYER_PHYS_ATTACK = 10
PLAYER_MAG_ATTACK = 10
HP_PER_TILE = 10
MP_PER_TILE = 10

// Boss stats
BOSS_HP_MAX = 500
BOSS_PHYS_ATTACK = 10
BOSS_ABILITY_COOLDOWN = 3    // Turns until ability
BOSS_ABILITY_MULTIPLIER = 10 // Damage = PHYS * MULT = 100

// Skill costs
POWER_STRIKE_COST = 50
POWER_STRIKE_MULTIPLIER = 10
```

---

## Boss Ability System (`src/game/BossAbility.ts`)

```typescript
class BossAbility {
  name: string;           // "Mighty Strike"
  maxCooldown: number;    // 3 turns
  damage: number;         // 100
  cooldown: number;       // Current countdown

  tick(): boolean        // Decrements cooldown, returns true if ready
  reset(): void          // Resets to maxCooldown after use
  isReady: boolean       // True when cooldown <= 0
}
```

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
Boss ability countdown indicator.

**Display**:
- Sword icon with number
- Red background (0x8b0000)
- When ready: Bright red, shows "!", pulses

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

## Asset Management (`src/game/assets.ts`)

Centralized texture key registry:
```typescript
ASSET_KEYS = {
  boss: {
    normal: "kristi_1",    // HP >= 50%
    damaged: "kristi_2",   // HP < 50%
    ulta: "kristi_ulta",   // Ability cutscene
  },
  tiles: {
    [TileKind.Sword]: "tile_sword",
    [TileKind.Star]: "tile_star",
    [TileKind.Mana]: "tile_mana",
    [TileKind.Heal]: "tile_heal",
    [TileKind.BoosterRow]: "tile_booster_row",
    [TileKind.BoosterCol]: "tile_booster_col",
    [TileKind.Ultimate]: "tile_ultimate",
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
await animateClear(outcome);
applyMatchResults(outcome.counts);
await animateCollapse(collapse);
```

### Turn-Based Lock
`busy` flag prevents input during animations. Set `true` at action start, `false` when ready for next input.

---

## Deployment

**GitHub Pages Configuration** (`vite.config.ts`):
```typescript
export default defineConfig({
  base: "/match3-miniapp-mvp/",
});
```

Build output goes to `docs/` for GitHub Pages hosting.
