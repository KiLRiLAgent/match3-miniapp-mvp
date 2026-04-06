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
