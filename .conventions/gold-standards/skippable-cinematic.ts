/**
 * GOLD STANDARD: Skippable Cinematic Sequence (raceSkip + blocker tracking)
 *
 * Multi-step cinematic where any frame the player can tap once to "skip
 * to the end" — every running tween, every `wait()`, every blocking-input
 * rectangle resolves immediately and the sequence flushes to its terminal
 * step (e.g., transitioning to the gameplay scene).
 *
 * Authoritative source: `src/scenes/IntroScene.ts` (v1, intro to boss
 * fight). Pattern emerged from RISK-9 audit of Task #4: ad-hoc
 * `waitOrTap` + `tweenPromise` left orphan blocker rectangles AND timers
 * when the player tapped skip mid-step. Replaced by tracked blockers +
 * raceSkip + tween-aware `requestSkip()`.
 *
 * Cross-refs:
 *  - `./phaser-animation.ts` §6 — scene cleanup conventions.
 *  - `./phaser-animation.ts` §8 — busy-flag safety (analogous concern).
 *
 * 1. STATE — three pieces of cinematic state
 *
 *      private skipRequested = false;
 *      private skipResolvers: Array<() => void> = [];
 *      private blockers: Array<{
 *        rect: Phaser.GameObjects.Rectangle;
 *        timer: Phaser.Time.TimerEvent;
 *      }> = [];
 *
 *    `skipRequested` — single-shot latch. Once true, stays true; future
 *      `waitForSkip()` calls resolve immediately.
 *    `skipResolvers` — pending resolvers from in-flight `waitForSkip()`
 *      calls, drained by `requestSkip()`.
 *    `blockers` — every tap-or-timer wait registers its rect + timer
 *      pair so `requestSkip()` can destroy/cancel both atomically.
 *
 * 2. SKIP ZONE — single-shot fullscreen rectangle
 *
 *    A high-depth (999) invisible interactive rectangle covering the
 *    whole screen. `once("pointerdown", ...)` so it can only fire skip
 *    once. Destroyed in the terminal step BEFORE the next scene starts
 *    so the new scene receives its own first tap cleanly:
 *
 *      // step6_transitionToGame
 *      this.skipZone?.destroy();
 *      this.skipZone = undefined;
 *      this.scene.launch("GameScene", { ... });
 *
 * 3. waitForSkip() — promise that resolves on skip
 *
 *      private waitForSkip(): Promise<void> {
 *        if (this.skipRequested) return Promise.resolve();
 *        return new Promise<void>((resolve) => {
 *          this.skipResolvers.push(resolve);
 *        });
 *      }
 *
 * 4. raceSkip(p) — race a step against skip
 *
 *      private async raceSkip<T>(p: Promise<T>): Promise<void> {
 *        await Promise.race([p, this.waitForSkip()]);
 *      }
 *
 *    Caller pattern:
 *
 *      await this.raceSkip(this.step1_backgroundAppear());
 *      if (this.skipRequested) { await this.step6_transitionToGame(); return; }
 *      await this.raceSkip(this.step2_safiraAppear());
 *      if (this.skipRequested) { await this.step6_transitionToGame(); return; }
 *      // ... repeat per step
 *      await this.step6_transitionToGame();
 *
 *    Each `raceSkip + skipRequested check` pair is the cinematic's
 *    cooperative interrupt point. The check after each step is
 *    necessary because raceSkip resolves on whichever finishes first —
 *    if skip won, the step's tweens may still be partially running, so
 *    we jump straight to the terminal step.
 *
 * 5. awaitOrTap(ms, depth) — tracked blocker (replaces unmanaged waitOrTap)
 *
 *    Combines a timer with a tap-zone, BOTH tracked in `this.blockers`
 *    so `requestSkip()` cleans both up. Without tracking, a skip mid-
 *    awaitOrTap leaves an orphan rect (visible click absorber on next
 *    scene) AND an orphan timer (ghost callback firing later).
 *
 *      private async awaitOrTap(ms: number, depth: number): Promise<void> {
 *        return new Promise<void>((resolve) => {
 *          let done = false;
 *          const rect = this.add.rectangle(GAME_WIDTH/2, GAME_HEIGHT/2,
 *            GAME_WIDTH, GAME_HEIGHT, 0x000000, 0)
 *            .setDepth(depth).setInteractive();
 *          const finish = () => {
 *            if (done) return;
 *            done = true;
 *            timer.remove();
 *            rect.destroy();
 *            this.blockers = this.blockers.filter((b) => b.rect !== rect);
 *            resolve();
 *          };
 *          rect.once("pointerdown", finish);
 *          const timer = this.time.delayedCall(ms, finish);
 *          this.blockers.push({ rect, timer });
 *        });
 *      }
 *
 *    Note: `done` flag inside finish() is critical — both pointerdown
 *    AND timer can fire in the same frame, second invocation must no-op.
 *
 * 6. requestSkip() — flush everything atomically
 *
 *      private requestSkip() {
 *        if (this.skipRequested) return;        // idempotent
 *        this.skipRequested = true;
 *        // 6a. Resolve in-flight tweens cleanly
 *        this.tweens.getTweens().forEach((t) => {
 *          const isInfinite = (t as any).repeat === -1;
 *          if (isInfinite) t.stop();   // .complete() is no-op on infinite
 *          else t.complete();          // applies finalValues + fires onComplete
 *        });
 *        // 6b. Tear down blockers + cancel their timers
 *        this.blockers.forEach((b) => { b.timer.remove(); b.rect.destroy(); });
 *        this.blockers = [];
 *        // 6c. Wake pending waitForSkip awaiters
 *        const resolvers = this.skipResolvers;
 *        this.skipResolvers = [];
 *        resolvers.forEach((r) => r());
 *      }
 *
 *    The order matters:
 *    - Tweens first (so onComplete handlers can settle visual state
 *      before blockers destroy below them).
 *    - Blockers second (rect destroy + timer cancel atomically; Phaser
 *      calls timer callback even after rect.destroy if you forget).
 *    - Resolvers last (they unblock awaiting code which may then
 *      trigger the terminal step transition).
 *
 *    `t.complete()` vs `t.stop()`: complete applies finalValues AND
 *    fires the onComplete callback — so any `tweenPromise`-wrapped
 *    tween resolves as if it had finished naturally. `t.stop()` skips
 *    finalValues. Use complete for one-shot, stop for infinite (where
 *    complete is a no-op anyway).
 *
 * 7. WHY NOT killAll() ?
 *
 *    `this.tweens.killAll()` removes tweens without firing their
 *    onComplete. Any `await tweenPromise(...)` becomes a dangling
 *    Promise — the cinematic awaiter would hang forever. Always use
 *    `complete()`/`stop()` per-tween.
 *
 * 8. SCENE SHUTDOWN INTERPLAY
 *
 *    If the player taps skip → terminal step launches GameScene → this
 *    scene shuts down. The `Phaser.Scenes.Events.SHUTDOWN` event fires
 *    AFTER tweens are killed by Phaser. Anything that adds resources
 *    inside `requestSkip()` should NOT do so — at this point we are
 *    cleaning up, not allocating.
 */
