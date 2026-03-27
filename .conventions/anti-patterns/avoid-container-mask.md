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

// CORRECT — use per-corner radius instead of masks
private fillRadius(width: number): number | RoundedRectRadius {
  if (width >= this.widthPx - 0.5) return this.radius;
  return { tl: this.radius, tr: 0, bl: this.radius, br: 0 };
}
this.fillGfx.fillRoundedRect(0, 0, fillWidth, height, this.fillRadius(fillWidth));
```

## The Solution: Per-Corner Radius

Instead of geometry masks, use `fillRoundedRect` with per-corner radius objects:
- `{ tl: r, tr: 0, bl: r, br: 0 }` for left-rounded, right-straight fills
- Uniform `r` when fill spans full width (all corners match border)

This is implemented in both Meter.ts and LayeredMeter.ts via the `fillRadius()` helper method.

## When geometry masks ARE safe

Only on game objects that are NOT inside a Container — i.e., added directly to the scene. For UI components that extend Container, always use per-corner radius or other non-mask approaches.
