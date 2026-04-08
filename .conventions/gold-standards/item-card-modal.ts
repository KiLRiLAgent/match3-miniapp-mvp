/**
 * GOLD STANDARD: ItemCardModal — reusable blocking modal component (v2)
 *
 * Phase 2B introduced the first reusable modal component in `src/v2/ui/`. Any
 * future scene that needs a blocking detail overlay (item cards, character
 * cards, loot preview, confirmation dialogs) MUST follow this pattern — do NOT
 * build a second modal from scratch, do NOT inline modal scaffolding per scene.
 *
 * Authoritative source: `src/v2/ui/ItemCardModal.ts` + `src/v2/ui/itemFormat.ts`
 * + DECISIONS R2B-1 (helper+component split) + R2B-3 (depth convention).
 *
 * Consumes Gold Standard §12 (Modal Overlay: backdrop closes, panel absorbs)
 * from `./ui-component.ts`. ItemCardModal is the canonical reference impl of
 * §12 for v2 — CharacterGalleryScene.openModal is the legacy v2 reference
 * (depth 1000 — to be migrated to 2100 in Phase 2B per R2B-2 #4).
 *
 * 1. SHAPE: singleton manager, no constructor
 *
 *    Export a single instance named `itemCardModal`. Callers import and call
 *    `itemCardModal.open(scene, opts)`. Mirrors the `toast` singleton pattern.
 *    Only ONE modal is visible at a time per the singleton contract — opening
 *    a new modal closes any prior one first (idempotent re-open).
 *
 *      // src/v2/ui/ItemCardModal.ts — end of file
 *      export class ItemCardModal { ... }
 *      export const itemCardModal = new ItemCardModal();
 *
 * 2. DEPTH: reserved layer 2100 (above Toast 2000)
 *
 *    Blocking modals reserve depth 2100+. Toast (2000) renders UNDERNEATH
 *    blocking modals per the R2B-3 convention — if a Toast fires while the
 *    modal is open, the user reads it after closing the modal. See CLAUDE.md
 *    depth map + `src/v2/ui/Toast.ts` docstring + DECISIONS R2B-3.
 *
 *    Legacy: CharacterGalleryScene.openModal uses depth 1000 and will be
 *    aligned to 2100 in the Phase 2B dedup sprint (R2B-2 #4).
 *
 * 3. STATE MINIMIZATION: layer is single source of truth
 *
 *    Do NOT store a separate `scene` reference as a field. The layer's
 *    implicit Phaser binding (`layer.scene`) is the single source of truth,
 *    checked by `isOpen()`. Keeping fewer fields makes the close/isOpen state
 *    machine simpler and avoids a stale-reference race during scene shutdown.
 *
 *      private layer?: Phaser.GameObjects.Container;
 *      private onCloseCb?: () => void;
 *      // NO `private scene?: Phaser.Scene` — derived from layer.scene
 *
 * 4. ROBUST isOpen(): defensive scene + active checks
 *
 *    The singleton persists across scene transitions. A previous scene's
 *    shutdown may have destroyed the layer asynchronously while the singleton
 *    still holds a reference. `isOpen()` must detect this and silently clean
 *    up the dangling reference — callers should never see a "half-open" state.
 *
 *      isOpen(): boolean {
 *        if (!this.layer) return false;
 *        if (!this.layer.scene || !this.layer.active) {
 *          this.layer = undefined;
 *          this.onCloseCb = undefined;
 *          return false;
 *        }
 *        return true;
 *      }
 *
 * 5. FAULT-TOLERANT close(): snapshot → destroy → clear → invoke
 *
 *    The close() teardown must survive bad consumer callbacks AND already-dead
 *    layers. Mirrors SaveManager's fault-tolerant effect chain pattern. Order:
 *      1. Snapshot `onCloseCb` locally BEFORE clearing — the callback cannot
 *         observe a half-torn-down instance
 *      2. Destroy the layer in try/catch (may already be dead if Phaser
 *         shutdown ran first)
 *      3. Clear all fields (layer, onCloseCb)
 *      4. Invoke the snapshotted callback in a try/catch — a throw logs and
 *         does NOT leak modal state for the next open()
 *
 *      close(): void {
 *        if (!this.isOpen()) return;
 *        const cb = this.onCloseCb;
 *        try { this.layer?.destroy(true); } catch { ...already dead... }
 *        this.layer = undefined;
 *        this.onCloseCb = undefined;
 *        try { cb?.(); } catch (e) { console.warn("[ItemCardModal] onClose callback threw", e); }
 *      }
 *
 *    NOTE: onCloseCb is NOT guaranteed to fire if the host scene destroys the
 *    layer before an explicit close() call. The defensive `isOpen()` cleanup
 *    may short-circuit and bypass the callback. Consumers that need strong
 *    "always fires" semantics should not rely on onClose for teardown-critical
 *    work — use scene SHUTDOWN handlers directly.
 *
 * 6. BELT-AND-SUSPENDERS SHUTDOWN HANDLING
 *
 *    The modal installs its OWN one-shot SHUTDOWN handler in `open()` as a
 *    safety net against the host scene tearing down mid-modal. Callers should
 *    ALSO install a scene-level SHUTDOWN handler that calls `close()` when
 *    the modal is open — having both is correct layered defense. `.once()`
 *    semantics ensure whichever fires first auto-removes.
 *
 *      // Modal side (inside open(), after building layer)
 *      scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.close());
 *
 *      // Scene side (inside create())
 *      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
 *        if (itemCardModal.isOpen()) itemCardModal.close();
 *      });
 *
 * 7. EVENT PROPAGATION: stopPropagation in close-path handlers
 *
 *    Phaser's pointer event hierarchy is GAMEOBJECT_POINTER_DOWN → GAMEOBJECT_
 *    DOWN → POINTER_DOWN. Scene-level `this.input.on("pointerdown", ...)`
 *    subscribes to POINTER_DOWN (step 3) and fires AFTER modal-internal GO
 *    handlers. By the time scene handlers run, the modal has already closed
 *    (isOpen = false) — so any "bail if modal open" guards in scene handlers
 *    do NOT trigger for the same event that closed the modal.
 *
 *    Fix: modal-internal close-path handlers (backdrop, panel, close button)
 *    MUST call `event.stopPropagation()` so the cascade halts before
 *    POINTER_DOWN. The OPEN-path handler on consumer side (info icon in
 *    PlayerStatsScene) does NOT need stopPropagation — by the time POINTER_
 *    DOWN fires, `open()` has set layer and `isOpen() = true`, so EDIT 4
 *    scene bail triggers correctly.
 *
 *      // ItemCardModal.ts — backdrop/panel/close button handlers:
 *      backdrop.on("pointerdown", (_p, _x, _y, event) => {
 *        event.stopPropagation();
 *        this.close();
 *      });
 *
 *    Consumer-side scene handlers MUST also use a `dragStartRecorded` closure
 *    flag to guard POINTER_MOVE against gestures where POINTER_DOWN was
 *    halted by stopPropagation — see `src/v2/scenes/PlayerStatsScene.ts`
 *    `setupScroll()` for the canonical implementation.
 *
 * 8. COMPARISON DELTAS: opt-in `comparisonBase`
 *
 *    The modal supports optional comparison deltas for "would this item
 *    upgrade my current gear?" flows. Callers pass `comparisonBase` as the
 *    currently-equipped item in the same slot. The modal merges current +
 *    candidate via `buildUnifiedStatView(next, current?)` from `itemFormat.ts`
 *    and renders rows in STABLE STAT_ORDER regardless of which stats are
 *    kept/gained/lost. Green for positive delta, red for negative.
 *
 *    Contract: callers only pass `comparisonBase` when comparison is
 *    meaningful (e.g. backpack item vs currently-equipped item in same slot).
 *    Equipment rows viewing the already-equipped item pass NO comparisonBase
 *    (`undefined`) — the modal then renders a non-comparison stats list.
 *
 * 9. PURE HELPER + PHASER COMPONENT SPLIT (R2B-1)
 *
 *    itemFormat.ts is a PURE helper module with ZERO Phaser imports. It
 *    contains data transformations (buildStatsSummary, buildStatsRows,
 *    buildStatsDeltas, buildUnifiedStatView) that are reusable across scenes
 *    without pulling in the Phaser runtime. ItemCardModal.ts is the Phaser
 *    component that consumes the pure helpers.
 *
 *    Future dedup work should follow this split: if a helper is pure, it
 *    lives in `src/v2/ui/xyz.ts` with zero Phaser imports. If it's a
 *    component, it lives alongside in `src/v2/ui/Xyz.ts` and may consume the
 *    helper. Do NOT rename `src/v2/ui/` to `src/v2/ui-lib/` or split into
 *    subfolders — keep everything flat for discoverability. See R2B-1 for
 *    the rejected alternatives (systems/, content/, inline).
 *
 * 10. LAYOUT: text.height read-after-create, NOT 2-pass layout
 *
 *    Dynamic panel height is computed by rendering the description Text with
 *    wordWrap enabled, reading `.height` post-creation, and advancing the Y
 *    cursor. Do NOT build a 2-pass layout (render off-screen → measure →
 *    re-render at correct position). Matches the shipped convention in
 *    `src/v2/scenes/CharacterGalleryScene.ts` openModal() lines 498-510.
 *
 *      const descriptionText = mkText(cx, y, desc, { wordWrap: { width: ... } });
 *      y += descriptionText.height + DESCRIPTION_GAP * d;
 *
 * ─── References ────────────────────────────────────────────────────────────
 *
 * - `src/v2/ui/ItemCardModal.ts` — authoritative modal implementation
 * - `src/v2/ui/itemFormat.ts` — pure helper module (no Phaser imports)
 * - `src/v2/scenes/PlayerStatsScene.ts` — canonical consumer (renderEquipmentRow,
 *   renderBackpackRow, createInfoIcon, setupScroll with dragStartRecorded guard)
 * - `src/v2/scenes/CharacterGalleryScene.ts` — legacy modal reference (depth 1000,
 *   to be aligned to 2100 in Phase 2B per R2B-2 #4)
 * - `./ui-component.ts` §12 — underlying backdrop/panel absorb pattern
 * - `./toast-notifications.ts` — companion non-blocking notification singleton
 * - `.claude/teams/feature-item-info-display/DECISIONS.md` R2B-1, R2B-3 — rationale
 *
 * Minimal skeleton (abbreviated):
 *
 *   import Phaser from "phaser";
 *   import { DPR } from "../../game/config";
 *   import type { ItemDef } from "../content/types";
 *   import { buildUnifiedStatView, RARITY_COLOR_BY_TIER } from "./itemFormat";
 *
 *   const MODAL_DEPTH = 2100;
 *
 *   export interface ItemCardModalOptions {
 *     item: ItemDef;
 *     comparisonBase?: ItemDef;
 *     onClose?: () => void;
 *   }
 *
 *   export class ItemCardModal {
 *     private layer?: Phaser.GameObjects.Container;
 *     private onCloseCb?: () => void;
 *
 *     open(scene: Phaser.Scene, opts: ItemCardModalOptions): void {
 *       if (this.isOpen()) this.close();
 *       this.onCloseCb = opts.onClose;
 *
 *       const layer = scene.add.container(0, 0);
 *       layer.setDepth(MODAL_DEPTH);
 *
 *       // Backdrop — stopPropagation halts cascade to scene POINTER_DOWN
 *       const backdrop = scene.add
 *         .rectangle(0, 0, camW, camH, 0x000000, 0.78)
 *         .setOrigin(0)
 *         .setInteractive({ useHandCursor: false });
 *       backdrop.on("pointerdown", (_p, _x, _y, event) => {
 *         event.stopPropagation();
 *         this.close();
 *       });
 *       layer.add(backdrop);
 *
 *       // ... build content with mkText factory ...
 *
 *       // Panel absorbs taps inside its rect (gold standard §12)
 *       const panel = scene.add.rectangle(...).setInteractive(...);
 *       panel.on("pointerdown", (_p, _x, _y, event) => event.stopPropagation());
 *       layer.addAt(panel, 1);
 *
 *       // Close button — separate interactive, same stopPropagation pattern
 *       // ...
 *
 *       this.layer = layer;
 *
 *       // Modal-level SHUTDOWN safety net
 *       scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.close());
 *     }
 *
 *     close(): void {
 *       if (!this.isOpen()) return;
 *       const cb = this.onCloseCb;
 *       try { this.layer?.destroy(true); } catch { }
 *       this.layer = undefined;
 *       this.onCloseCb = undefined;
 *       try { cb?.(); } catch (e) { console.warn("[ItemCardModal] onClose threw", e); }
 *     }
 *
 *     isOpen(): boolean {
 *       if (!this.layer) return false;
 *       if (!this.layer.scene || !this.layer.active) {
 *         this.layer = undefined;
 *         this.onCloseCb = undefined;
 *         return false;
 *       }
 *       return true;
 *     }
 *   }
 *
 *   export const itemCardModal = new ItemCardModal();
 */
