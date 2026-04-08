# Gold Standard Block — feature-item-info-display

Few-shot examples compiled by Lead for coder prompts. Coders MUST study these patterns
before implementing. Deviations require escalation to tech-lead with justification.

## 1. MODAL OVERLAY PATTERN (from .conventions/gold-standards/ui-component.ts §12)

The canonical pattern for tappable modal overlays in v2 scenes uses TWO separate
interactive objects: a fullscreen backdrop that closes the modal on `pointerdown`,
and a panel above it that registers an EMPTY `pointerdown` handler so taps on the
panel are absorbed instead of bubbling through.

Phaser delivers each pointer event to the topmost interactive object at the pointer
position (input.topOnly = true by default). By making the panel interactive (even
with a no-op handler), pointerdowns landing inside the panel rect never reach the
backdrop's close handler. Pointerdowns outside the panel hit the backdrop and close
the modal as expected.

```ts
// Backdrop — full screen, closes modal on tap
const backdrop = this.add
  .rectangle(0, 0, camW, camH, MODAL_BG_COLOR, MODAL_BG_ALPHA)
  .setOrigin(0)
  .setInteractive({ useHandCursor: false });
backdrop.on("pointerdown", () => this.closeModal());
layer.add(backdrop);

// Panel — drawn ABOVE the backdrop, marked interactive with no handler
// so Phaser delivers pointerdowns here instead of the backdrop. This is
// the RISK-6 mitigation: tapping inside the panel area never reaches
// the backdrop's close handler.
const panel = this.add
  .rectangle(cx, cy, panelWidth, panelHeight, MODAL_PANEL_COLOR, MODAL_PANEL_ALPHA)
  .setStrokeStyle(MODAL_PANEL_STROKE_WIDTH * d, MODAL_PANEL_STROKE)
  .setInteractive({ useHandCursor: false });
panel.on("pointerdown", () => {}); // intentional no-op — absorbs
layer.add(panel);
```

ANTI-PATTERN: do NOT try to use `setActive(false)` on the backdrop while the panel
is open, or stop event propagation manually. Phaser's input system already does the
right thing if you stack interactive objects.

Reference: `src/v2/scenes/CharacterGalleryScene.ts → openModal()` (line 409).

---

## 2. SCENE COORDINATE SYSTEM — Non-zoomed v2 convention

v2 scenes (HubScene, PlayerStatsScene, CharacterGalleryScene, ShopScene, etc.) do
NOT call `setZoom(DPR)`. Every constant is multiplied by `DPR` at render time,
sizes too. This means the same `100 * d` x-coordinate gets denser pixels on Retina
screens without camera zoom math.

```ts
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

Every constant carries the `* d` (or `* DPR`) multiplier. Font sizes use template
literals with `${X * d}px`. Stroke widths multiply by `d`. Y-coordinates that need
to respect the safe area add `+ SAFE_AREA.top * d`.

WRONG — forgetting DPR in a non-zoomed v2 scene:
```ts
this.add.text(100, 100, "Hello", { fontSize: "24px" });
//                                              ^^^^^ tiny on Retina screens
```

Reference: `.conventions/gold-standards/scene-coordinates.md`.

---

## 3. SINGLETON EXPORT PATTERN (from Toast.ts)

Export a single manager instance. Callers do NOT instantiate — they import and
call the singleton's methods. This is the pattern for scene-bound helpers that
need consistent behavior across the codebase.

```ts
// src/v2/ui/Toast.ts — end of file
class ToastManager {
  // private state
  show(scene: Phaser.Scene, opts: ToastOptions): void { ... }
}

export const toast = new ToastManager();

// Callers:
import { toast } from "../ui/Toast";
toast.show(this, { message: "...", type: "error" });
```

ItemCardModal MUST follow the same pattern:
```ts
export class ItemCardModal { ... }
export const itemCardModal = new ItemCardModal();
```

Reference: `src/v2/ui/Toast.ts` + `.conventions/gold-standards/toast-notifications.ts`.

---

## 4. HEIGHT MEASUREMENT — read text.height post-creation

For dynamic layouts where panel height depends on wrapped text length, DO NOT
implement a 2-pass measure-then-render approach. Use Phaser's built-in wordWrap
and read `.height` AFTER creation to advance Y cursor.

```ts
// From CharacterGalleryScene.openModal lines 498-510:
const backstoryText = this.add
  .text(cx, y, this.truncateBackstory(def.backstory), {
    fontSize: `${13 * d}px`,
    color: MODAL_BACKSTORY_COLOR,
    fontFamily: FONT,
    fontStyle: "italic",
    wordWrap: { width: backstoryWidth },
    align: "center",
  })
  .setOrigin(0.5, 0);
layer.add(backstoryText);
y += backstoryText.height + 18 * d;  // ← read .height, advance cursor
```

No off-screen pre-measurement. No custom text wrapping. Render → read → advance.

---

## 5. NAMING + IMPORT CONVENTIONS

### Naming (from .conventions/checks/naming.md)
- Methods: camelCase (`openModal`, `closeModal`, `buildStatsSummary`)
- Private methods: camelCase, `handle*` for event handlers, `build*` for builders, `render*` for renderers
- Constants: UPPER_SNAKE_CASE at module level (`ANIMATION_DURATIONS`, `MODAL_BG_COLOR`)
- Types / Interfaces / Classes: PascalCase (`ItemCardModal`, `StatDelta`, `ItemCardModalOptions`)
- Files: PascalCase for classes (`ItemCardModal.ts`), camelCase for utility modules (`itemFormat.ts`)

### Imports (from .conventions/checks/imports.md)
Order:
1. External packages (`import Phaser from "phaser"`)
2. Game config and constants (`import { DPR } from "../../game/config"`)
3. Types (`import type { ItemDef } from "../content/types"`)
4. Utilities
5. UI components (`import { itemCardModal } from "../ui/ItemCardModal"`)

Rules:
- Default import for Phaser: `import Phaser from "phaser";`
- Type-only imports: `import type { ItemDef } from "../content/types";`
- Relative paths only (no path aliases configured)
- Import from defining module (not re-exports)

### v2-isolation (from .conventions/checks/v2-isolation.md)
- **FORBIDDEN**: `src/scenes/*` MUST NOT import `src/v2/*`
- **ALLOWED**: `src/v2/*` can import `src/match3/*`, `src/ui/*`, `src/game/*`, `src/utils/*`, `src/telegram/*`
- **ALLOWED**: `src/v2/ui/*` imports `src/game/config` (DPR, SAFE_AREA) — standard
- **FORBIDDEN**: `src/v2/ui/*` imports `src/v2/scenes/*` — UI components don't depend on scenes
