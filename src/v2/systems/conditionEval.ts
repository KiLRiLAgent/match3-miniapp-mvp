/**
 * conditionEval — pure free function evaluating a `ConditionExpr` against a
 * SaveData snapshot. Shared by `LocationScene` (hotspot dialogue gating) and
 * intended as the migration target for `DialogueRunner.evaluateCondition`
 * once that runner can be refactored.
 *
 * Per DECISIONS.md section 15 ("conditionEval helper: extracted to
 * `src/v2/systems/conditionEval.ts` (pure function). Both `DialogueRunner` and
 * `LocationScene` call into the same helper.").
 *
 * The function takes a SaveData snapshot and an optional `characterId` (used
 * for relationship axis comparisons — empathyGte/dominanceGte/cynicismGte).
 * If a relationship gate is set but no character context exists, the gate
 * short-circuits to `false` (cannot prove the gate without context).
 *
 * RISK-8 hardening: pure-leaf module. Type-only imports from `../core/types`
 * and `../content/types`. No runtime imports anywhere.
 */

import type { SaveData } from "../core/types";
import type { ConditionExpr } from "../content/types";

/**
 * Evaluate a declarative `ConditionExpr` against a SaveData snapshot.
 *
 * Semantics:
 *  - All fields are optional and AND-combined.
 *  - An empty expression (`{}`) returns `true`.
 *  - `flag` set, `flagEquals` undefined: requires the flag to be truthy.
 *  - `flag` set, `flagEquals` set: requires strict equality with the stored value.
 *  - `empathyGte`/`dominanceGte`/`cynicismGte`: require `characterId` to be
 *    set AND the named axis to be ≥ the threshold. Returns false if no
 *    relationship record exists yet (never-met character).
 *  - `hasItem`: matches by `itemDefId` against any inventory instance.
 */
export function conditionEval(
  c: ConditionExpr,
  save: SaveData,
  characterId?: string,
): boolean {
  if (c.flag !== undefined) {
    const flagValue = save.story.flags[c.flag];
    if (c.flagEquals !== undefined) {
      // AND-combined: bail out only on mismatch — any match must fall
      // through to subsequent gate checks.
      if (flagValue !== c.flagEquals) return false;
    } else if (!flagValue) {
      return false;
    }
  }
  if (c.empathyGte !== undefined) {
    if (!characterId) return false;
    const rel = save.relationships[characterId];
    if (!rel || rel.empathy < c.empathyGte) return false;
  }
  if (c.dominanceGte !== undefined) {
    if (!characterId) return false;
    const rel = save.relationships[characterId];
    if (!rel || rel.dominance < c.dominanceGte) return false;
  }
  if (c.cynicismGte !== undefined) {
    if (!characterId) return false;
    const rel = save.relationships[characterId];
    if (!rel || rel.cynicism < c.cynicismGte) return false;
  }
  if (c.hasItem !== undefined) {
    const has = save.inventory.items.some((i) => i.itemDefId === c.hasItem);
    if (!has) return false;
  }
  return true;
}
