/**
 * GOLD STANDARD: Phaser Animation Patterns
 *
 * All animations in this project follow these conventions:
 *
 * 1. ASYNC/AWAIT CHAINS
 *    - All animation methods return Promise<void>
 *    - Game flow uses async/await for sequencing:
 *
 *      await animateTransforms(outcome.transforms);
 *      await animateClear(outcome, actor);
 *      applyMatchResults(outcome.counts, actor);
 *      await animateCollapse(collapse);
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
 *    - Used by CooldownIcon and ShieldIcon
 */
