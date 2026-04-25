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
 *      borderGfx -> deltaGfx -> fillGfx -> previewGfx -> highlightGfx -> flashGfx
 *    - LayeredMeter adds nextFillGfx before deltaGfx:
 *      nextFillGfx -> deltaGfx -> fillGfx -> previewGfx -> highlightGfx -> flashGfx
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
 *
 *    Two variants depending on whether the badge needs to track text width.
 *
 *    7a. FIXED-POSITION BADGE ON ICON BORDER (current default)
 *
 *      When the badge sits on the circle edge of a fixed-size icon (e.g.,
 *      SkillButton's mana cost + SkillApplyOverlay's cost), place it at a
 *      formula-driven diagonal from the icon centre. The cost number is
 *      centred on the badge (`origin(0.5, 0.5)`), so digit-count changes
 *      (30 → 100) don't require repositioning.
 *
 *        // Module-level constants — match across all icon-on-circle
 *        // components so the visual geometry stays consistent.
 *        const BADGE_BORDER_COS45 = 0.72;  // ≈ cos(45°), badge centre on circle border
 *        const BADGE_SIZE_FACTOR  = 0.36;
 *        const BADGE_FONT_FACTOR  = 0.17;
 *        const BADGE_FONT_MIN_PX  = 10;
 *        const BADGE_SIZE_MIN_PX  = 18;
 *
 *        // In the component constructor (iconRadius = size / 2):
 *        const badgeOffset   = Math.round(iconRadius * BADGE_BORDER_COS45);
 *        const badgeSize     = Math.max(BADGE_SIZE_MIN_PX, Math.round(size * BADGE_SIZE_FACTOR));
 *        const badgeFontSize = Math.max(BADGE_FONT_MIN_PX, Math.round(size * BADGE_FONT_FACTOR));
 *        this.manaIcon = scene.add.image(-badgeOffset, -badgeOffset, ASSET_KEYS.tiles[TileKind.Mana])
 *          .setDisplaySize(badgeSize, badgeSize).setOrigin(0.5);
 *        this.costText = scene.add.text(-badgeOffset, -badgeOffset, `${cost}`, { ... })
 *          .setOrigin(0.5);
 *
 *      NO repositionX() helper needed — the badge position is invariant
 *      under `setText()`. References: `src/ui/SkillButton.ts` (dynamic
 *      `size` from UI_LAYOUT.skillButtonSize, so offsets scale per device),
 *      `src/ui/SkillApplyOverlay.ts` (fixed `ICON_SIZE = 56`, so
 *      `BADGE_OFFSET = Math.round((ICON_SIZE / 2) * 0.72)` is computed
 *      once as a module constant).
 *
 *      ANTI-PATTERN: do not hardcode `BADGE_OFFSET = 23` on dynamic-size
 *      components — the button circle ranges ~56–78 px across devices and
 *      a constant 23 drifts off the border. Always derive from the
 *      current icon radius.
 *
 *    7b. TEXT-WIDTH-DEPENDENT ICON (legacy, keep when needed)
 *
 *      When the icon MUST sit immediately adjacent to the cost number
 *      (e.g., an inline "50 💧" label where the drop trails the number),
 *      reposition after every setText() since text width changes:
 *
 *        const MANA_ICON_SIZE = 14;
 *        private repositionManaIcon() {
 *          this.manaIcon.setX(this.costText.x + this.costText.width / 2 + MANA_ICON_SIZE / 2 + 2);
 *        }
 *
 *      Call `repositionManaIcon()` after every `setText`. This pattern
 *      is appropriate ONLY when text width drives layout; for the
 *      fixed-position case (7a), leaving a no-op `repositionManaIcon()`
 *      is misleading dead code — prefer deleting it.
 *
 *    Common to both variants:
 *    - Sync icon alpha in ALL state branches (locked, cooldown, normal)
 *    - Use ASSET_KEYS for texture key, never hardcode strings
 *    - Module-level constants UPPER_SNAKE_CASE (see naming.md)
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
 *     the panel is open. Phaser's input system already routes events correctly
 *     when you stack interactive objects with topOnly = true (default).
 *
 *     STOP-PROPAGATION IS REQUIRED FOR CLOSE-PATH HANDLERS (Phase 2B update):
 *     close-path handlers (backdrop pointerdown, close button pointerdown)
 *     MUST call `event.stopPropagation()` to halt the cascade before scene-
 *     level POINTER_DOWN fires. Phaser's event hierarchy is GAMEOBJECT_POINTER_
 *     DOWN → GAMEOBJECT_DOWN → POINTER_DOWN, and scene `this.input.on(
 *     "pointerdown", ...)` subscribes to POINTER_DOWN (step 3). By the time
 *     step 3 fires, the modal's GO handler has already run `close()` and
 *     `isOpen() = false` — so any "bail if modal open" scene guard does NOT
 *     trigger for the same event that closed the modal. Without
 *     stopPropagation, backdrop tap can prime background scene drag-scroll
 *     state. See `.conventions/gold-standards/item-card-modal.ts` §7 for the
 *     full rationale + consumer-side `dragStartRecorded` guard pattern. Panel
 *     pointerdown (the no-op absorber) should ALSO stopPropagation for
 *     consistency, though its no-op close makes it safe.
 *
 *     Reference implementations:
 *     - `src/v2/scenes/CharacterGalleryScene.ts` → openModal() — legacy v2
 *       reference (depth 1000, to be aligned to 2100 in Phase 2B per R2B-2 #4)
 *     - `src/v2/ui/ItemCardModal.ts` — Phase 2B canonical reusable modal
 *       (depth 2100, stopPropagation close-path, robust isOpen, fault-tolerant
 *       close). See `./item-card-modal.ts` for the full gold standard.
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
 *
 * 14. METER DELTA PREVIEW API
 *
 *     Both `Meter` and `LayeredMeter` expose a `showPreview` /
 *     `clearPreview` API for rendering a pulsing delta overlay on the
 *     bar without changing its actual value. Used by confirmation
 *     overlays to visualize pending skill effects.
 *
 *     API:
 *       showPreview(current: number, max: number, delta: number): void
 *       clearPreview(): void
 *
 *     - Negative delta (damage/cost): white semi-transparent overlay
 *       drawn over the fill region that will be lost.
 *     - Positive delta (heal): green semi-transparent overlay extending
 *       beyond the current fill, showing HP that will be gained.
 *     - The preview layer (`previewGfx`) sits between `fillGfx` and
 *       `highlightGfx` in the z-order.
 *     - A pulse tween (alpha 0.5 -> 0.9, Sine.easeInOut, 600ms, infinite)
 *       draws attention to the preview. Stored in `previewPulseTween`.
 *     - `clearPreview()` stops the pulse tween, clears the graphics,
 *       and resets alpha to 1.
 *     - `showPreview` calls `clearPreview()` at entry for idempotency.
 *
 *     Tween cleanup: the pulse tween is stopped in BOTH `clearPreview()`
 *     AND `preDestroy()`. This belt-and-suspenders approach prevents
 *     tween leaks if the scene shuts down while a preview is active.
 *
 *     `preDestroy()` also stops all other tracked tweens in the Meter
 *     (dangerPulseTween, deltaDrainTween) — consolidating cleanup that
 *     was previously only in individual stop methods.
 *
 *     LayeredMeter-specific: `showPreview` converts absolute HP values
 *     to within-layer ratios using `cumulativeHp` thresholds. If the
 *     delta crosses a layer boundary, the preview is clamped to the
 *     current layer — an intentional simplification since the text label
 *     shows the exact value.
 *
 *     Example (GameScene openSkillHighlights):
 *       // Damage skill -> white preview on boss HP bar
 *       bossHpBar.showPreview(bossHp, bossHpMax, -cfg.damage);
 *       // Heal skill -> green preview on player HP bar
 *       playerHpBar.showPreview(playerHp, playerHpMax, cfg.heal);
 *       // Mana cost -> white preview on mana bar
 *       manaBar.showPreview(mana, manaMax, -cfg.cost);
 *
 *     Example (GameScene closeSkillHighlights):
 *       playerHpBar?.clearPreview();
 *       bossHpBar?.clearPreview();
 *       manaBar?.clearPreview();
 *
 *     Reference: src/ui/Meter.ts, src/ui/LayeredMeter.ts
 *     Cross-ref: ./confirmation-overlay.ts section 9 (wiring pattern)
 *
 * 15. SCROLLABLE PANEL WITHOUT GEOMETRY MASK IN CONTAINER
 *
 *     Authoritative reference: `src/ui/SettingsPanel.ts` after T1
 *     ivan-batch-1 (commits `06066d3`, `fa02077`, `c9aea12`).
 *
 *     A UI panel that holds a scrollable list (param rows, item rows,
 *     gallery cards, etc) naturally wants `setMask(geometryMask)` on a
 *     scroll container so off-viewport children clip. This works ONLY
 *     when the scroll container is a TOP-LEVEL scene child — `setMask`
 *     fails silently on iOS / Telegram WebView when the masked object is
 *     a Phaser.GameObjects.Container child of another Container. Same
 *     root cause as the Meter/LayeredMeter case
 *     (.conventions/anti-patterns/avoid-container-mask.md): Phaser
 *     Containers and geometry masks don't compose.
 *
 *     The panel itself can still extend Container — only the
 *     scroll-content + mask graphic move out:
 *
 *       class SettingsPanel extends Phaser.GameObjects.Container {
 *         private scrollContainer: Phaser.GameObjects.Container;
 *         private scrollMaskGfx: Phaser.GameObjects.Graphics;
 *         private overlayRect: Phaser.GameObjects.Rectangle;
 *         private panelBgRect: Phaser.GameObjects.Rectangle;
 *
 *         constructor(scene: Phaser.Scene) {
 *           super(scene, ...);
 *
 *           // Scene-level (NOT this.add'd) so the mask works.
 *           this.overlayRect = scene.add.rectangle(...).setDepth(DEPTH_OVERLAY);
 *           this.panelBgRect = scene.add.rectangle(...).setDepth(DEPTH_PANEL_BG);
 *           this.scrollContainer = scene.add.container(0, 0)
 *             .setDepth(DEPTH_SCROLL_CONTENT);
 *           this.scrollMaskGfx = scene.add.graphics();
 *           this.scrollMaskGfx.fillRect(scrollX, scrollY, scrollW, scrollH);
 *           this.scrollContainer.setMask(this.scrollMaskGfx.createGeometryMask());
 *
 *           // Chrome (title, close button, scrollbar handle, apply
 *           // button) STAYS as Container children — none of them are
 *           // masked, and chrome moves with the panel as a unit.
 *           this.add([titleText, closeBtn, scrollbar, applyBtn]);
 *           this.setDepth(DEPTH_PANEL_CHROME);
 *         }
 *
 *         close(): void {
 *           // Manual destroy — scene-level children are NOT auto-cleaned
 *           // when `this` is destroyed.
 *           this.overlayRect.destroy();
 *           this.panelBgRect.destroy();
 *           this.scrollContainer.destroy();
 *           this.scrollMaskGfx.destroy();
 *           this.destroy();
 *         }
 *       }
 *
 *     Four-band depth layout. When chrome lives inside `this` and other
 *     pieces live on the scene, you must pick depths explicitly so the
 *     panel rect doesn't render over the scroll content (a real
 *     regression caught in T1 review):
 *
 *       const DEPTH_OVERLAY        = 99;   // full-screen darken
 *       const DEPTH_PANEL_BG       = 100;  // panel rect
 *       const DEPTH_SCROLL_CONTENT = 101;  // rows + their mask
 *       const DEPTH_PANEL_CHROME   = 102;  // title/close/scrollbar/apply
 *
 *     Drag-vs-tap discrimination on touch surfaces. A 5 px movement
 *     threshold prevents `+` / `−` button taps from priming a parasitic
 *     scroll. Without it, the brief pointermove between pointerdown and
 *     pointerup of a tap is misread as the start of a drag, the next
 *     pointerdown is consumed as scroll completion, and the button click
 *     never fires:
 *
 *       const DRAG_THRESHOLD_PX = 5;
 *       let dragStartedAt: number | null = null;
 *       let isDragging = false;
 *
 *       scene.input.on("pointerdown", (p) => { dragStartedAt = p.y; });
 *       scene.input.on("pointermove", (p) => {
 *         if (dragStartedAt === null) return;
 *         if (Math.abs(p.y - dragStartedAt) > DRAG_THRESHOLD_PX) {
 *           isDragging = true;
 *         }
 *         if (isDragging) { /* shift scrollContainer.y */ }
 *       });
 *       scene.input.on("pointerup", () => {
 *         dragStartedAt = null;
 *         isDragging = false;
 *       });
 *
 *     Cross-references:
 *     - .conventions/anti-patterns/avoid-container-mask.md "Scrollable
 *       Panel Case" — failure-mode walkthrough.
 *     - feature-ivan-batch-1 DECISIONS R-T1-2.
 *     - logic-reviewer F3 (drag threshold rationale).
 */
