# Verification Plan
## Feature: Fix screen freeze + LayeredMeter corner artifacts

## Build & Types
- [ ] `npm run build` passes (TypeScript strict + Vite production build, emits to `docs/`)
- [ ] No new TypeScript errors

## Spec Checks
- [ ] File `src/scenes/GameScene.ts` contains `try` and `finally` near `showPerkSelection` body (guaranteed UI cleanup)
- [ ] File `src/scenes/GameScene.ts` `activateSkill` contains `.catch(` attached to `processPerks()` invocation (no fire-and-forget)
- [ ] File `src/scenes/GameScene.ts` `finishPlayerTurn` has `try` / `catch` wrapping `executeBossAbility` call
- [ ] File `src/scenes/GameScene.ts` `withCutscene` has `try` / `finally` wrapping `logic()` with boss-layer alpha restoration in finally
- [ ] File `src/ui/LayeredMeter.ts` exports a private `fillRadius` helper method
- [ ] File `src/ui/LayeredMeter.ts` `fillRadius` uses `this.widthPx - this.radius` threshold (not just `- 0.5`)
- [ ] File `src/ui/LayeredMeter.ts` `fillRadius` has `Math.min(` for effective-radius clamp on narrow fills
- [ ] Files `src/ui/LayeredMeter.ts` AND `src/ui/Meter.ts` do NOT contain `setMask(`, `createGeometryMask(`, or `createBitmapMask(`
- [ ] `.conventions/gold-standards/phaser-animation.ts` contains updated async-error-recovery section
- [ ] `.conventions/gold-standards/ui-component.ts` contains updated `fillRadius()` helper description with three cases
- [ ] `docs/` directory has been rebuilt (timestamp newer than last src/ commit) and staged in git

## Human Checks
- [ ] **Manual gameplay test — Bug 1 (screen freeze):** Start game, use PowerStrike or any skill that crosses a boss layer boundary → pick perk → try to swap tiles immediately. Tiles MUST be swappable.
  → Repeat 5-10 times with different skills to stress-test the busy flag recovery
  → If tiles stop responding at ANY point = FAIL

- [ ] **Manual gameplay test — Bug 2 (bar full state):** Fresh game, boss HP at 100%. Look at the bar — all four corners should be rounded, no visible square edges above or at edges.
  → Make one tile match (lose ~1% HP) — bar should still look clean, no corner sticking out above the rounded border

- [ ] **Manual gameplay test — Bug 2 (bar nearly empty in layer):** Keep attacking until a single layer is nearly depleted (~5% HP left in current layer). Look at the narrow remaining fill.
  → Should appear as clean pill shape, not artifacts/square corners

- [ ] **Manual gameplay test — Bug 2 (layer transition):** Keep attacking and watch the transition between two layers. The transition should be visually smooth with no corner glitches.

- [ ] **Manual gameplay test — cutscene error recovery:** Trigger a boss ability cutscene (wait for shield or power strike). After cutscene ends, boss art should be fully visible (alpha 1).

- [ ] **No regressions:** Intro scene, tutorial, hammer mode, victory/defeat screens all still work as before.
