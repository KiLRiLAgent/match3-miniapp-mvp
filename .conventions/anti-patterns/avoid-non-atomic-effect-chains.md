# Anti-Pattern: Non-Atomic Effect Chains

When iterating over a list of effects / operations that mutate persistent state,
never let a single failure abort the whole chain without isolating the caught
error. Either make the chain ALL-or-nothing (snapshot + rollback), or wrap each
step in its own `try/catch` so later steps still run.

Phase 1C chose per-effect fault tolerance for `DialogueRunner.applyEffects`
after a post-mortem: a mid-chain throw would strand half-applied deltas and
block the dialogue from advancing. Full transactionality (snapshot SaveData,
restore on throw) is overkill for the current scale. The approved pattern is:

- Each effect commits its own `gameState.patch` independently
- If effect `N` throws, effects `1..N-1` are already committed and effects
  `N+1..M` continue
- Failed effects log via `console.error` and emit `contentError` on eventBus
- Dialogue flow is NEVER interrupted by an effect failure

**This is DOCUMENTED Phase 1C behaviour**, not a bug. Content authors must
treat effects as independent — do NOT write effect chains that require ordered
atomicity (e.g. "addItem, then setFlag that a conditional check reads").

## WRONG — single throw aborts the chain

```typescript
private applyEffects(effects: EffectExpr[]): void {
  for (const effect of effects) {
    this.applySingleEffect(effect);  // one throw → remaining effects skipped
  }
}
```

If effect `[2]` throws (e.g. `addItem` for a def the registry removed), effect
`[3]` `setFlag` never runs, and the dialogue's `end` node handler never reaches
the flag check that would unlock Act 2. Player is stranded, and the error
surfaces only in console — player sees nothing.

## CORRECT — per-effect try/catch + telemetry

```typescript
/**
 * Phase 1C R1: per-effect try-catch. Failed effects log + emit contentError;
 * loop continues (partial-apply is documented Phase 1C behaviour).
 */
private applyEffects(effects: EffectExpr[]): void {
  for (const effect of effects) {
    try {
      this.applySingleEffect(effect);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `DialogueRunner: effect '${effect.type}' failed in dialogue '${this.graph.id}' node '${this.currentNodeId}': ${message}`,
      );
      eventBus.emit("contentError", {
        source: "dialogue-effect",
        dialogueId: this.graph.id,
        nodeId: this.currentNodeId,
        detail: `${effect.type}: ${message}`,
      });
    }
  }
}
```

- The `try/catch` wraps the SINGLE call, not the whole loop.
- The error message includes the triple `(dialogueId, nodeId, effectType)` so
  authors can jump directly to the broken content.
- The `eventBus.emit("contentError", ...)` signal routes to the Toast wiring
  so the player gets a non-blocking warning.

## Why not full transactionality

A snapshot+restore approach would clone SaveData at the top of `applyEffects`
and restore on any throw. Costs:

- Deep-clone every call site (~hundreds of KB for a mature save)
- Every system that patches via `gameState.patch` must be rollback-aware
- No meaningful benefit for the current content model (effects are additive:
  add XP, set flag, add item — a half-applied chain is still coherent state)

The tradeoff is documented: **effects are INDEPENDENT. Do not author chains
that need ordered atomicity.** If Phase 3 AI integration adds effects where
atomicity is load-bearing, revisit the decision and introduce per-dialogue
transactions.

## Where the pattern applies

Use per-item try/catch for ANY loop over authored/user-provided data that can
fail at runtime:

- Dialogue effect chains (above)
- Content validators — aggregate all errors, never fail-fast
  (see `.conventions/gold-standards/content-validation.ts` §2)
- Cascade loops in match-3 resolution — individual clears should not abort the
  cascade resolve
- EventBus handler dispatch — `EventBus.emit` wraps each subscriber in its
  own try/catch so a broken listener cannot kill others on the same event

## Related

- `src/v2/systems/DialogueRunner.ts` `applyEffects` (canonical implementation)
- `src/v2/core/EventBus.ts` `emit` (same pattern for event handlers)
- `.conventions/gold-standards/content-validation.ts` (aggregation rule)
- DECISIONS.md R1 — "applyEffects is fault-tolerant, NOT transactional"
