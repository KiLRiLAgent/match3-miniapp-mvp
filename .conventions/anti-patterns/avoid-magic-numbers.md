# Anti-Pattern: Magic Numbers

All visual and timing parameters must be defined as named constants in their respective config files. Never use inline numeric literals for animation timing, scale factors, alpha values, or offsets.

## Where constants belong

| Category | File | Object |
|----------|------|--------|
| Animation timing (ms) | `src/game/animations.ts` | `ANIMATION_DURATIONS` |
| Easing functions | `src/game/animations.ts` | `ANIMATION_EASING` |
| Visual effects (scale, alpha, offsets) | `src/game/animations.ts` | `VISUAL_EFFECTS` |
| Flying tile params | `src/game/animations.ts` | `FLYING_TILE` |
| Hint animation params | `src/game/animations.ts` | `HINT_ANIMATION` |
| Board/cell/screen sizes | `src/game/config.ts` | Top-level exports |
| Game balance (HP, damage, costs) | `src/game/config.ts` | `GAME_PARAMS` |
| UI colors | `src/game/config.ts` | `UI_COLORS` |
| Component-local timing | Same file as component | Module-level `const` |

## Examples

```typescript
// WRONG — magic numbers inline
this.tweens.add({ duration: 200, alpha: { from: 0.5, to: 1.0 } });
tile.setDisplaySize(Math.round(CELL_SIZE * 1.1), Math.round(CELL_SIZE * 1.1));

// CORRECT — named constants
this.tweens.add({
  duration: ANIMATION_DURATIONS.tileFade,
  alpha: { from: VISUAL_EFFECTS.glowBaseAlpha, to: VISUAL_EFFECTS.glowPeakAlpha },
});
tile.setDisplaySize(
  Math.round(CELL_SIZE * TILE_DISPLAY_SCALE),
  Math.round(CELL_SIZE * TILE_DISPLAY_SCALE)
);
```

## Component-local constants

For timing values used only within a single component, define them as module-level constants in the same file:

```typescript
// At top of Meter.ts
const FLASH_DURATION = 200;
const DELTA_DRAIN_DURATION = 500;
```

## Session finding

During this session, reviewers flagged hardcoded `1.1` tile scale and `{ from: 0.5, to: 1.0 }` glow alpha in GameScene as violations. These were extracted to `TILE_DISPLAY_SCALE` and `VISUAL_EFFECTS.glowBaseAlpha/glowPeakAlpha`.
