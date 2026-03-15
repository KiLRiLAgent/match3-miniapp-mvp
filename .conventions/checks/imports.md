# Convention: Import Rules

## Import Order

1. External packages (Phaser)
2. Game config and constants
3. Types
4. Utilities
5. UI components

```typescript
import Phaser from "phaser";
import { ASSET_KEYS } from "../game/assets";
import { CELL_SIZE, TILE_DISPLAY_SCALE, UI_COLORS } from "../game/config";
import { ANIMATION_DURATIONS, VISUAL_EFFECTS, FLYING_TILE } from "../game/animations";
import { TileKind } from "../match3/types";
import type { BaseTileKind } from "../match3/types";
import { tweenPromise, wait } from "../utils/helpers";
import { Meter } from "../ui/Meter";
```

## Rules

### Use relative paths for project imports
```typescript
// CORRECT
import { ASSET_KEYS } from "../game/assets";

// WRONG — no path aliases configured
import { ASSET_KEYS } from "@/game/assets";
```

### Separate type-only imports
```typescript
// CORRECT — use `import type` for types
import type { BaseTileKind } from "../match3/types";

// Also acceptable — mixed import when both values and types are needed
import { TileKind } from "../match3/types";
import type { BaseTileKind } from "../match3/types";
```

### Import from the defining module
```typescript
// CORRECT — config values from config.ts
import { CELL_SIZE, TILE_DISPLAY_SCALE } from "../game/config";

// CORRECT — animation values from animations.ts
import { ANIMATION_DURATIONS, VISUAL_EFFECTS } from "../game/animations";

// CORRECT — asset keys from assets.ts
import { ASSET_KEYS } from "../game/assets";

// WRONG — importing config values from a re-export
import { CELL_SIZE } from "../scenes/GameScene";
```

### Phaser import
```typescript
// CORRECT — default import
import Phaser from "phaser";

// Types accessed via namespace
Phaser.GameObjects.Image
Phaser.GameObjects.Graphics
Phaser.GameObjects.Container
Phaser.Scene
```

### No circular imports
- Config files (config.ts, animations.ts, assets.ts) must not import from scenes or UI
- UI components may import from config and types
- Scenes may import from everything
