/**
 * GOLD STANDARD: Phaser Animation Patterns
 *
 * All animations in this project follow these conventions:
 *
 * 1. ASYNC/AWAIT CHAINS
 *    - All animation methods return Promise<void>
 *    - Game flow uses async/await for sequencing:
 *
 *      showCritTexts(outcome.transforms);         // CRIT text before flight
 *      await animateClear(outcome, actor);         // tile flight
 *      applyMatchResults(outcome.counts, actor);   // wave 1 damage + resources
 *      // ... CRIT additional waves with delay
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
 *      The "I just got hit by a VFX" effect (white tintFill + scale
 *      yoyo) belongs on the target component, NOT in the VFX helper.
 *      This keeps VFX caller-agnostic and lets the component decide
 *      WHICH child element flashes (image vs text fallback):
 *
 *        flashIconPulse(durationMs = 240): Promise<void> {
 *          return new Promise<void>((resolve) => {
 *            if (!this.scene) { resolve(); return; }
 *            const target = this.iconImage?.visible
 *              ? this.iconImage : this.iconText;
 *            if (target instanceof Phaser.GameObjects.Image) {
 *              target.setTintFill(0xffffff);
 *              this.scene.time.delayedCall(durationMs * 0.4, () => {
 *                if (this.scene && target.scene) target.clearTint();
 *              });
 *            }
 *            this.scene.tweens.add({
 *              targets: this,
 *              scale: { from: 1, to: 1.25 },
 *              duration: durationMs * 0.45,
 *              ease: "Quad.easeOut", yoyo: true,
 *              onComplete: () => {
 *                if (this.scene) this.setScale(1);
 *                resolve();
 *              },
 *            });
 *          });
 *        }
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
 */
