# Anti-Pattern: Container-Level Geometry Mask

Do not apply `setMask()` on a Container when the container has children positioned outside the mask bounds (e.g., label text above a bar, value text centered inside).

## Why

A geometry mask on a Container clips ALL children — including text labels at y=-18 (above the bar) and centered value text. This causes text to be invisible or partially cut off.

## Examples

```typescript
// WRONG — clips ALL children including text labels
const maskGfx = scene.add.graphics();
maskGfx.fillRoundedRect(0, 0, width, height, radius);
maskGfx.setVisible(false);
this.setMask(maskGfx.createGeometryMask()); // Container-level mask

// CORRECT — mask only the graphics layers that need clipping
const barMask = maskGfx.createGeometryMask();
this.fillGfx.setMask(barMask);
this.deltaGfx.setMask(barMask);
this.highlightGfx.setMask(barMask);
this.flashGfx.setMask(barMask);
// Text children are NOT masked — they render freely
```

## When to use Container-level mask

Only when ALL children should be clipped to the same bounds (e.g., a scrollable panel where everything must stay within the panel rect). For bar components with labels, always use per-child masking.

## Session finding

During this session, Meter.ts was initially implemented with container-level mask which would have clipped the title label at y=-18 and the "150/200" value text. Fixed by applying mask to individual Graphics children only.
