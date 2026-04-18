/**
 * GOLD STANDARD: Confirmation Overlay (tap -> confirm -> action)
 *
 * Inserts a blocking confirmation modal between a player tap on a primary
 * action button (e.g., a skill) and the actual execution of that action.
 * Reduces mis-tap regret on irreversible / costly actions, and gives the
 * scene a chance to highlight the *consequences* of the pending action
 * (delta preview on HP/MP bars, skill button pulse, ...).
 *
 * Authoritative source: `src/ui/SkillApplyOverlay.ts` (v1, depth 1500).
 * Origin: Phase 2A+ skill-apply flow rework. Reworked from fullscreen
 * modal to compact horizontal card in feature-skill-overlay-rework.
 *
 * Cross-refs:
 *  - `./ui-component.ts` section 12 -- modal overlay base pattern (backdrop
 *    closes, panel absorbs).
 *  - `./item-card-modal.ts` -- pure detail modal singleton (no confirm).
 *  - CLAUDE.md depth map: 1500 reserved for v1 confirmation overlays.
 *
 * 1. SHAPE: per-instance Container, NOT a singleton
 *
 *    Unlike ItemCardModal (singleton, mirrors `toast`), confirmation
 *    overlays are constructed per-action by the caller and stored on a
 *    single scene field (`this.skillApplyOverlay?: SkillApplyOverlay`).
 *    Reason: the overlay's options bag captures the specific pending
 *    action's `onConfirm` / `onCancel` callbacks -- singleton state would
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
 * 2. COMPACT CARD LAYOUT (not fullscreen modal)
 *
 *    The overlay renders as a small horizontal card positioned above the
 *    game board, NOT a centered fullscreen panel. The game field remains
 *    visible through the lighter backdrop, letting the player see the
 *    delta previews on HP/MP bars.
 *
 *    Layout constants:
 *      CARD_W = 300, CARD_H = 150, CARD_RADIUS = 12
 *      BACKDROP_ALPHA = 0.35 (lighter than standard modal 0.7)
 *
 *    Card position: `cardY = UI_LAYOUT.bossHpBarY + hpBarHeight + 20`
 *    (just below boss HP bar, above the game board).
 *
 *    Card structure (left-to-right):
 *      [Icon circle + stars] | [Name, mana cost, cooldown, effect desc]
 *
 *    Apply button is separate from the card, positioned at:
 *      `btnY = UI_LAYOUT.playerHpBarY - 20`
 *    (just above the player HP bar, below the game board).
 *
 *    No X/close button -- dismiss by tapping outside the card (backdrop).
 *
 * 3. OPTIONS BAG: required action callbacks + optional scene hooks
 *
 *      export interface SkillApplyOverlayOptions {
 *        skill: SkillDef;
 *        level: number;
 *        onConfirm: () => void;
 *        onCancel:  () => void;
 *        onOpen?:  () => void;
 *        onClose?: () => void;
 *      }
 *
 *    `onOpen` fires AFTER `scene.add.existing(this)` so the scene can
 *    safely call `showPreview()` on HP/MP bars. Wrapped in try/catch --
 *    a buggy `onOpen` must not block the overlay from rendering:
 *
 *      try { opts.onOpen?.(); }
 *      catch (err) { console.error("...onOpen error:", err); }
 *
 *    `onClose` fires from `preDestroy()` -- see section 4 for ordering.
 *    The scene MUST use this hook to call `clearPreview()` on bars and
 *    kill any tweens started in `onOpen`.
 *
 * 4. CLOSE-PATH ORDERING: preDestroy fires onClose
 *
 *    `preDestroy()` (Phaser lifecycle hook) handles TWO responsibilities:
 *      1. Stop all infinite pulse tweens
 *      2. Fire `onClose` callback
 *
 *    This means `onClose` fires deterministically from destroy(), whether
 *    triggered by confirm, cancel, or scene shutdown. No manual cleanup
 *    paths can miss it.
 *
 *    Apply path ordering:
 *      [tap apply] -> onConfirm() -> destroy() -> preDestroy -> onClose
 *
 *    Cancel path ordering:
 *      [tap backdrop] -> destroy() -> preDestroy -> onClose -> onCancel()
 *
 *    Key difference: `onConfirm` runs BEFORE `onClose` (apply commits
 *    the action before teardown); `onCancel` runs AFTER `onClose` (modal
 *    tears down cleanly first, then the no-op cancel callback runs).
 *
 *    IMPORTANT: `onClose` fires from `preDestroy` -- this means the
 *    Container is mid-destruction. The callback must NOT reference the
 *    overlay's own children. It should only clean up scene-side state
 *    (clearPreview, stopDangerPulse, setScale(1), etc.).
 *
 * 5. RE-ENTRANCY GUARD AT CALL SITE
 *
 *    Always check `if (this.<overlay>) return;` BEFORE constructing --
 *    otherwise rapid repeat-tap creates orphan modals stacked on top.
 *
 * 6. BUSY LOCK COORDINATION
 *
 *    Opening a confirmation overlay should set `this.busy = true` to
 *    block board/skill input behind the modal. Release MUST happen in
 *    BOTH confirm and cancel paths. Pattern:
 *
 *      this.busy = true;
 *      this.skillOverlayBusyToken = true;
 *      const release = () => {
 *        if (this.skillOverlayBusyToken) {
 *          this.busy = false;
 *          this.skillOverlayBusyToken = false;
 *        }
 *      };
 *
 * 7. MODAL HYGIENE (delegates to ui-component.ts section 12)
 *
 *    - Backdrop: fullscreen Rectangle, alpha 0.35 (NOT 0.7), pointerdown
 *      closes with `e.stopPropagation()`.
 *    - Card: Graphics-based rounded rect background + transparent
 *      Rectangle hit zone on top, pointerdown with stopPropagation to
 *      absorb taps.
 *    - No X button / close button -- backdrop-only dismiss.
 *    - Apply button: separate from card, own pointerdown handler with
 *      stopPropagation, visually distinguished (green bg + stroke).
 *
 * 8. PULSE TWEEN TRACKING
 *
 *    Infinite pulse tweens (icon bg, apply button) stored in
 *    `private pulseTweens: Tween[]` and stopped in `preDestroy()`.
 *    Pattern: `if (t && t.isPlaying()) t.stop()` then clear array.
 *
 * 9. HP/MP BAR DELTA PREVIEW (onOpen/onClose hooks)
 *
 *    When the overlay opens, the scene calls `showPreview()` on the
 *    relevant bars to visualize the pending skill effect:
 *
 *      onOpen: () => {
 *        // Damage skill -> white preview on boss HP bar
 *        if (cfg.damage > 0) bossHpBar.showPreview(bossHp, bossHpMax, -cfg.damage);
 *        // Heal skill -> green preview on player HP bar
 *        if (cfg.heal > 0) playerHpBar.showPreview(playerHp, playerHpMax, cfg.heal);
 *        // Mana cost -> white preview on mana bar
 *        if (cfg.cost > 0) manaBar.showPreview(mana, manaMax, -cfg.cost);
 *        // Skill button pulse tween (tracked in skillHighlightTweens)
 *      }
 *
 *      onClose: () => {
 *        playerHpBar.clearPreview();
 *        bossHpBar.clearPreview();
 *        manaBar.clearPreview();
 *        // Stop skill button pulse tweens, restore scale
 *      }
 *
 *    See `Meter.showPreview` / `LayeredMeter.showPreview` for the
 *    preview rendering API (section 14 of ui-component.ts).
 *
 * 10. DEPTH RESERVATION
 *
 *    v1 confirmation overlays: depth 1500. Above HUD (5), settings
 *    panel (1000), end-game UI (1000); below Toast (2000) and
 *    ItemCardModal (2100). See CLAUDE.md depth map.
 */
