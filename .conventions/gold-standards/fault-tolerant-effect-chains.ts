/**
 * GOLD STANDARD: Fault-tolerant vs atomic effect chains
 *
 * When iterating over a list of mutations to persistent state, the right
 * concurrency model depends on whether the effects are semantically
 * INDEPENDENT or must succeed-or-fail TOGETHER. Phase 1C canonized both
 * patterns: DialogueRunner.applyEffects is explicitly fault-tolerant; inventory
 * and relationship mutations are explicitly atomic. Pick the model that
 * matches the data's invariants — do NOT default to either pattern blindly.
 *
 * Authoritative sources:
 *   src/v2/systems/DialogueRunner.ts  (fault-tolerant applyEffects)
 *   src/v2/systems/InventorySystem.ts (atomic removeItem)
 *   src/v2/systems/RelationshipSystem.ts (atomic logDecision trim+push+cap)
 *   DECISIONS.md R1 (applyEffects fault-tolerant), R7 (SLOT_ORDER)
 *
 * 1. DECISION RUBRIC — which pattern applies?
 *
 *    Ask: if effect N throws mid-loop, is the post-state still coherent?
 *
 *     - YES → fault-tolerant loop: effects 1..N-1 stay, N logs + emits, N+1..M
 *             continue. The data model tolerates partial application.
 *     - NO  → atomic patch: wrap ALL mutations in a single `gameState.patch`
 *             so persistence sees either pre-state or post-state, never an
 *             intermediate.
 *
 *    DialogueRunner.applyEffects is YES: `addXp 10` + `setFlag "act1:done"`
 *    are independent. A failed `setFlag` does not corrupt the `addXp`.
 *
 *    InventorySystem.removeItem is NO: removing an `inventory.items` entry
 *    without cleaning up `inventory.equipped` leaves a dangling equipped id
 *    pointing at a deleted instance. The next `getEquipped()` would return
 *    null while the equipped map still "thinks" the slot is filled.
 *
 * 2. FAULT-TOLERANT PATTERN — canonical shape
 *
 *    Per-effect try/catch wraps the SINGLE call, not the outer loop. Failed
 *    effects log with the full `(registry, entity, node, effect)` tuple and
 *    emit a typed `contentError` on eventBus so the Toast wiring can surface
 *    a non-blocking warning. The loop continues unconditionally.
 *
 *      // src/v2/systems/DialogueRunner.ts
 *      private applyEffects(effects: EffectExpr[]): void {
 *        for (const effect of effects) {
 *          try {
 *            this.applySingleEffect(effect);
 *          } catch (err) {
 *            const message = err instanceof Error ? err.message : String(err);
 *            console.error(
 *              `DialogueRunner: effect '${effect.type}' failed in dialogue ` +
 *                `'${this.graph.id}' node '${this.currentNodeId}': ${message}`,
 *            );
 *            eventBus.emit("contentError", {
 *              source: "dialogue-effect",
 *              dialogueId: this.graph.id,
 *              nodeId: this.currentNodeId,
 *              detail: `${effect.type}: ${message}`,
 *            });
 *          }
 *        }
 *      }
 *
 *    Invariants:
 *     - EACH effect commits its OWN `gameState.patch`. The outer loop never
 *       wraps the batch in a single patch — one throw would roll back the
 *       whole chain, defeating the point.
 *     - The error includes the triple (dialogueId, nodeId, effectType) so
 *       authors can jump directly to the broken content.
 *     - `contentError` flows through eventBus → Toast wiring → active scene.
 *     - DialogueScene NEVER sees the throw; dialogue flow is not interrupted.
 *
 *    Documented author contract (DECISIONS R1):
 *    **Effects are INDEPENDENT.** Do NOT author dialogue chains that require
 *    ordered atomicity (e.g. "addItem, then setFlag that a conditional check
 *    reads"). If Phase 3 AI integration needs ordered atomicity, revisit the
 *    decision and introduce per-dialogue transactions — DO NOT bolt retry
 *    logic onto this loop.
 *
 * 3. ATOMIC PATTERN — canonical shape
 *
 *    A single `gameState.patch` wraps ALL mutations. The patch's callback
 *    runs synchronously; if it throws, nothing is committed. Persistence sees
 *    the state either before or after, never an intermediate.
 *
 *    Example A — inventory remove (R7 SLOT_ORDER iteration):
 *
 *      // src/v2/systems/InventorySystem.ts
 *      const SLOT_ORDER: readonly ItemSlot[] = ["weapon", "armor", "accessory"];
 *
 *      removeItem(instanceId: string): boolean {
 *        const save = gameState.get();
 *        const exists = save.inventory.items.some((it) => it.id === instanceId);
 *        if (!exists) return false;
 *
 *        gameState.patch((s) => {
 *          // Filter items AND clean equipped slots in the SAME patch.
 *          s.inventory.items = s.inventory.items.filter(
 *            (it) => it.id !== instanceId,
 *          );
 *          for (const slot of SLOT_ORDER) {
 *            if (s.inventory.equipped[slot] === instanceId) {
 *              delete s.inventory.equipped[slot];
 *            }
 *          }
 *        });
 *        return true;
 *      }
 *
 *    Invariants:
 *     - `.some()` existence check runs OUTSIDE the patch — a miss returns
 *       false without entering the mutator at all.
 *     - Single `gameState.patch` wraps BOTH mutations. An observer cannot
 *       see a state where items[] has been filtered but equipped[] still
 *       points at the deleted id.
 *     - Returns a clear boolean for the caller ("was anything removed?").
 *
 *    Example B — decisionLog trim+push+cap (age-trim → push → count-trim):
 *
 *      // src/v2/systems/RelationshipSystem.ts
 *      const DECISION_LOG_LIMIT = 50;
 *      const DECISION_LOG_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
 *
 *      logDecision(characterId, kind, ref, summary, delta): void {
 *        gameState.patch((save) => {
 *          const rel = save.relationships[characterId];
 *          if (!rel) return;
 *
 *          // Defensive ?? [] for old saves that may lack the field.
 *          const existingLog = rel.decisionLog ?? [];
 *
 *          const now = Date.now();
 *          const minTs = now - DECISION_LOG_MAX_AGE_MS;
 *          const ageTrimmed = existingLog.filter((entry) => entry.ts >= minTs);
 *
 *          ageTrimmed.push({ ts: now, kind, ref, summary, delta });
 *
 *          rel.decisionLog =
 *            ageTrimmed.length > DECISION_LOG_LIMIT
 *              ? ageTrimmed.slice(-DECISION_LOG_LIMIT)
 *              : ageTrimmed;
 *        });
 *      }
 *
 *    Invariants:
 *     - All three operations (filter, push, slice) commit as one unit.
 *     - Order matters: age-trim BEFORE push (so the new entry is never
 *       eligible for same-call eviction), count-trim AFTER push (so
 *       `slice(-N)` keeps the new tail).
 *     - Defensive `?? []` handles legacy saves without the field.
 *     - Uses `Date.now()` (not `new Date().getTime()`).
 *
 * 4. WHY NOT FULL TRANSACTIONALITY FOR EFFECTS
 *
 *    A snapshot-and-rollback approach would clone SaveData at the top of
 *    applyEffects and restore on any throw. Costs:
 *
 *     - Deep-clone every call site (~hundreds of KB for a mature save)
 *     - Every system that patches via `gameState.patch` must be rollback-aware
 *     - No meaningful benefit for the current content model — effects are
 *       additive (add XP, set flag, add item). A half-applied chain is still
 *       coherent state.
 *
 *    The tradeoff is documented: **dialogue effects are INDEPENDENT. If
 *    authors need ordered atomicity, they use a single atomic-patch system
 *    call (InventorySystem, RelationshipSystem) instead of chaining dialogue
 *    effects.** Phase 3 can revisit if AI-generated content introduces effect
 *    sequences where ordering is load-bearing.
 *
 * 5. WHEN THE RUBRIC IS AMBIGUOUS — default to atomic
 *
 *    If you cannot confidently answer "is post-state still coherent after a
 *    mid-chain throw?", default to the atomic pattern. It's easier to
 *    convert atomic → fault-tolerant later (once you've confirmed the
 *    independence invariant) than to untangle a half-applied state corruption
 *    in production.
 *
 * 6. WHERE THE FAULT-TOLERANT PATTERN APPLIES
 *
 *    Beyond DialogueRunner.applyEffects, the same per-item try/catch idiom
 *    is correct for:
 *
 *     - Content validator aggregation (see
 *       `.conventions/gold-standards/content-validation.ts` §2 — collect all
 *       errors and warnings, never fail-fast)
 *     - Match-3 cascade resolution loops — one clear failing should not
 *       abort the cascade (v1 `resolveBoard`)
 *     - EventBus handler dispatch — `EventBus.emit` wraps each subscriber
 *       in its own try/catch so a broken listener cannot kill others on the
 *       same event (see `src/v2/core/EventBus.ts` emit)
 *
 * 7. WHERE THE ATOMIC PATTERN APPLIES
 *
 *    Any mutation that touches MULTIPLE fields whose invariants must stay in
 *    lockstep:
 *
 *     - InventorySystem.removeItem (items + equipped)
 *     - InventorySystem.equip (equipped slot + implicit unequip of previous)
 *     - RelationshipSystem.logDecision (trim + push + cap)
 *     - RelationshipSystem.applyDelta (empathy + dominance + cynicism +
 *       affinity recompute)
 *     - SaveManager.importJson post-shape mutations (orphan cleanup +
 *       lastSavedAt clamp) — all via `migrate()` then single save
 *
 * 8. ANTI-PATTERNS
 *
 *     - DO NOT wrap an outer loop in a single try/catch hoping to get
 *       "atomic effects" — one throw kills the rest of the batch without
 *       rolling back the already-committed effects. That's worse than both
 *       fault-tolerant (because later effects are silently dropped) AND
 *       atomic (because earlier effects are silently committed).
 *     - DO NOT wrap individual effects in try/catch INSIDE a single
 *       `gameState.patch` — the caught error does not roll back the mutations
 *       the effect already made. If you want atomicity, put the whole loop
 *       inside the patch and let the throw propagate.
 *     - DO NOT silently `console.error` a fault in the fault-tolerant loop
 *       without also emitting `contentError` — the player needs feedback
 *       (via Toast), not just the dev console.
 *     - DO NOT introduce a blanket "avoid non-atomic" rule as a top-level
 *       policy. Fault-tolerance is the CORRECT choice when effects are
 *       independent — a blanket rule would contradict R1.
 */
