/**
 * GOLD STANDARD: Phaser Animation Patterns
 *
 * All animations in this project follow these conventions:
 *
 * 1. ASYNC/AWAIT CHAINS
 *    - All animation methods return Promise<void>
 *    - Game flow uses async/await for sequencing:
 *
 *      // (CRIT-визуал «CRIT! xN» удалён в T2 ivan-batch-1; cascade hits
 *      // теперь рендерит HitsCounter near boss — см. hit-counter.ts.)
 *      await animateClear(outcome, actor);         // tile flight
 *      applyMatchResults(outcome.counts, actor);   // wave 1 damage + resources
 *      // ... CRIT additional waves with delay (multipliers in outcome.transforms)
 *      // ... perk selection (mid-cascade interrupt)
 *      await animateCollapse(collapse);            // collapse + refill
 *
 * 2. tweenPromise() HELPER
 *    - Wraps Phaser tweens in Promises for async/await usage
 *    - Import from utils/helpers.ts
 *    - Preserves original onComplete callback
 *
 *      import { tweenPromise } from "../utils/helpers";
 *
 *      await tweenPromise(this, {
 *        targets: sprite,
 *        alpha: 0,
 *        duration: ANIMATION_DURATIONS.tileFade,
 *        ease: ANIMATION_EASING.fade,
 *      });
 *
 * 3. TIMING CONSTANTS
 *    - All durations come from ANIMATION_DURATIONS in animations.ts
 *    - All easing functions come from ANIMATION_EASING
 *    - All visual params (scale, alpha, offsets) come from VISUAL_EFFECTS
 *    - Never use inline magic numbers for timing or visual params
 *
 * 4. ANIMATION LOCK (busy flag)
 *    - Set `this.busy = true` before starting animation chain
 *    - Set `this.busy = false` when ready for next input
 *    - Input guard checks: `!busy && !gameOver && currentTurn === "player"`
 *
 * 5. PERSPECTIVE SCALING (FlyingTile pattern)
 *    - Start size > board tile, end size < board tile
 *    - Interpolate along Bezier t parameter:
 *
 *      const perspectiveScale = FLYING_TILE.startScale
 *        + (FLYING_TILE.endScale - FLYING_TILE.startScale) * progress;
 *
 *    - Trail scales proportionally:
 *
 *      const trailScale = perspectiveScale / FLYING_TILE.startScale;
 *
 * 6. SCENE CLEANUP
 *    - Always register scene.events.once("shutdown", cleanup)
 *    - Cleanup removes update listeners and destroys game objects
 *    - Check scene.sys.isActive() in update handlers
 *
 * 7. GUARDED PULSE CONTROLLER
 *    - Use createPulseController() for repeatable pulse animations
 *    - Prevents overlapping pulses on the same target
 *    - Used by CooldownIcon
 *
 * 8. ASYNC ERROR RECOVERY (busy flag safety)
 *    - Any async operation that sets `busy = true` MUST guarantee reset on
 *      ALL paths, including thrown exceptions
 *    - Three patterns are used in this project:
 *
 *      Pattern 1 — try/finally for UI cleanup (busy reset by caller):
 *
 *        this.busy = true;
 *        const overlay = this.add.rectangle(...);
 *        try {
 *          await tweenPromise(...);
 *          await someAsyncWork();
 *        } finally {
 *          overlay.destroy();
 *          // Caller (cascade loop) manages busy reset
 *        }
 *
 *      Pattern 2 — try/catch around non-critical async (continue happy path):
 *
 *        if (abilityReady) {
 *          this.busy = true;
 *          try {
 *            await this.executeBossAbility();
 *            // ... advance state
 *          } catch (err) {
 *            console.error("Boss ability failed:", err);
 *          }
 *        }
 *        this.busy = false; // always reached
 *
 *      Pattern 3 — fire-and-forget with .catch() handler:
 *
 *        const processPerks = async () => {
 *          try {
 *            while (this.pendingPerkCount > 0 && !this.gameOver) {
 *              this.pendingPerkCount--;
 *              await this.showPerkSelection();
 *            }
 *          } finally {
 *            this.busy = false;
 *            this.updateHud();
 *          }
 *        };
 *        processPerks().catch((err) => {
 *          console.error("Skill-triggered perk selection failed:", err);
 *          this.busy = false;
 *          this.updateHud();
 *        });
 *
 *    - NEVER call an async function without `await` AND without a `.catch()`
 *      handler — silent failures will leave busy stuck and freeze the screen
 *    - Every `busy = true` must have a guaranteed path to `busy = false`
 *    - Exception: game over (showVictory / showDefeat) intentionally keeps
 *      busy = true so input remains locked on the end-game modal
 *
 * 9. VFX TRAIL TO A MOVING/REPOSITIONED UI ELEMENT
 *
 *    Pattern: a sprite + alpha-fading dot trail flies from a source
 *    point to a target UI element, ending in a landing flash on that
 *    element. Authoritative: `flyPerkSelectVfx` in `src/scenes/GameScene.ts`
 *    (Task #2 perk-select VFX). Reference for the underlying trail loop:
 *    `src/ui/FlyingTile.ts`.
 *
 *    9a. SAMPLE TARGET COORDS *AFTER* ANY REPOSITION
 *
 *      The most subtle bug: if the destination UI element gets
 *      repositioned in the same async chain that fires the VFX, you MUST
 *      sample the target coords AFTER the reposition completes — sampling
 *      at VFX-spawn time captures a stale position and the highlight
 *      misses the slot.
 *
 *      Wrong:
 *        const target = this.skillButtons[id].getIconWorldPosition();
 *        this.applyPerk(id);                  // may unlock new skill
 *        this.repositionSkillButtons();       // moves new button
 *        await flyVfx(source, target, id);    // ← target is STALE
 *
 *      Right:
 *        this.applyPerk(id);
 *        this.repositionSkillButtons();
 *        this.updateHud();
 *        // sample now — button is at its final slot
 *        await this.flyPerkSelectVfx(sourceX, sourceY, id);
 *        // flyPerkSelectVfx internally calls
 *        //   targetBtn.getIconWorldPosition()
 *        // RIGHT BEFORE starting the animation
 *
 *      The source coord can (and should) be sampled BEFORE any destroy
 *      animation on the source element runs — typically in the click
 *      callback, stored in a closure-captured `let sourceX/Y` variable.
 *
 *    9b. EXPOSE getIconWorldPosition() ON UI COMPONENTS
 *
 *      UI components that may serve as VFX targets should expose a
 *      simple `getIconWorldPosition(): { x, y }` returning world coords
 *      of their visual centre. Container x/y are world; offset by the
 *      child's local origin. Keep return type as a plain object, not a
 *      Phaser Vector — callers should not need a Phaser dep:
 *
 *        getIconWorldPosition(): { x: number; y: number } {
 *          return { x: this.x, y: this.y - 2 };  // icon at local (0,-2)
 *        }
 *
 *    9c. LANDING FLASH AS A METHOD ON THE TARGET COMPONENT
 *
 *      The "I just got hit by a VFX" effect (tintFill + scale yoyo)
 *      belongs on the target component, NOT in the VFX helper. This
 *      keeps VFX caller-agnostic and lets the component decide WHICH
 *      child element flashes (image vs text fallback). SkillButton
 *      exposes TWO sibling methods distinguishing semantic flavour
 *      AND deliberately uses DIFFERENT scale + duration tunings — the
 *      upgrade feel is meant to read stronger than unlock:
 *
 *        flashIconPulse(durationMs = 240): Promise<void>
 *          // white tint (PULSE_FLASH_COLOR = 0xffffff)
 *          // scale 1.0 → FLASH_SCALE (1.25) → 1.0
 *          // used for UNLOCK landings — "new skill appeared!"
 *
 *        flashIconUpgrade(durationMs = 320): Promise<void>
 *          // gold tint (UPGRADE_FLASH_COLOR = 0xffd700)
 *          // scale 1.0 → UPGRADE_FLASH_SCALE_PEAK (1.4) → 1.0
 *          // used for UPGRADE landings — "level up on existing skill"
 *          // intentionally amplified vs flashIconPulse
 *
 *      The tint timing is shared (`FLASH_TINT_RATIO = 0.4`); the tween
 *      ratio differs slightly (`FLASH_TWEEN_RATIO = 0.45` for unlock,
 *      `UPGRADE_FLASH_TWEEN_RATIO = 0.5` for upgrade — slightly slower
 *      so the bigger scale lands rather than blurs):
 *
 *        const FLASH_SCALE = 1.25;
 *        const UPGRADE_FLASH_SCALE_PEAK = 1.4;   // amplified
 *        const FLASH_TINT_RATIO = 0.4;
 *        const FLASH_TWEEN_RATIO = 0.45;         // unlock
 *        const UPGRADE_FLASH_TWEEN_RATIO = 0.5;  // upgrade
 *        const PULSE_FLASH_COLOR = 0xffffff;     // unlock
 *        const UPGRADE_FLASH_COLOR = 0xffd700;   // upgrade
 *
 *      Template for either method (note the explicit constant for the
 *      scale peak — the unlock variant uses FLASH_SCALE, the upgrade
 *      variant uses UPGRADE_FLASH_SCALE_PEAK):
 *
 *        flashIconUpgrade(durationMs = 320): Promise<void> {
 *          return new Promise<void>((resolve) => {
 *            if (!this.scene) { resolve(); return; }
 *            const target = this.iconImage?.visible
 *              ? this.iconImage : this.iconText;
 *            if (target instanceof Phaser.GameObjects.Image) {
 *              target.setTintFill(UPGRADE_FLASH_COLOR);
 *              this.scene.time.delayedCall(durationMs * FLASH_TINT_RATIO, () => {
 *                if (this.scene && target.scene) target.clearTint();
 *              });
 *            }
 *            this.scene.tweens.add({
 *              targets: this,
 *              scale: { from: 1, to: UPGRADE_FLASH_SCALE_PEAK },
 *              duration: durationMs * UPGRADE_FLASH_TWEEN_RATIO,
 *              ease: "Quad.easeOut", yoyo: true,
 *              onComplete: () => {
 *                if (this.scene) this.setScale(1);
 *                resolve();
 *              },
 *            });
 *          });
 *        }
 *
 *      WHY split the scale/duration constants instead of one shared
 *      `FLASH_SCALE`: the brief explicitly asked for the upgrade
 *      landing to outshine the unlock landing. Keeping a single
 *      constant would force one or the other to compromise. The
 *      gold/white tint distinction stays meaningful regardless.
 *      See feature-ivan-batch-1 DECISIONS R-T3-2.
 *
 *      For the upgrade path, callers chain a radial particle burst
 *      (see §9h) at the moment of landing — the gold dot ring is
 *      what truly amplifies the "level-up!" beat over the unlock pulse.
 *
 *    9d. CLEANUP: cleaned flag + SHUTDOWN listener
 *
 *      Every VFX helper that uses `events.on("update", ...)` MUST
 *      register a SHUTDOWN listener AND guard cleanup with an
 *      idempotent `cleaned` flag — multiple resolution paths (normal
 *      completion, scene becoming inactive, shutdown event) can race
 *      to free the same sprites:
 *
 *        let cleaned = false;
 *        let onUpdate: (() => void) | null = null;
 *        const cleanup = () => {
 *          if (cleaned) return;
 *          cleaned = true;
 *          if (onUpdate) this.events.off("update", onUpdate);
 *          this.events.off(Phaser.Scenes.Events.SHUTDOWN, cleanup);
 *          sprite.destroy();
 *          trailGfx.destroy();
 *        };
 *        // ... onUpdate uses cleanup() on isActive()===false
 *        this.events.on("update", onUpdate);
 *        this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
 *
 *    9e. INLINE vs FACTOR OUT
 *
 *      Single-call-site VFX helpers stay inline as private scene
 *      methods (e.g., `private async flyPerkSelectVfx(...)`). Extract
 *      to `src/ui/<name>.ts` only when a second caller appears OR the
 *      helper grows past ~80 lines and obscures its caller. The
 *      reference VFX at `src/ui/FlyingTile.ts` IS extracted because
 *      both `animateClear` (player wave) and boss-ability paths use it.
 *
 *    9f. BRANCHED LANDING: UNLOCK vs UPGRADE (skipLandingFlash option)
 *
 *      When a VFX helper owns its landing flash (as `flyPerkSelectVfx`
 *      does — it calls `targetBtn.flashIconPulse(...)` on arrival),
 *      callers that need a DIFFERENT landing flash must be able to opt
 *      out of the default. The canonical shape: optional options bag
 *      with a `skipLandingFlash` boolean.
 *
 *        private async flyPerkSelectVfx(
 *          sourceX: number,
 *          sourceY: number,
 *          skillId: SkillId,
 *          options?: { skipLandingFlash?: boolean },
 *        ): Promise<void> {
 *          // ... transit animation ...
 *          if (t >= 1) {
 *            if (options?.skipLandingFlash) {
 *              // Caller will follow up with a different flash.
 *              finish();
 *            } else {
 *              targetBtn.flashIconPulse(PERK_UNLOCK_FLASH_MS).then(finish);
 *            }
 *          }
 *        }
 *
 *      Consumer pattern (current) — both paths skip the default flash
 *      and chain their own follow-up so each variant gets its bespoke
 *      effect. Use the RESULT of the mutation (e.g., `applyPerk`
 *      returns `{ isNewUnlock: boolean }`) to pick the branch:
 *
 *        const result = this.perkManager.applyPerk(selectedPerk.skillId);
 *        if (result.isNewUnlock) this.repositionSkillButtons();
 *        this.updateHud();
 *
 *        // Hide newly-unlocked button so the flying icon "becomes" it.
 *        const targetBtn = this.skillButtons[selectedPerk.skillId];
 *        if (result.isNewUnlock && targetBtn) {
 *          targetBtn.setScale(0).setAlpha(0);
 *        }
 *
 *        try {
 *          await this.flyPerkSelectVfx(
 *            sourceX, sourceY, selectedPerk.skillId,
 *            { skipLandingFlash: true },
 *          );
 *          if (result.isNewUnlock) {
 *            if (targetBtn) await targetBtn.playUnlockPopIn();
 *          } else if (targetBtn) {
 *            const land = targetBtn.getIconWorldPosition();
 *            this.burstGoldDots(land.x, land.y);          // §9h
 *            await targetBtn.flashIconUpgrade(PERK_UPGRADE_FLASH_MS);
 *          }
 *        } finally {
 *          // §9i — defensive restore so a thrown VFX or SHUTDOWN race
 *          //         never leaves the unlock-path button invisible.
 *          if (result.isNewUnlock && targetBtn && targetBtn.scene) {
 *            if (targetBtn.scaleX < 1 || targetBtn.alpha < 1) {
 *              targetBtn.setScale(1).setAlpha(1);
 *            }
 *          }
 *        }
 *
 *      WHY split `PERK_UNLOCK_FLASH_MS` (240) and `PERK_UPGRADE_FLASH_MS`
 *      (320): the brief explicitly asked the upgrade landing to outshine
 *      the unlock landing. The pacing IS the differentiator alongside
 *      gold/white. Don't unify back to a single constant unless the
 *      design changes.
 *
 *      WHY NOT fire both flashes: white + gold on the same landing
 *      reads as a double-flash bug, not as "upgrade". Both branches
 *      pass `skipLandingFlash: true` and chain their own follow-up.
 *
 *      References: `src/scenes/GameScene.ts` `flyPerkSelectVfx` +
 *      `showPerkSelection` callback; feature-ivan-batch-1 DECISIONS
 *      R-T3-1, R-T3-2, R-T3-3.
 *
 *    9g. FLYING-ICON COMPANION TO TRAIL VFX
 *
 *      When a VFX symbolises a TRANSFER of a specific entity (skill
 *      icon, item sprite, currency token), the flying object should be
 *      the actual entity sprite — not a generic placeholder. The trail
 *      becomes accompaniment, not the headline.
 *
 *      Authoritative reference: `flyPerkSelectVfx` in GameScene.ts
 *      (Task #3 ivan-batch-1). Pre-T3, the helper flew a generic gold
 *      Mana sprite. Post-T3 it spawns the actual skill icon — Image
 *      (tintable) when the skill has `iconTexture`, Text (color baked
 *      in) when it's emoji-only.
 *
 *      Branched render — handles both texture-backed and emoji-only
 *      sources without falling back to a placeholder:
 *
 *        const cfg = SKILL_CONFIG[skillId];
 *        let iconObj: Phaser.GameObjects.Image | Phaser.GameObjects.Text;
 *        if (cfg.iconTexture && this.textures.exists(cfg.iconTexture)) {
 *          iconObj = this.add.image(sourceX, sourceY, cfg.iconTexture)
 *            .setDisplaySize(PERK_VFX_ICON_SIZE_PX, PERK_VFX_ICON_SIZE_PX)
 *            .setTint(PERK_VFX_GOLD_TINT)        // works on Image
 *            .setOrigin(0.5);
 *        } else {
 *          iconObj = this.add.text(sourceX, sourceY, cfg.icon, {
 *            fontSize: `${PERK_VFX_ICON_TEXT_FONT_PX}px`,
 *            color: "#ffd700",  // bake in — setTint is ignored on emoji
 *            fontFamily: "'Exo 2', Arial, sans-serif",
 *            resolution: 2,
 *          }).setOrigin(0.5);
 *        }
 *        iconObj.setDepth(PERK_VFX_FLY_DEPTH).setScale(PERK_VFX_ICON_START_SCALE);
 *
 *      WHY `setTint` doesn't work on emoji Text: emoji glyphs are
 *      rendered as colour bitmap fonts by the OS / browser. Phaser
 *      tint is a multiplicative shader on a single-channel mask;
 *      colour bitmap pixels skip the multiply step in canvas, so the
 *      tint visibly fails. Cross-platform fix: set `color` at Text
 *      construction. Texture-backed Image isn't subject to this — its
 *      pixels go through the tint shader normally.
 *
 *      Animation tunings: perspective scale shrinks 1.5 → 0.8 along
 *      the same Bezier path the trail follows; an optional ±180°
 *      lazy spin adds variety without distracting from motion. The
 *      trail (which was the headline pre-T3) is dimmed — alpha factor
 *      0.7 → 0.4, radius 6 → 4 — so it reads as a wake, not the lead:
 *
 *        const PERK_VFX_ICON_START_SCALE = 1.5;
 *        const PERK_VFX_ICON_END_SCALE = 0.8;
 *        const PERK_VFX_ICON_SPIN_DEG = 180;
 *        const PERK_VFX_ARC_HEIGHT_PX = 60;        // bezier mid lift
 *        const PERK_VFX_FLY_DURATION_MS = 480;
 *        const PERK_VFX_TRAIL_ALPHA_FACTOR = 0.4;  // dimmed
 *        const PERK_VFX_TRAIL_RADIUS = 4;          // shrunk
 *        const PERK_VFX_TRAIL_FADE_DURATION_MS = 150;
 *        const PERK_VFX_TRAIL_FADE_PER_FRAME = 0.08;
 *
 *      Random spin direction (`Math.random() < 0.5 ? -1 : 1`) avoids
 *      a metronome feel when multiple icons fly in succession.
 *
 *      Cleanup: §9d still applies. The flying icon shares the same
 *      `cleaned` flag and SHUTDOWN listener as the trail. Both Image
 *      and Text branches respond to `iconObj.destroy()` because
 *      `Phaser.GameObjects.GameObject.destroy()` is the shared base
 *      method.
 *
 *    9h. RADIAL PARTICLE BURST AS LANDING ACCENT
 *
 *      When a landing flash needs to read as MORE than a pulse — for
 *      example, an upgrade vs an unlock — accompany it with a radial
 *      gold-dot burst at the same moment. NOT Phaser.Particles
 *      (heavyweight emitter API for a one-shot burst); just N
 *      `Phaser.GameObjects.Arc` circles + parallel tweens.
 *
 *      Authoritative reference: `burstGoldDots(x, y)` in GameScene.ts
 *      (Task #3 ivan-batch-1). Fire-and-forget; caller does NOT await.
 *
 *      Spawn dots on SCENE depth, not inside the target Container —
 *      dots need to escape the target's bounding rect. Use a depth
 *      one above the flying VFX (`PERK_VFX_FLY_DEPTH = 250` →
 *      `BURST_DOT_DEPTH = 251`).
 *
 *        const BURST_DOT_COUNT = 6;       // 5–8 reads as a "ring"
 *        const BURST_DOT_RADIUS = 36;     // px outward from centre
 *        const BURST_DOT_SIZE = 3;
 *        const BURST_DOT_DURATION_MS = 350;
 *        const BURST_DOT_DEPTH = 251;     // above flying VFX
 *
 *      Skeleton (with §9d cleanup):
 *
 *        private burstGoldDots(x: number, y: number): void {
 *          const dots: Phaser.GameObjects.Arc[] = [];
 *          let cleaned = false;
 *          const cleanup = () => {
 *            if (cleaned) return;
 *            cleaned = true;
 *            this.events.off(Phaser.Scenes.Events.SHUTDOWN, cleanup);
 *            dots.forEach((d) => d.scene && d.destroy());
 *          };
 *          // CRITICAL: register listener BEFORE the spawn loop so a
 *          // SHUTDOWN that fires mid-loop still cleans every dot
 *          // created so far. Order matters (security review F6).
 *          this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
 *
 *          for (let i = 0; i < BURST_DOT_COUNT; i++) {
 *            const angle = (i / BURST_DOT_COUNT) * Math.PI * 2;
 *            const tx = x + Math.cos(angle) * BURST_DOT_RADIUS;
 *            const ty = y + Math.sin(angle) * BURST_DOT_RADIUS;
 *            const dot = this.add.circle(x, y, BURST_DOT_SIZE, 0xffd700, 1)
 *              .setDepth(BURST_DOT_DEPTH);
 *            dots.push(dot);
 *            this.tweens.add({
 *              targets: dot,
 *              x: tx, y: ty, alpha: 0,
 *              duration: BURST_DOT_DURATION_MS,
 *              ease: "Quad.easeOut",
 *              onComplete: () => {
 *                if (dot.scene) dot.destroy();
 *                if (dots.every((d) => !d.scene)) cleanup();
 *              },
 *            });
 *          }
 *        }
 *
 *      WHY `dots.every((d) => !d.scene)` works as the "all done"
 *      signal: Phaser sets `GameObject.scene = undefined` in
 *      `destroy()`. The last dot's onComplete sees every prior dot's
 *      scene=undefined and triggers cleanup; idempotent guard
 *      prevents the SHUTDOWN listener from firing it again.
 *
 *    9i. DEFENSIVE RESTORE FOR PRE-HIDDEN TARGET BUTTONS
 *
 *      When the consumer hides a target component before the VFX
 *      starts (e.g. `targetBtn.setScale(0).setAlpha(0)` on the unlock
 *      path so the flying icon "becomes" the button), wrap the VFX
 *      sequence in `try/finally` and restore on exception or SHUTDOWN
 *      race. Otherwise a thrown tween or interrupted shutdown leaves
 *      the player staring at an invisible button:
 *
 *        try {
 *          await this.flyPerkSelectVfx(..., { skipLandingFlash: true });
 *          if (result.isNewUnlock && targetBtn) {
 *            await targetBtn.playUnlockPopIn();   // happy path: scale/alpha → 1
 *          }
 *          // ... upgrade branch ...
 *        } finally {
 *          // Only the unlock branch hides the button; only it needs restore.
 *          // Guard `targetBtn.scene` so we don't touch a destroyed object
 *          // mid-shutdown.
 *          if (result.isNewUnlock && targetBtn && targetBtn.scene) {
 *            if (targetBtn.scaleX < 1 || targetBtn.alpha < 1) {
 *              targetBtn.setScale(1).setAlpha(1);
 *            }
 *          }
 *        }
 *
 *      The `scaleX < 1 || alpha < 1` check makes the restore a no-op
 *      on the happy path (where popIn already settled to 1) — only
 *      the exception/cancelled path actually needs it.
 *
 *      Equivalent rule for any "hide target → fly → reveal target"
 *      VFX: the hide and the reveal MUST be paired by a try/finally
 *      so a fault in between can't strand the user with a missing
 *      element.
 *
 *      Reference: `showPerkSelection` in GameScene.ts; Task #3
 *      logic-reviewer pass.
 *
 * 10. SETTINGS UI LIVE-PREVIEW (cross-ref)
 *
 *    Not strictly an animation pattern, but bundled here because it
 *    shows up in the same surface area: when a settings panel exposes
 *    inputs that drive *computed downstream values* (per-layer HP from
 *    base × multipliers, encounter difficulty curves, etc.), the
 *    editor MUST render the computed array live. Recompute on every
 *    input-changed callback — no caching, no memoization, no chart
 *    framework for ≤20-element arrays.
 *
 *    Authoritative reference and full discussion:
 *    `.conventions/gold-standards/param-derived-ui-display.ts`. Short
 *    rule: input changes, preview block recomputes from the SAME
 *    helpers the runtime uses, no parallel formula in the panel.
 *
 *    Trigger this pattern when the user could reasonably mistake an
 *    input value for the output (e.g., "I set base = 1000, the HUD
 *    shows 15500, where did 15500 come from?"). The preview makes the
 *    derivation visible and removes the «I set 1000 but see 15500»
 *    confusion class.
 *
 *    Reference: `src/ui/SettingsPanel.ts` HP preview block;
 *    feature-ivan-batch-1 R-T1-1.
 */
