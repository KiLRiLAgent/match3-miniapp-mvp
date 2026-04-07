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
 *
 * 9. v2 CONTAINER CHILDREN: `new Phaser.GameObjects.X(scene, ...)` pattern
 *
 *    Phase 1A introduced 3 new Container components in `src/v2/ui/`
 *    (DialogueChoiceButton, CharacterPortrait, RelationshipMeter). They use a
 *    slightly different children-creation pattern than v1 Container components:
 *
 *      // v1 pattern (Meter.ts) — children created via scene.add.*
 *      const borderGfx = scene.add.graphics();  // creates AND auto-adds to scene
 *      children.push(borderGfx);
 *      this.add(children);
 *      scene.add.existing(this);
 *
 *      // v2 pattern (DialogueChoiceButton.ts, CharacterPortrait.ts, etc.)
 *      const bg = new Phaser.GameObjects.Rectangle(scene, 0, 0, w, h, color);  // does NOT auto-add
 *      const label = new Phaser.GameObjects.Text(scene, 0, 0, text, style);
 *      this.add([bg, label]);
 *      scene.add.existing(this);
 *
 *    Both patterns produce equivalent runtime behavior, but the v2 pattern is
 *    cleaner because:
 *    - Children are owned exclusively by the Container (not orphan scene-level objects)
 *    - `scene.add.existing(this)` is the SOLE registration point — easier to grep
 *    - Avoids the temporary "child added to scene then re-parented to container" race
 *
 *    `scene.add.existing(this)` is still REQUIRED — that's the canonical Container
 *    self-registration call. The grep guideline "no scene.add.X children" applies
 *    only to children, not to the Container's own registration.
 *
 *    Choose pattern based on which surrounding code uses. New v2 components in
 *    `src/v2/ui/` use the v2 pattern. New v1 components extending existing v1 UI
 *    use the v1 pattern. Don't mix within a single file.
 *
 * 10. INTERACTIVE CONTAINER with explicit hitArea
 *
 *     `Phaser.GameObjects.Container` does NOT support `setInteractive()` without
 *     an explicit hitArea — Phaser cannot infer bounds from the children. Always
 *     pass a Rectangle hitArea + the Contains hit-test:
 *
 *       this.setSize(opts.width, opts.height);
 *       this.setInteractive(
 *         new Phaser.Geom.Rectangle(-opts.width / 2, -opts.height / 2, opts.width, opts.height),
 *         Phaser.Geom.Rectangle.Contains,
 *       );
 *       this.on("pointerover", () => bg.setFillStyle(BTN_BG_HOVER));
 *       this.on("pointerout", () => bg.setFillStyle(BTN_BG));
 *       this.on("pointerup", () => opts.onClick());
 *
 *     The hitArea origin assumes Container origin is `(0, 0)` (Phaser default for
 *     Container). The negative offsets (`-w/2, -h/2`) center the rectangle on the
 *     Container's origin. Without `setSize`, pointer events won't propagate.
 *
 *     Example: src/v2/ui/DialogueChoiceButton.ts
 *
 * 11. NEUTRAL-LOCATION MANAGER CLASSES (NOT Container)
 *
 *     For board-overlay state managers like ChainOverlay (which renders v2 chain
 *     state on top of the v1 Match3 board), DO NOT extend Container. Use a plain
 *     manager class that holds scene-direct game objects:
 *
 *       export class ChainOverlay {
 *         constructor(
 *           scene: Phaser.Scene,
 *           boardOriginX: number,
 *           boardOriginY: number,
 *           cellSize: number,
 *         ) { ... }
 *         setChains(chains: Chain[]): void
 *         async animateDamage(damaged: Chain[]): Promise<void>
 *         async animateBroken(broken: Chain[]): Promise<void>
 *         clear(): void
 *         destroy(): void
 *       }
 *
 *     Why a manager class instead of Container:
 *     - GameScene needs to instantiate it via `new ChainOverlay(...)` synchronously
 *       in `create()` — Container subscriptions and event-bus complications avoided
 *     - The class lives in a NEUTRAL location (`src/ui/`, NOT `src/v2/ui/`) so v1
 *       can runtime-import it without crossing the v1↔v2 boundary
 *     - Animation methods use parallel batched tweens (Pattern A — single
 *       `tweenPromise` with `targets: array`) to keep wall-clock O(1) regardless of
 *       chain count (MITIGATION-5 / CRIT-1..6)
 *     - `.active` guards on every sprite operation make animateDamage / animateBroken
 *       idempotent (ADD-2)
 *
 *     Example: src/ui/ChainOverlay.ts (Phase 1A Task #8)
 *     See REFINEMENT 3 in `.claude/teams/feature-v2-lilana/DECISIONS.md` for the
 *     "neutral location, no v2 boundary cross" rationale.
 *
 * 12. MODAL OVERLAY: backdrop closes, panel absorbs (RISK-6)
 *
 *     The canonical pattern for tappable modal overlays in v2 scenes uses TWO
 *     separate interactive objects: a fullscreen backdrop that closes the modal
 *     on `pointerdown`, and a panel above it that registers an empty `pointerdown`
 *     handler so taps on the panel are absorbed instead of bubbling through.
 *
 *     Phaser delivers each pointer event to the topmost interactive object at
 *     the pointer position. By making the panel interactive (even with a no-op
 *     handler), pointerdowns landing inside the panel rect never reach the
 *     backdrop's close handler. Pointerdowns outside the panel hit the backdrop
 *     and close the modal as expected.
 *
 *       // Backdrop — full screen, closes modal on tap
 *       const backdrop = this.add
 *         .rectangle(0, 0, camW, camH, MODAL_BG_COLOR, MODAL_BG_ALPHA)
 *         .setOrigin(0)
 *         .setInteractive({ useHandCursor: false });
 *       backdrop.on("pointerdown", () => this.closeModal());
 *       layer.add(backdrop);
 *
 *       // Panel — drawn ABOVE the backdrop, absorbs pointerdown so it does
 *       // NOT bubble down to the backdrop close handler.
 *       const panel = this.add
 *         .rectangle(cx, cy, panelWidth, panelHeight, MODAL_PANEL_COLOR, MODAL_PANEL_ALPHA)
 *         .setStrokeStyle(MODAL_PANEL_STROKE_WIDTH * d, MODAL_PANEL_STROKE)
 *         .setInteractive({ useHandCursor: false });
 *       panel.on("pointerdown", () => {}); // intentional no-op — absorbs
 *       layer.add(panel);
 *
 *     The close button (or any other interactive control inside the panel) is
 *     just another interactive object stacked above the panel. Order is:
 *     backdrop → panel → content → close button. All four sit inside one
 *     `modalLayer` Container so `closeModal()` is a single `destroy()` call.
 *
 *     ANTI-PATTERN: do NOT try to use `setActive(false)` on the backdrop while
 *     the panel is open, or stop event propagation manually. Phaser's input
 *     system already does the right thing if you stack interactive objects.
 *
 *     Example: src/v2/scenes/CharacterGalleryScene.ts → openModal()
 *
 * 13. RE-RENDER VIA TEAR-DOWN CONTAINER (Phase 1B default)
 *
 *     For v2 scenes that need to re-render after a state mutation (equip an
 *     item, level up, change a flag), the simple-default pattern is to keep
 *     a single managed `rootLayer` Container and rebuild it from scratch on
 *     each refresh. The immutable background + title are drawn ONCE in
 *     `create()`; everything that depends on save state lives inside the
 *     teardown layer.
 *
 *       private rootLayer?: Phaser.GameObjects.Container;
 *
 *       create() {
 *         // Immutable scaffolding — background, title, back button
 *         this.add.rectangle(0, 0, camW, camH, BG_COLOR).setOrigin(0);
 *         this.add.text(cx, titleY, "Статистика", titleStyle).setOrigin(0.5);
 *         this.createBackButton(cx, backY, () => sceneRouter.pop(this));
 *         this.refresh();
 *       }
 *
 *       private refresh(): void {
 *         if (this.rootLayer) {
 *           this.rootLayer.destroy();
 *           this.rootLayer = undefined;
 *         }
 *         const layer = this.add.container(0, 0);
 *         this.rootLayer = layer;
 *         // Re-render every state-driven section into `layer`
 *         this.renderAvatarAndLevel(layer, ...);
 *         this.renderXpBar(layer, ...);
 *         // ...
 *       }
 *
 *     When to use it:
 *     - Mutations are infrequent (taps on equipment slots, post-combat refresh)
 *     - Per-mutation diff would be more complex than a full rebuild
 *     - The scene has a clear "data → UI" projection with no animation state
 *       that must survive the rebuild
 *
 *     When NOT to use it:
 *     - Continuous animations (use targeted setValue/setText updates)
 *     - 60fps re-renders (too much GC pressure)
 *     - Scenes with persistent UI state (drag offsets, scroll position)
 *
 *     Example: src/v2/scenes/PlayerStatsScene.ts → refresh()
 */
