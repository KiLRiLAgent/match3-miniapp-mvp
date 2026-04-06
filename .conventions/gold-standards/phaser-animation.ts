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
 */
