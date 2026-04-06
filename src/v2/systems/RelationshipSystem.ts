/**
 * RelationshipSystem — single source of truth for character relationship
 * mutations. All writes go through `gameState.patch` so persistence is
 * guaranteed and downstream consumers (DialogueRunner, EncounterBuilder,
 * PostCombatScene) never touch SaveData fields directly.
 *
 * RISK-8 hardening (MITIGATION-6): this module MUST NOT runtime-import from
 * `../content/*` and MUST NOT import from `./DialogueRunner` in any form
 * (type or runtime). Allowed runtime imports: `../core/GameState`. Allowed
 * type imports: `../core/types`. DialogueRunner depends on this module
 * (one-way edge) — the inverse direction would create a cycle.
 */

import { gameState } from "../core/GameState";
import type { RelationshipDelta, RelationshipState } from "../core/types";

/** Inclusive bounds for empathy / dominance / cynicism axes. */
const RELATIONSHIP_MIN = 0;
const RELATIONSHIP_MAX = 100;

/** Hard cap on `RelationshipState.decisionLog` length to keep SaveData small. */
const DECISION_LOG_LIMIT = 50;

/** Three relationship axes — used by `hasReached` for gating checks. */
export type RelationshipAxis = "empathy" | "dominance" | "cynicism";

/**
 * Default state injected when a character is queried before any interaction.
 * `decisionLog` is intentionally created fresh per call so callers cannot
 * mutate the shared default array.
 */
const DEFAULT_STATE: Omit<RelationshipState, "decisionLog"> = {
  empathy: 0,
  dominance: 0,
  cynicism: 0,
  affinity: 0,
  romanced: false,
};

function clampAxis(value: number): number {
  if (value < RELATIONSHIP_MIN) return RELATIONSHIP_MIN;
  if (value > RELATIONSHIP_MAX) return RELATIONSHIP_MAX;
  return value;
}

class RelationshipSystem {
  /**
   * Get the current state for a character.
   *
   * - **Never-met characters**: returns a fresh default snapshot. The default
   *   `decisionLog: []` is allocated per call so callers cannot mutate the
   *   shared default.
   * - **Met characters**: returns the LIVE reference inside SaveData. Direct
   *   mutation of the returned object IS persisted at the next autosave —
   *   use `applyDelta` for intentional changes. Callers that need an
   *   immutable snapshot (e.g. EncounterBuilder capturing pre-combat state
   *   for `CombatContext.relationshipSnapshot`) MUST clone explicitly:
   *   `{ ...state, decisionLog: [...state.decisionLog] }`.
   */
  getState(characterId: string): RelationshipState {
    const save = gameState.get();
    const existing = save.relationships[characterId];
    if (existing) return existing;
    return { ...DEFAULT_STATE, decisionLog: [] };
  }

  /**
   * Apply a relationship delta and persist via `gameState.patch`. Lazily
   * initializes the character's record on first interaction (sets `metAt`),
   * clamps each axis into [0..100], and recomputes `affinity` as the average
   * of empathy + dominance.
   */
  applyDelta(characterId: string, delta: RelationshipDelta): void {
    gameState.patch((save) => {
      let rel = save.relationships[characterId];
      if (!rel) {
        rel = { ...DEFAULT_STATE, decisionLog: [], metAt: Date.now() };
        save.relationships[characterId] = rel;
      }
      rel.empathy = clampAxis(rel.empathy + (delta.empathy ?? 0));
      rel.dominance = clampAxis(rel.dominance + (delta.dominance ?? 0));
      rel.cynicism = clampAxis(rel.cynicism + (delta.cynicism ?? 0));
      rel.affinity = Math.round((rel.empathy + rel.dominance) / 2);
      rel.lastInteraction = Date.now();
    });
  }

  /**
   * Convenience gating check — returns true if the named axis has reached or
   * exceeded `threshold`. Used by dialogue choices, encounter unlocks, and
   * post-combat narrative branches.
   */
  hasReached(
    characterId: string,
    axis: RelationshipAxis,
    threshold: number,
  ): boolean {
    const state = this.getState(characterId);
    return state[axis] >= threshold;
  }

  /** Mark a character as romanced — terminal flag set by Act 5 endings. */
  markRomanced(characterId: string): void {
    gameState.patch((save) => {
      const rel = save.relationships[characterId];
      if (rel) rel.romanced = true;
    });
  }

  /**
   * Append a decision log entry for AI prompt context (Phase 3). Capped at
   * DECISION_LOG_LIMIT entries — older entries are dropped via `slice(-N)`
   * so SaveData size stays bounded across long playthroughs. No-op if the
   * character record does not yet exist (caller should `applyDelta` first).
   */
  logDecision(
    characterId: string,
    kind: "dialogue" | "combat" | "ai-chat",
    ref: string,
    summary: string,
    delta: RelationshipDelta,
  ): void {
    gameState.patch((save) => {
      const rel = save.relationships[characterId];
      if (!rel) return;
      rel.decisionLog.push({ ts: Date.now(), kind, ref, summary, delta });
      if (rel.decisionLog.length > DECISION_LOG_LIMIT) {
        rel.decisionLog = rel.decisionLog.slice(-DECISION_LOG_LIMIT);
      }
    });
  }
}

export const relationshipSystem = new RelationshipSystem();
