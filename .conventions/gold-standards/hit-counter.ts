/**
 * GOLD STANDARD: Cascade-Lifecycle UI Label (HitsCounter pattern)
 *
 * Authoritative reference: `src/ui/HitsCounter.ts` (Task #2 ivan-batch-1).
 * This is the canonical template for any per-cascade UI element bound to a
 * target world position — combo / chain / streak / damage tally indicators
 * all follow the same shape:
 *
 *   - Created on first qualifying event in a cascade (lazy spawn).
 *   - Updated on each subsequent event with a pop animation; existing
 *     instance is reused (no destroy-and-respawn churn between waves).
 *   - Hidden + destroyed on cascade end.
 *   - Survives back-to-back cascades — a re-show during fade-out cancels
 *     the fade in-place instead of leaking a duplicate.
 *
 * 1. EXTRACT TO ITS OWN COMPONENT, NOT INLINE
 *
 *    Old pattern (pre-T2): inline `Phaser.GameObjects.Text` + `cascadeHitCount`
 *    field directly on GameScene, with show/update/hide as scene methods.
 *    This worked but bled cascade UI lifecycle into combat-resolution code.
 *
 *    Current pattern (T2+): `class HitsCounter extends Container`, lifetime
 *    decisions live on the component (fade-tween reuse, SHUTDOWN cleanup,
 *    pop-animation tween bookkeeping). Scene only calls
 *    `showHits(count)` / `hide()`.
 *
 *    Extract WHEN:
 *    - The label has its own animation lifecycle (fade in / pop / fade out).
 *    - The label needs to handle race conditions (back-to-back cascades).
 *    - The same pattern will be reused for sibling indicators (combo, etc).
 *
 * 2. STATE FIELDS (on the consumer scene)
 *
 *      private cascadeHitCount = 0;
 *      private hitsCounter?: HitsCounter;
 *
 *    Optional field — `undefined` means "no active counter". Don't
 *    pre-allocate at scene boot; HitsCounter is cheap to construct.
 *
 * 3. LIFECYCLE (consumer-driven)
 *
 *    a) Reset counter at cascade start (top of `resolveBoard`):
 *
 *         this.cascadeHitCount = 0;
 *
 *    b) Increment after each `applyMatchResults` if PLAYER damage was
 *       dealt (boss waves and shielded hits don't count — they're not
 *       what the indicator means):
 *
 *         const didDamage = actor === "player"
 *           && this.computeDamageFromCounts(outcome.counts) > 0
 *           && this.bossShieldDuration <= 0;
 *         if (didDamage) {
 *           this.cascadeHitCount++;
 *           if (this.cascadeHitCount >= 2) {
 *             this.showHitCounter(this.cascadeHitCount);
 *           }
 *         }
 *
 *    c) Show/update — lazy-spawn on first call, reuse on subsequent calls:
 *
 *         private showHitCounter(count: number): void {
 *           if (!this.hitsCounter || !this.hitsCounter.scene) {
 *             this.hitsCounter = new HitsCounter(this, posX, posY);
 *           }
 *           this.hitsCounter.showHits(count);
 *         }
 *
 *    d) Fade out + clear reference at cascade end:
 *
 *         private async fadeOutHitCounter(): Promise<void> {
 *           const counter = this.hitsCounter;
 *           if (!counter) return;
 *           this.hitsCounter = undefined;   // clear FIRST — critical
 *           await counter.hide();
 *         }
 *
 *       WHY clear the reference BEFORE awaiting hide(): a new cascade may
 *       fire showHits during the fade. If the reference still points to
 *       the fading instance, the consumer mistakenly reuses it; if cleared
 *       first, the consumer creates a fresh HitsCounter and the old one
 *       finishes its fade-then-destroy independently.
 *
 *    e) Game-over paths must destroy explicitly. The end-game overlay
 *       won't naturally trigger fadeOutHitCounter; the counter would
 *       linger over the victory/defeat banner:
 *
 *         private endCounterForGameOver(): void {
 *           this.hitsCounter?.destroy();
 *           this.hitsCounter = undefined;
 *         }
 *
 * 4. DISPLAY TUNINGS (Container — module-level UPPER_SNAKE)
 *
 *      const HITS_FONT_SIZE = 38;            // bumped from 22 (T2 brief)
 *      const HITS_COLOR = "#ffd700";
 *      const HITS_STROKE_COLOR = "#000000";
 *      const HITS_STROKE_THICKNESS = 4;
 *      const HITS_FADE_IN_DURATION = 150;
 *      const HITS_FADE_OUT_DURATION = 250;
 *      const HITS_POP_SCALE = 1.2;
 *      const HITS_POP_DURATION = 180;
 *      const HITS_FADE_OUT_RISE = 20;        // px upward float on fade
 *
 *    Threshold for "show" is intentionally `count >= 2` — a single hit
 *    isn't a cascade, and showing "1 Hits!" reads as filler. The 38 px
 *    weight is tuned for the boss-name strip; smaller indicators living
 *    on the player side may want 24–28 px. Don't share font-size constants
 *    across indicators with different placements — each variant has its
 *    own visual budget.
 *
 *    Origin (1, 0.5) for right-anchor against `bossHpBarX + hpBarWidth`.
 *    Depth: 100 (same band as floating combat text — see CLAUDE.md depth map).
 *
 * 5. RACE: BACK-TO-BACK CASCADE DURING FADE-OUT
 *
 *    Scenario: cascade A ends → `hide()` starts a fade tween → cascade B
 *    fires `showHits` mid-fade.
 *
 *    HitsCounter.showHits handles this in-place:
 *      1. Stops the active fade tween, resets `fadeTween = undefined`.
 *      2. Restores `y` to baseY (fade-out shifted it upward).
 *      3. Fades alpha back to 1 from wherever it landed.
 *      4. Plays a pop tween for the new count.
 *
 *    HitsCounter.hide handles the inverse — if it's called while a fade
 *    is already running, it piggybacks on the active tween's
 *    TWEEN_COMPLETE *and* TWEEN_STOP events with a `settled` flag so the
 *    awaiter resolves exactly once whether the fade finishes normally or
 *    is cancelled by a re-show:
 *
 *      let settled = false;
 *      const settle = () => { if (settled) return; settled = true; resolve(); };
 *      this.fadeTween.once(Phaser.Tweens.Events.TWEEN_COMPLETE, settle);
 *      this.fadeTween.once(Phaser.Tweens.Events.TWEEN_STOP, settle);
 *
 *    WHY listen to TWEEN_STOP too: if a re-show interrupts the fade with
 *    `fadeTween.stop()`, only TWEEN_STOP fires (not COMPLETE). Without
 *    the second listener, the previous `hide()` awaiter would hang.
 *    See ivan-batch-1 security review F5.
 *
 * 6. SHUTDOWN HANDLING
 *
 *    The component owns its SHUTDOWN listener — Phaser destroys child
 *    Containers automatically on shutdown, but tween bookkeeping must be
 *    explicit so the next-scene boot doesn't see stale tween references:
 *
 *      this.shutdownHandler = () => {
 *        if (this.scene && this.active) this.destroy();
 *      };
 *      scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdownHandler);
 *
 *      override destroy(fromScene?: boolean): void {
 *        this.fadeTween?.stop();
 *        this.popTween?.stop();
 *        if (this.scene) {
 *          this.scene.events.off(Phaser.Scenes.Events.SHUTDOWN, this.shutdownHandler);
 *        }
 *        super.destroy(fromScene);
 *      }
 *
 *    Removing the SHUTDOWN listener inside destroy() is the
 *    counter-symmetric pair to registering it in the constructor.
 *    Without it, a scene that destroys + reboots (rare in this app —
 *    only on intentional restart) would re-add a stale listener.
 *
 * 7. RELATED PATTERNS
 *
 *    - The "show on first qualifying event, update on subsequent, fade
 *      at cascade end" lifecycle generalises to any cascade-bound UI:
 *      combo bars, chain meters, score popups, streak counters.
 *      The state machine of HitsCounter is the template; only the
 *      label text and tunings change.
 *
 *    - For UI that fires on a SINGLE event (not a cascade) — e.g.,
 *      damage numbers — use `DamageNumber` instead, which is one-shot
 *      and self-destructs.
 *
 *    - For modal blocking confirmations, use ItemCardModal (depth 2100,
 *      blocking). HitsCounter is non-blocking, depth 100.
 */
