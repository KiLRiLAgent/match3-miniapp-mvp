/**
 * GOLD STANDARD: Confirmation Overlay (tap → confirm → action)
 *
 * Inserts a blocking confirmation modal between a player tap on a primary
 * action button (e.g., a skill) and the actual execution of that action.
 * Reduces mis-tap regret on irreversible / costly actions, and gives the
 * scene a chance to highlight the *consequences* of the pending action
 * (drained HP/MP, damage preview, cooldown text, ...).
 *
 * Authoritative source: `src/ui/SkillApplyOverlay.ts` (v1, depth 1500).
 * Origin: Phase 2A+ skill-apply flow rework — tapping a skill no longer
 * fires it instantly; an overlay shows the cost + effect, player must
 * confirm. ItemCardModal (v2, depth 2100) follows a similar singleton
 * shape but is a pure detail viewer, NOT confirmation. Use this gold
 * standard for "tap → confirm → side-effect" flows specifically.
 *
 * Cross-refs:
 *  - `./ui-component.ts` §12 — modal overlay base pattern (backdrop
 *    closes, panel absorbs).
 *  - `./item-card-modal.ts` — pure detail modal singleton (no confirm).
 *  - CLAUDE.md depth map: 1500 reserved for v1 confirmation overlays.
 *
 * 1. SHAPE: per-instance Container, NOT a singleton
 *
 *    Unlike ItemCardModal (singleton, mirrors `toast`), confirmation
 *    overlays are constructed per-action by the caller and stored on a
 *    single scene field (`this.skillApplyOverlay?: SkillApplyOverlay`).
 *    Reason: the overlay's options bag captures the specific pending
 *    action's `onConfirm` / `onCancel` callbacks — singleton state would
 *    leak callbacks across distinct action attempts.
 *
 *      // GameScene: open
 *      if (this.skillApplyOverlay) return; // re-entrancy guard
 *      this.skillApplyOverlay = new SkillApplyOverlay(this, {
 *        skill, level,
 *        onConfirm: () => { this.skillApplyOverlay = undefined; ... },
 *        onCancel:  () => { this.skillApplyOverlay = undefined; ... },
 *      });
 *
 * 2. OPTIONS BAG: required action callbacks + optional scene hooks
 *
 *      export interface ConfirmationOverlayOptions {
 *        // Required — the action being confirmed
 *        onConfirm: () => void;
 *        onCancel:  () => void;
 *
 *        // Optional — scene-side highlights / dim other UI / preview
 *        onOpen?:  () => void;
 *        onClose?: () => void;
 *        // ... domain-specific data (skill, item, target, ...)
 *      }
 *
 *    `onOpen` fires AFTER `scene.add.existing(this)` so the scene can
 *    safely tween / dim / highlight elements without racing the overlay's
 *    own build. Wrap in try/catch — a buggy `onOpen` must not block
 *    the overlay from rendering:
 *
 *      try { opts.onOpen?.(); }
 *      catch (err) { console.error("...onOpen error:", err); }
 *
 *    `onClose` fires in BOTH confirm and cancel paths, AFTER the destroy
 *    chain begins but BEFORE the action's own callback. The scene MUST
 *    use this hook to undo highlights / kill tweens it started in `onOpen`
 *    — don't push that responsibility into `onConfirm`/`onCancel` since
 *    those are about the action, not the overlay state.
 *
 * 3. CLOSE-PATH ORDERING: onClose → action callback → destroy
 *
 *    `preDestroy()` (Phaser hook called from Container.destroy chain) runs
 *    in this order:
 *
 *      preDestroy() {
 *        if (this.closed) return;       // idempotency
 *        this.closed = true;
 *        // 1. Stop any infinite tweens this overlay started
 *        this.pulseTweens.forEach(t => t.stop());
 *        this.pulseTweens = [];
 *        // 2. Fire onClose FIRST so scene cleans highlights before
 *        //    its onConfirm/onCancel runs (those may themselves create
 *        //    new tweens that conflict with the highlight teardown)
 *        try { this.opts.onClose?.(); }
 *        catch (err) { console.error("...onClose error:", err); }
 *      }
 *
 *    The action callback (`onConfirm`/`onCancel`) is invoked from the
 *    button click handler BEFORE `destroy()` — so the actual order on a
 *    confirm tap is:
 *
 *      [tap apply] → onConfirm() → this.destroy() → preDestroy → onClose
 *
 *    For cancel paths (X button, backdrop tap) it is:
 *
 *      [tap close] → this.destroy() → preDestroy → onClose → onCancel()
 *
 *    Subtle but important: `onConfirm` runs BEFORE `onClose` (apply path)
 *    while `onCancel` runs AFTER `onClose` (cancel path). This is because
 *    apply already commits the player to the action, so the scene wants
 *    to start the action animation before tearing down the modal. On
 *    cancel there is no action, so the modal tears down cleanly first.
 *
 * 4. RE-ENTRANCY GUARD AT CALL SITE
 *
 *    Always check `if (this.<overlay>) return;` BEFORE constructing —
 *    otherwise rapid repeat-tap creates orphan modals stacked on top.
 *    The constructor does NOT itself prevent multiple instances; that's
 *    the caller's responsibility.
 *
 * 5. BUSY LOCK COORDINATION
 *
 *    Opening a confirmation overlay should set `this.busy = true` to
 *    block board/skill input behind the modal. Release MUST happen in
 *    BOTH confirm and cancel paths AND on scene shutdown. Pattern:
 *
 *      this.busy = true;
 *      this.overlayBusyToken = true;
 *      const release = () => {
 *        if (this.overlayBusyToken) {
 *          this.busy = false;
 *          this.overlayBusyToken = false;
 *        }
 *      };
 *      this.skillApplyOverlay = new SkillApplyOverlay(this, {
 *        ...,
 *        onConfirm: () => { this.skillApplyOverlay = undefined; release(); doAction(); },
 *        onCancel:  () => { this.skillApplyOverlay = undefined; release(); },
 *      });
 *
 *    The token flag prevents double-release if scene shutdown fires
 *    after either callback (cleanup teardown also calls release).
 *
 * 6. MODAL HYGIENE (delegates to ui-component.ts §12)
 *
 *    - Backdrop: fullscreen Rectangle, alpha 0.7, pointerdown closes
 *      with `e.stopPropagation()`.
 *    - Panel: opaque, centered, pointerdown handler with stopPropagation
 *      to absorb taps that would otherwise hit the backdrop.
 *    - Close button (X): own pointerdown handler with stopPropagation.
 *    - Confirm button: own pointerdown handler with stopPropagation,
 *      visually distinguished (green for "apply", red for "cancel").
 *
 * 7. PULSE TWEEN TRACKING
 *
 *    If the overlay uses infinite pulse tweens (e.g., on the apply
 *    button to draw the eye), store them in `private pulseTweens:
 *    Tween[]` and `.stop()` them in `preDestroy()`. Phaser destroys
 *    tween *targets* but does not always kill infinite tweens whose
 *    target is a Container — explicit `.stop()` prevents leak warnings
 *    and frees memory before the next overlay opens.
 *
 * 8. DEPTH RESERVATION
 *
 *    v1 confirmation overlays: depth 1500. Above HUD (5), settings
 *    panel (1000), end-game UI (1000); below VFX trails (250 — wait,
 *    those are below 1000, so VFX is OBSCURED by overlay, which is
 *    correct: VFX can't fire while modal is up because busy flag
 *    blocks the source action). v2 ItemCardModal: depth 2100 (different
 *    layer, different stack). See CLAUDE.md depth map.
 */
