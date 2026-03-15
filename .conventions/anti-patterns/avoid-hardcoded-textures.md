# Anti-Pattern: Hardcoded Texture Keys

Never use string literals for texture keys. Always reference `ASSET_KEYS` from `src/game/assets.ts`.

## Why

- Typos in texture key strings cause silent failures (missing texture, no compile error)
- Renaming a texture requires finding all string occurrences instead of updating one place
- `ASSET_KEYS` provides autocomplete and type checking

## Examples

```typescript
// WRONG — hardcoded string
this.load.image("tile_sword", "assets/tiles/tile_sword.png");
scene.add.image(x, y, "tile_sword");
const key = "safira_main";

// CORRECT — ASSET_KEYS reference
this.load.image(ASSET_KEYS.tiles[TileKind.Sword], "assets/tiles/tile_sword.png");
scene.add.image(x, y, ASSET_KEYS.tiles[TileKind.Sword]);
const key = ASSET_KEYS.boss.main;
```

## Adding new textures

1. Add the key to `ASSET_KEYS` in `src/game/assets.ts`
2. Load in `BootScene.preload()` using the key
3. Reference everywhere via `ASSET_KEYS`

```typescript
// assets.ts
effects: {
  slash: "effect_slash",
  slashDouble: "effect_slash_double",
},

// BootScene.ts
this.load.image(ASSET_KEYS.effects.slash, "splash_1.png");

// GameScene.ts
scene.add.image(x, y, ASSET_KEYS.effects.slash);
```

## Session finding

Slash effect textures were added following this pattern: keys defined in `ASSET_KEYS.effects`, loaded in BootScene via those keys, ready for GameScene consumption.
