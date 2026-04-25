# Anti-Pattern: Geometry Masks Inside Containers

**Geometry masks do NOT work correctly inside Phaser Containers.** This is a Phaser engine limitation, not a bug in our code.

## The Problem

Geometry masks on children inside a Container use world coordinates for clipping, but the Container applies its own transform. This causes the mask to clip at the wrong position — children appear cut off or invisible.

## Why This Matters

Even per-child masking (not container-level) fails inside Containers. The mask shape doesn't move with the container.

## Examples

```typescript
// WRONG — geometry mask inside Container (mask position doesn't follow container)
const maskGfx = scene.add.graphics();
maskGfx.fillRoundedRect(0, 0, width, height, radius);
this.fillGfx.setMask(maskGfx.createGeometryMask()); // broken inside Container

// ALSO WRONG — container-level mask clips ALL children
this.setMask(maskGfx.createGeometryMask());

// ALSO WRONG — naive `widthPx - 0.5` threshold leaves square corners
// poking into the border's curve zone at ~95% fill
private fillRadius(width: number) {
  if (width >= this.widthPx - 0.5) return this.radius;        // BUG
  return { tl: this.radius, tr: 0, bl: this.radius, br: 0 };
}

// CORRECT — three-case helper: curve zone snap, narrow pill, middle left-rounded
private fillRadius(width: number): number | RoundedRectRadius {
  const r = this.radius;
  if (width >= this.widthPx - r) return r;             // snap in right curve zone
  if (width < 2 * r) {                                  // narrow → pill shape
    const eff = width / 2;
    return { tl: eff, tr: eff, bl: eff, br: eff };
  }
  return { tl: r, tr: 0, bl: r, br: 0 };                // middle
}

// Caller snaps drawW when helper returned a number
const fr = this.fillRadius(fillWidth);
const drawW = typeof fr === "number" ? this.widthPx : fillWidth;
this.fillGfx.fillRoundedRect(0, 0, drawW, height, fr);
```

## The Solution: Per-Corner Radius with Three-Case Helper

Instead of geometry masks, use `fillRoundedRect` with a `fillRadius()` helper
that handles all three width regimes:

1. **Right curve zone** (`width >= widthPx - radius`): return uniform radius
   and snap drawW to `widthPx`. Sharp `tr/br` corners would otherwise extend
   beyond the rounded border curve and show as visible square overhangs.
2. **Narrow fill** (`width < 2 * radius`): pill shape — all four corners set
   to `width / 2`. Leaving `tr/br` at 0 produces a visible vertical sharp line
   on the right as the fill shrinks. Both sides must round to form a clean capsule.
3. **Normal middle**: `{ tl: r, tr: 0, bl: r, br: 0 }` for left-rounded,
   right-straight fills.

The threshold MUST be `widthPx - radius`, NOT `widthPx - 0.5`. The tighter
threshold only catches float precision at 100% fill — it does NOT catch the
real artifact band where straight corners sit inside the border curve zone.

The visual tradeoff (HP `widthPx - r .. widthPx` shows as full) is acceptable
because the exact value is rendered in a centered text label inside the bar.

This is implemented in both Meter.ts and LayeredMeter.ts via the `fillRadius()`
helper method.

## When geometry masks ARE safe

Only on game objects that are NOT inside a Container — i.e., added directly to the scene. For UI components that extend Container, always use per-corner radius or other non-mask approaches.

## Scrollable Panel Case (T1 ivan-batch-1, SettingsPanel)

A scrollable list inside a UI panel naturally wants `setMask(geometryMask)`
on a scroll container so rows beyond the viewport get clipped. This works
when the scroll container is a top-level scene child but **breaks when the
scroll container is added as a child of the UI Container** (the panel).

### Failure mode

```typescript
// WRONG — scrollContainer becomes a Container-child via this.add(...)
class SettingsPanel extends Phaser.GameObjects.Container {
  constructor(scene) {
    super(scene, ...);
    this.scrollContainer = scene.add.container(0, 0);
    this.scrollContainer.setMask(maskGfx.createGeometryMask());
    this.add(this.scrollContainer);                        // ← BREAKS THE MASK
  }
}
```

The mask renders fine in the editor and on Chrome desktop, but on iOS /
Telegram WebView the mask drifts: rows can render past the bottom edge or
disappear entirely. Same root cause as the Meter case — Containers and
geometry masks don't compose.

### Solution: keep the scroll container at scene-level

Don't add the scroll container to `this`. Keep it as a top-level scene
child and store a private reference for explicit cleanup in `close()`:

```typescript
class SettingsPanel extends Phaser.GameObjects.Container {
  private scrollContainer: Phaser.GameObjects.Container;
  private scrollMaskGfx: Phaser.GameObjects.Graphics;

  constructor(scene) {
    super(scene, ...);
    // scrollContainer + mask graphic both live on scene, NOT on `this`.
    this.scrollContainer = scene.add.container(0, 0);
    this.scrollMaskGfx = scene.add.graphics();
    this.scrollMaskGfx.fillRect(scrollX, scrollY, scrollW, scrollH);
    this.scrollContainer.setMask(this.scrollMaskGfx.createGeometryMask());
    // ❌ NO this.add(this.scrollContainer);
  }

  close(): void {
    // Explicit destruction since the children aren't auto-cleaned by `this`.
    this.scrollContainer.destroy();
    this.scrollMaskGfx.destroy();
    this.destroy();
  }
}
```

### Z-order: separate depth bands for chrome vs scroll content

When the panel becomes scene-level (not Container-child), its z-order is no
longer derived from the parent Container's depth — each piece needs its
own explicit `setDepth`. SettingsPanel uses four discrete bands so the
panel rectangle never accidentally covers the scroll content (a regression
caught in T1 review):

```typescript
const DEPTH_OVERLAY        = 99;   // full-screen darken (scene-level)
const DEPTH_PANEL_BG       = 100;  // panel rect       (scene-level)
const DEPTH_SCROLL_CONTENT = 101;  // scroll rows      (scene-level + mask)
const DEPTH_PANEL_CHROME   = 102;  // title/close/scrollbar/apply (in `this`)
```

The chrome (title, close button, scrollbar handle, apply button) STAYS
inside the panel Container because none of those are masked. Only the
scrollable rows live outside.

### Drag-vs-tap discrimination on touch surfaces

A 5 px drag threshold prevents `+` / `−` button taps from priming a
parasitic scroll on touch devices. Without it, the pointermove fires
between pointerdown and pointerup of a tap, the scroll container thinks
it's mid-drag, and the next pointerdown anywhere on the panel is consumed
as scroll completion instead of the intended button click. See
`SettingsPanel.ts` after T1 fix; logic-reviewer F3.

### Reference

- Implementation: `src/ui/SettingsPanel.ts` after commits `06066d3`, `fa02077`, `c9aea12`.
- DECISIONS: feature-ivan-batch-1 R-T1-2.
