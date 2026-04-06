/**
 * GOLD STANDARD: UI Component Patterns
 *
 * All UI components in this project follow these conventions:
 *
 * 1. CONTAINER-BASED
 *    - All UI components extend Phaser.GameObjects.Container
 *    - Children are created via scene.add.* (project-wide pattern)
 *    - Call this.add([...children]) then scene.add.existing(this)
 *
 *      export class Meter extends Phaser.GameObjects.Container {
 *        constructor(scene: Phaser.Scene, x: number, y: number, ...) {
 *          super(scene, x, y);
 *          const children: Phaser.GameObjects.GameObject[] = [];
 *          // ... create children via scene.add.*
 *          children.push(borderGfx);
 *          this.add(children);
 *          scene.add.existing(this);
 *        }
 *      }
 *
 * 2. GRAPHICS-BASED RENDERING
 *    - Bars and shapes use Phaser.GameObjects.Graphics (not sprites)
 *    - Separate Graphics objects for separate z-layers:
 *      borderGfx -> deltaGfx -> fillGfx -> highlightGfx -> flashGfx
 *
 * 2a. PER-CORNER RADIUS FOR BAR FILLS
 *    - Background border uses fillRoundedRect with uniform radius
 *    - Fill, delta, highlight, flash use per-corner radius via the
 *      fillRadius() helper, which handles THREE cases:
 *
 *      1. Inside right curve zone (width >= widthPx - radius):
 *         → return uniform radius; caller draws full widthPx.
 *         Otherwise sharp tr/br corners poke into borderGfx's curve
 *         and produce visible square overhangs above/below the bar.
 *      2. Narrow fill (width < 2 * radius):
 *         → pill shape: all four corners = width/2.
 *         If tr/br were left at 0, the narrow remainder would show a
 *         visible vertical sharp line on the right. Clamping tl/bl
 *         alone is not enough — both sides must be rounded.
 *      3. Normal middle (2*r <= width < widthPx - r):
 *         → { tl: r, tr: 0, bl: r, br: 0 } (left rounded, right straight).
 *
 *      private fillRadius(width: number): number | RoundedRectRadius {
 *        const r = this.radius;
 *        if (width >= this.widthPx - r) return r;       // snap in curve zone
 *        if (width < 2 * r) {                            // narrow → pill shape
 *          const eff = width / 2;
 *          return { tl: eff, tr: eff, bl: eff, br: eff };
 *        }
 *        return { tl: r, tr: 0, bl: r, br: 0 };          // middle
 *      }
 *
 *    - Caller snaps drawW when helper returned a number:
 *
 *        const fr = this.fillRadius(fillWidth);
 *        const drawW = typeof fr === "number" ? this.widthPx : fillWidth;
 *        this.fillGfx.fillRoundedRect(0, 0, drawW, this.heightPx, fr);
 *
 *    - WHY `widthPx - radius` threshold (NOT `widthPx - 0.5`):
 *      - The naive `widthPx - 0.5` only catches float-precision at 100%.
 *        For widths in [widthPx - r, widthPx), the right edge still sits
 *        inside the border's curve zone, which is what produces the
 *        "corner sticking out above the bar" artifact at ~95% HP.
 *      - Tradeoff: HP between ~95-100% of a layer visually shows as full.
 *        Acceptable because the exact value is in the centered text label.
 *
 *    - Applied in both Meter.ts and LayeredMeter.ts
 *    - ANTI-PATTERN: Do NOT use geometry masks for bar clipping —
 *      masks don't work inside Containers (see anti-pattern doc)
 *
 * 3. CONSTRUCTOR OPTIONS PATTERN
 *    - Required params first, optional config object last
 *    - Interface for options with all fields optional + defaults
 *
 *      export interface MeterOptions {
 *        trailingDelta?: boolean;  // default: false
 *        alwaysGreen?: boolean;    // default: false
 *        iconKey?: string;
 *      }
 *
 *      constructor(scene, x, y, width, height, label, color, isHp = false, options?: MeterOptions)
 *
 * 4. BAR EDGE HANDLING (per-corner radius, NOT geometry masks)
 *    - Use fillRoundedRect with per-corner radius for all fills:
 *      - Full bar: uniform radius (matches border)
 *      - Partial fill: { tl: radius, tr: 0, bl: radius, br: 0 }
 *    - This gives straight right edges without needing geometry masks
 *    - IMPORTANT: Geometry masks do NOT work inside Containers in Phaser
 *      (see anti-pattern: avoid-container-mask.md)
 *    - fillRadius() helper centralizes the logic (see section 2a above)
 *
 * 5. TRAILING DELTA PATTERN
 *    - Show "lost" amount as white rectangle between old and new fill
 *    - Accumulate on repeated decreases
 *    - Drain via step-based tween to avoid stale-closure bugs:
 *
 *      let prevT = 1;
 *      onUpdate: (tween) => {
 *        const t = tween.getValue() ?? 0;
 *        const step = (prevT - t) * startWidth;
 *        this.deltaWidth = Math.max(0, this.deltaWidth - step);
 *        prevT = t;
 *      }
 *
 *    - Clamp delta to bar bounds to prevent overflow
 *
 * 6. FLASH EFFECT PATTERN
 *    - White overlay, tween alpha 0 -> peak -> 0 with yoyo
 *    - Guard flag prevents overlapping flashes
 *    - Redraw flash shape at current fill width before each flash
 *
 * 7. ICON-NEXT-TO-TEXT PATTERN (SkillButton mana cost)
 *    - When replacing text labels with sprite icons, reposition the icon
 *      after every setText() call since text width changes
 *    - Extract icon size as a module-level constant
 *    - Use a repositionX() helper method called after every setText:
 *
 *      const MANA_ICON_SIZE = 14;
 *
 *      private repositionManaIcon() {
 *        this.manaIcon.setX(this.costText.x + this.costText.width / 2 + MANA_ICON_SIZE / 2 + 2);
 *      }
 *
 *    - Sync icon alpha in ALL state branches (locked, cooldown, normal)
 *    - Use ASSET_KEYS for texture key, never hardcode strings
 *
 * 8. NAMING
 *    - Public methods: camelCase (setValue, flash, drainDelta)
 *    - Private methods: camelCase with draw* prefix for rendering (drawFill, drawDelta)
 *    - Timing constants: UPPER_SNAKE at module level (FLASH_DURATION)
 */
