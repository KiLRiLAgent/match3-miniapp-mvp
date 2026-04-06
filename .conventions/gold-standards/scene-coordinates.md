# Gold Standard: Scene Coordinate Systems (Zoomed vs Non-Zoomed)

This project uses **two different coordinate conventions** depending on whether the scene applies a camera zoom for DPR scaling. Mixing them produces sprites that are too small (DPR-multiplied twice) or too large (DPR not applied at all). Phase 1A surfaced this when ChainOverlay was first prototyped — coordinates are now standardized.

## Convention summary

| Scene type | Camera | Coordinate input | DPR multiplier |
|------------|--------|------------------|----------------|
| **v1 GameScene** + ChainOverlay | `setZoom(DPR)` | logical (no DPR) | NEVER multiply |
| **v2 scenes** (HubScene, StoryMapScene, LocationScene, DialogueScene, PostCombatScene, CombatBridgeScene) | no zoom | **logical × DPR** | apply `* DPR` to coordinates AND sizes |

## Why two conventions

**v1 GameScene** zooms the camera by `DPR` so the scene is drawn at logical-pixel coordinates and Phaser stretches the result to physical pixels. Inside the zoomed camera, all coordinates are in logical units. Multiplying coordinates by DPR a second time would compound the scale.

**v2 scenes** were authored after the DPR system was finalized and use the simpler "draw at physical-pixel coords" convention. Each constant is multiplied by `DPR` at render time, sizes too. This means the same `100 * d` x-coordinate gets denser pixels on Retina screens without requiring camera zoom math.

Both conventions are valid; the rule is **be consistent within a single scene** and **match the surrounding code**.

## Convention 1: Zoomed scenes (v1 GameScene + ChainOverlay)

```typescript
// src/scenes/GameScene.ts (top of create())
this.cameras.main.setZoom(DPR);
this.cameras.main.centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);

// All sprite coordinates are LOGICAL — no DPR multiplication
const px = boardOriginX + chainPos.x * CELL_SIZE + CELL_SIZE / 2;
const py = boardOriginY + chainPos.y * CELL_SIZE + CELL_SIZE / 2;
const bgRect = this.scene.add.rectangle(px, py, CELL_SIZE * 0.85, CELL_SIZE * 0.85, color);
```

`ChainOverlay` follows this convention because it lives inside GameScene's zoomed camera. Its constructor takes `(boardOriginX, boardOriginY, cellSize)` in **logical units** and never applies DPR internally.

**Verification**: `grep DPR src/ui/ChainOverlay.ts` returns ZERO matches. If you ever see `DPR` referenced inside ChainOverlay, it's a bug.

## Convention 2: Non-zoomed v2 scenes

```typescript
// src/v2/scenes/PostCombatScene.ts (no setZoom call)
const d = DPR;

// Every coordinate and size multiplied by d
this.add.text(cx, 100 * d + SAFE_AREA.top * d, title, {
  fontSize: `${48 * d}px`,
  strokeThickness: 5 * d,
});

const button = this.add.rectangle(x, y, 240 * d, 56 * d, BTN_BG);
button.setStrokeStyle(2 * d, BTN_STROKE);
```

Every constant carries the `* d` (or `* DPR`) multiplier. Font sizes use template literals with `${X * d}px`. Stroke widths multiply by `d`. Y-coordinates that need to respect the safe area on iOS notch devices add `+ SAFE_AREA.top * d`.

This includes the 3 v2/ui Container components (DialogueChoiceButton, CharacterPortrait, RelationshipMeter) — they extend Container at non-zoomed coordinates and consume DPR at render time.

## Common mistakes

**Wrong: applying DPR inside a zoomed scene**
```typescript
// In GameScene (already zoomed by DPR)
this.add.rectangle(100 * DPR, 100 * DPR, 50 * DPR, 50 * DPR, 0xff0000);
//                  ^^^^^^^^^ this gets zoomed AGAIN by setZoom(DPR), ending up 4x physical pixels
```

**Wrong: forgetting DPR in a non-zoomed v2 scene**
```typescript
// In HubScene (no setZoom)
this.add.text(100, 100, "Hello", { fontSize: "24px" });
//                                              ^^^^^ tiny on Retina screens
```

**Right: consistent within scene**
```typescript
// GameScene path (zoomed)
this.cameras.main.setZoom(DPR);
this.add.rectangle(100, 100, 50, 50, 0xff0000);  // logical units, no DPR

// HubScene path (non-zoomed)
const d = DPR;
this.add.rectangle(100 * d, 100 * d, 50 * d, 50 * d, 0xff0000);  // physical units
```

## When extending GameScene with new sprites

If you add new sprites to v1 GameScene (or any scene that calls `setZoom(DPR)`), use **logical coordinates** without DPR. ChainOverlay is the canonical example — it's a manager class but lives inside the zoomed GameScene camera, so its sprites use logical coords.

If you add a new v2 scene, follow the v2 convention: do NOT call `setZoom(DPR)`, multiply every coordinate and size by `DPR` at render time.

## SAFE_AREA handling

Both conventions respect Telegram safe areas via `SAFE_AREA.top/bottom/left/right`:

- **Zoomed (v1)**: `SAFE_AREA.top` is in logical units already — used directly without DPR
- **Non-zoomed (v2)**: multiply `SAFE_AREA.top * DPR` because the rest of the scene is in physical units

```typescript
// v1 GameScene
const topY = SAFE_AREA.top + 16;

// v2 PostCombatScene
const topY = SAFE_AREA.top * d + 100 * d;
```

## Reference files

- `src/scenes/GameScene.ts` — zoomed convention (`cameras.main.setZoom(DPR)` at line 254)
- `src/ui/ChainOverlay.ts` — zoomed convention (logical units, no DPR multiplier)
- `src/v2/scenes/HubScene.ts` — non-zoomed convention (no setZoom, every coord × DPR)
- `src/v2/scenes/PostCombatScene.ts` — non-zoomed convention (extensive DPR usage)
- `src/v2/ui/RelationshipMeter.ts` — non-zoomed convention (DPR used in font sizes and stroke widths)

## History

This convention was clarified during Phase 1A Task #8 (ChainOverlay) and Task #11 (PostCombatScene) reviews. Earlier prototypes mixed conventions and produced sprites that were either invisibly small (DPR applied twice) or pixel-blurry (DPR forgotten). The rule "match the surrounding scene's convention" was extracted from architect-frontend's review comments.
