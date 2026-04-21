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
 *    Layout constants (authoritative — `src/ui/SkillApplyOverlay.ts`):
 *      CARD_W = 270, CARD_H = 150, CARD_RADIUS = 12
 *      BACKDROP_ALPHA = 0.35 (lighter than standard modal 0.7)
 *      CARD_NAME_GAP = 12, CARD_TOP_SAFE_GAP = 8
 *
 *    CARD_H bumped 120 → 150 in feature-skill-card-polish to accommodate
 *    hyphenated Russian descriptions that now wrap to 2–3 lines (see
 *    `./text-hyphenation.ts` + DECISIONS R-CARD-1). Visually verified on
 *    375×667, 480×800, 768×1024 — no collision with cooldown icon or
 *    boss name.
 *
 *    Card position (authoritative — SkillApplyOverlay.ts:118–120):
 *
 *      const minTopY    = SAFE_AREA.top + CARD_H / 2 + CARD_TOP_SAFE_GAP;
 *      const idealCardY = UI_LAYOUT.bossNameY - CARD_NAME_GAP - CARD_H / 2;
 *      const cardY      = Math.max(minTopY, idealCardY);
 *
 *    Rationale for the clamp:
 *    - `idealCardY` floats the card above the boss name so the boss HP bar
 *      stays readable below the card; replaces the older below-HP-bar
 *      layout (`UI_LAYOUT.bossHpBarY + hpBarHeight + 20`) that pushed the
 *      card into the board at CARD_H=150.
 *    - `minTopY` prevents the card from escaping the visible top of the
 *      screen on devices with a safe-area inset (notch / status bar);
 *      Math.max picks the lower (further-down) of the two so the card is
 *      always fully on-screen.
 *    - Do NOT reference `bossHpBarY + hpBarHeight + 20` — that formula
 *      predates the CARD_H bump and collides with the board top row.
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
 * 8. PULSE TWEEN TRACKING (defensive — currently empty)
 *
 *    Infinite pulse tweens would be stored in `private pulseTweens: Tween[]`
 *    and stopped in `preDestroy()`. Pattern: `if (t && t.isPlaying()) t.stop()`
 *    then clear array.
 *
 *    CURRENT STATE (post feature-skill-card-polish): SkillApplyOverlay pushes
 *    ZERO infinite tweens. The overlay is intentionally "quiet" — motion is
 *    reserved for the HP/MP bar delta previews (see section 9). User feedback
 *    on the previous iteration (DECISIONS R-ARCH-1): «pulsation everywhere is
 *    overwhelming». The selected SkillButton is now highlighted by depth
 *    override (section 11), not by scale pulse.
 *
 *    KEEP the `pulseTweens[]` field + `preDestroy()` cleanup loop even when
 *    the array stays empty: new overlay flavours (e.g., a danger-style
 *    confirm) may want to push short-lived looping tweens here, and having
 *    the deterministic cleanup hook in place up-front avoids a future bug
 *    where a new pulse author forgets to add a stop-on-destroy path.
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
 *        // Lift selected skill button above backdrop (see §11)
 *      }
 *
 *      onClose: () => {
 *        playerHpBar.clearPreview();
 *        bossHpBar.clearPreview();
 *        manaBar.clearPreview();
 *        // Restore selected skill button depth (see §11)
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
 *
 * 11. SELECTED-BUTTON DEPTH OVERRIDE (no scale pulse)
 *
 *    While the confirmation overlay is open, the SOURCE skill button
 *    (the one the player tapped) is lifted ABOVE the backdrop via a
 *    static depth bump — NOT a scale pulse. Authoritative call sites:
 *    `openSkillHighlights` / `closeSkillHighlights` in GameScene.ts.
 *
 *      // GameScene.ts (module-level constants)
 *      const SKILL_BUTTON_BASE_DEPTH = 2;
 *      const OVERLAY_SELECTED_SKILL_DEPTH = 1501; // above overlay 1500
 *
 *      // openSkillHighlights
 *      selectedBtn.setDepth(OVERLAY_SELECTED_SKILL_DEPTH);
 *      selectedBtn.setClickDisabled();
 *      this.overlaySelectedSkillId = id;
 *
 *      // closeSkillHighlights (idempotent — always restore)
 *      if (this.overlaySelectedSkillId !== undefined) {
 *        const btn = this.skillButtons[this.overlaySelectedSkillId];
 *        if (btn) {
 *          btn.setDepth(SKILL_BUTTON_BASE_DEPTH);
 *          btn.setClickEnabled();
 *        }
 *        this.overlaySelectedSkillId = undefined;
 *      }
 *
 *    WHY depth, not scale pulse (DECISIONS R-ARCH-1):
 *    - User feedback on the previous iteration flagged ambient scale
 *      pulses as distracting. Depth override keeps the selected button
 *      visually prominent (stays bright through the dim backdrop) while
 *      every other UI element is uniformly dimmed.
 *    - Depth is a one-shot state change, no per-frame work — zero cost
 *      compared to an infinite tween feeding into section 8's cleanup.
 *
 *    WHY disableInteractive during the overlay:
 *    - The lifted button sits at depth 1501, the SkillApplyOverlay
 *      backdrop at 1500. Without the disable, tapping the button again
 *      races the re-entrancy guard (`if (this.skillApplyOverlay) return;`)
 *      and on some pointer-move paths can still fire the Arc child's
 *      pointerdown handler before the guard rejects it. `setClickDisabled`
 *      proxies to the inner Arc so the click handler is a true no-op,
 *      avoiding hand-cursor flicker and the race.
 *    - Restored in closeSkillHighlights — idempotent by
 *      `overlaySelectedSkillId !== undefined` sentinel.
 *
 *    SkillButton exposes this via a pair of paired proxies:
 *      `setClickDisabled()` / `setClickEnabled()` — both forward to the
 *      inner Arc's `disableInteractive()` / `setInteractive()` so callers
 *      don't reach into the Container children.
 *
 *    See CLAUDE.md depth map entry **1501** for the reservation.
 */
