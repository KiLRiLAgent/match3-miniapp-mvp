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
 *    - Fill, delta, highlight, flash use per-corner radius:
 *      - Full width: uniform radius (all corners match border)
 *      - Partial width: left corners rounded, right corners straight
 *    - Extract into a fillRadius() helper method:
 *
 *      private fillRadius(width: number): number | RoundedRectRadius {
 *        if (width >= this.widthPx - 0.5) return this.radius;
 *        return { tl: this.radius, tr: 0, bl: this.radius, br: 0 };
 *      }
 *
 *    - The -0.5 threshold handles float precision at 100% fill
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
