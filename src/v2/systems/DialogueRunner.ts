/**
 * DialogueRunner — pure-logic interpreter for `DialogueGraph`.
 *
 * Tracks the current node, advances on user choice, evaluates conditions,
 * applies effects, and substitutes template variables. Has ZERO Phaser
 * dependencies — DialogueScene wraps this with rendering, but the runner
 * itself is fully unit-testable.
 *
 * Key architectural notes (per DECISIONS.md):
 *  - REFINEMENT 5: choices are addressed via `selectChoiceById(id)`. The
 *    legacy `selectChoice(originalIndex)` API is OBSOLETE — choice indices
 *    are unstable across content edits.
 *  - Section 6: relationship deltas are DELEGATED to `relationshipSystem`
 *    via `applyDelta` — no duplicate clamp/affinity logic here.
 *  - Section 8: constructor accepts optional `startNodeId` to enable
 *    PostCombatScene → DialogueScene resume on a post-battle epilogue node.
 *  - Section 16: there is no `unlockAct` effect — content authors use
 *    `setFlag` with namespaced keys like `"lilana:act1:done"`.
 *
 * RISK-8 hardening (MITIGATION-6): content/* imports MUST be `import type`.
 * Allowed runtime imports: `../core/GameState` and `./RelationshipSystem`.
 */

import { gameState } from "../core/GameState";
import { eventBus } from "../core/EventBus";
import { relationshipSystem } from "./RelationshipSystem";
import type {
  ConditionExpr,
  DialogueChoice,
  DialogueGraph,
  DialogueNode,
  EffectExpr,
} from "../content/types";

const DEFAULT_PLAYER_NAME = "Падший";

export class DialogueRunner {
  private currentNodeId: string;

  /**
   * @param graph        the dialogue graph to run
   * @param startNodeId  optional override for the starting node — used by
   *                     PostCombatScene to resume on a post-battle epilogue
   *                     node (e.g. `victory_epilogue` / `defeat_epilogue`)
   *                     instead of restarting from `graph.startNode`.
   */
  constructor(
    private readonly graph: DialogueGraph,
    startNodeId?: string,
  ) {
    this.currentNodeId = startNodeId ?? graph.startNode;
  }

  /**
   * Get the current node. Throws if the runner is pointing at a missing
   * node id (programmer error in content authoring or migration).
   */
  current(): DialogueNode {
    const node = this.graph.nodes[this.currentNodeId];
    if (!node) {
      throw new Error(
        `DialogueRunner: node "${this.currentNodeId}" not found in graph "${this.graph.id}"`,
      );
    }
    return node;
  }

  /** True once the runner has reached an `end` node. */
  isFinished(): boolean {
    return this.current().type === "end";
  }

  /**
   * True only when the current node is a `line` with a `next` field.
   * DialogueScene uses this for tap-to-advance gating: a `line` without
   * `next` is the last beat before a choice/battle/end, so tap should
   * surface the next-step UI instead of trying to advance further.
   */
  canAdvance(): boolean {
    const node = this.current();
    return node.type === "line" && node.next !== undefined;
  }

  /**
   * Advance from a `line` node to its `next` target. No-op if `next` is
   * undefined (the line is the terminal beat of its sequence). Throws if
   * called on a non-line node — callers should branch on `current().type`.
   */
  advance(): void {
    const node = this.current();
    if (node.type === "line") {
      if (node.next) this.currentNodeId = node.next;
      return;
    }
    throw new Error(
      `DialogueRunner: cannot advance() from ${node.type} node ${node.id} — ` +
        `use selectChoiceById/reportBattleResult instead`,
    );
  }

  /**
   * Pick a choice by its stable `id` (REFINEMENT 5). Applies the choice's
   * relationship delta via `relationshipSystem.applyDelta` (delegated — no
   * duplicate clamp/affinity logic here) and advances to `choice.next`.
   *
   * Throws if the current node is not a `choice` node, or if no choice
   * with the given id exists. DialogueScene must read the id from the
   * `DialogueChoice` returned by `getAvailableChoices()`.
   */
  selectChoiceById(id: string): void {
    const node = this.current();
    if (node.type !== "choice") {
      throw new Error(
        `DialogueRunner: selectChoiceById on non-choice node ${node.id}`,
      );
    }
    const choice = node.choices.find((c) => c.id === id);
    if (!choice) {
      throw new Error(
        `DialogueRunner: choice id "${id}" not found in node ${node.id}`,
      );
    }
    if (
      this.graph.characterId &&
      choice.delta &&
      Object.keys(choice.delta).length > 0
    ) {
      relationshipSystem.applyDelta(this.graph.characterId, choice.delta);
    }
    this.currentNodeId = choice.next;
  }

  /**
   * Set the next node based on combat outcome. Used by CombatBridgeScene
   * after PostCombatScene completes — the runner resumes on either
   * `node.onVictory` or `node.onDefeat` of the original `battle` node.
   */
  reportBattleResult(victory: boolean): void {
    const node = this.current();
    if (node.type !== "battle") {
      throw new Error(
        `DialogueRunner: reportBattleResult on non-battle node ${node.id}`,
      );
    }
    this.currentNodeId = victory ? node.onVictory : node.onDefeat;
  }

  /**
   * Apply effects attached to the current `end` node. Caller (DialogueScene)
   * must invoke this explicitly when entering the end state — keeping the
   * trigger explicit lets the UI animate the transition first. No-op for
   * non-end nodes.
   */
  applyEndEffects(): void {
    const node = this.current();
    if (node.type !== "end") return;
    if (node.effects) this.applyEffects(node.effects);
  }

  /**
   * Evaluate a condition against the current SaveData snapshot. Used to
   * filter choices and to gate hotspot dialogue selection in LocationScene
   * (LocationScene calls this via a shared free function helper later, but
   * the live runner uses this method).
   *
   * All fields are optional and AND-combined; an empty expression is `true`.
   * Relationship comparisons require `graph.characterId` to be set —
   * otherwise they short-circuit to `false` (cannot prove the gate).
   */
  evaluateCondition(c: ConditionExpr): boolean {
    const save = gameState.get();
    if (c.flag !== undefined) {
      const flagValue = save.story.flags[c.flag];
      if (c.flagEquals !== undefined) {
        // AND-combined: bail out only on mismatch — any match must fall
        // through to subsequent gate checks (empathyGte, hasItem, etc.).
        if (flagValue !== c.flagEquals) return false;
      } else if (!flagValue) {
        return false;
      }
    }
    if (c.empathyGte !== undefined) {
      if (!this.graph.characterId) return false;
      const rel = save.relationships[this.graph.characterId];
      if (!rel || rel.empathy < c.empathyGte) return false;
    }
    if (c.dominanceGte !== undefined) {
      if (!this.graph.characterId) return false;
      const rel = save.relationships[this.graph.characterId];
      if (!rel || rel.dominance < c.dominanceGte) return false;
    }
    if (c.cynicismGte !== undefined) {
      if (!this.graph.characterId) return false;
      const rel = save.relationships[this.graph.characterId];
      if (!rel || rel.cynicism < c.cynicismGte) return false;
    }
    if (c.hasItem !== undefined) {
      const has = save.inventory.items.some(
        (i) => i.itemDefId === c.hasItem,
      );
      if (!has) return false;
    }
    return true;
  }

  /**
   * Substitute template variables in a dialogue line text. Cyrillic-friendly.
   *
   * Tokens:
   *  - `{{playerName}}` → `save.player.name` (falls back to "Падший")
   *  - `{{pronoun:Он/Она/Они}}` → picks one based on `save.player.gender`
   *
   * Note: SpeechBubble `highlights` are matched against the RESOLVED text
   * (post-substitution) — content authors should use literal words in
   * `highlights[].word`, not placeholder tokens.
   */
  resolveText(template: string): string {
    const save = gameState.get();
    const playerName = save.player.name || DEFAULT_PLAYER_NAME;
    let result = template.replace(/\{\{playerName\}\}/g, playerName);
    // Cyrillic-friendly: NOT [a-z]+ — `[^/}]+` allows any character except
    // the slash separator and closing brace.
    result = result.replace(
      /\{\{pronoun:([^/]+)\/([^/]+)\/([^}]+)\}\}/g,
      (_, he: string, she: string, they: string) => {
        const g = save.player.gender;
        if (g === "male") return he;
        if (g === "female") return she;
        return they;
      },
    );
    return result;
  }

  /**
   * Return the choices on the current node, filtered by their `requires`
   * conditions. Returns an empty array if the current node is not a
   * `choice` node. DialogueScene reads `choice.id` from each entry to
   * pass into `selectChoiceById` (REFINEMENT 5 — no `originalIndex` wrap).
   */
  getAvailableChoices(): DialogueChoice[] {
    const node = this.current();
    if (node.type !== "choice") return [];
    return node.choices.filter(
      (c) => !c.requires || this.evaluateCondition(c.requires),
    );
  }

  // ─── private helpers ───────────────────────────────────────────────────

  /**
   * Phase 1C R1: per-effect try-catch. Failed effects log + emit contentError;
   * loop continues (partial-apply is documented Phase 1C behaviour).
   * R15: uses this.graph.id / this.currentNodeId — no dialogueId field.
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

  private applySingleEffect(e: EffectExpr): void {
    switch (e.type) {
      case "setFlag":
        // Defensive: silently no-op if content author forgot key OR value.
        // Writing `undefined` would make StoryFlags.has() return false but
        // leave a phantom in-memory entry — better to skip entirely.
        if (e.key === undefined || e.value === undefined) return;
        gameState.patch((save) => {
          save.story.flags[e.key as string] = e.value as
            | boolean
            | number
            | string;
        });
        return;
      case "addEmpathy":
      case "addDominance":
      case "addCynicism": {
        const charId = e.characterId ?? this.graph.characterId;
        if (!charId) return;
        const axis =
          e.type === "addEmpathy"
            ? "empathy"
            : e.type === "addDominance"
              ? "dominance"
              : "cynicism";
        // Delegate to relationshipSystem to avoid duplicate clamp / affinity
        // recompute logic (DECISIONS.md section 6).
        relationshipSystem.applyDelta(charId, { [axis]: e.amount ?? 0 });
        return;
      }
      case "addXp":
        gameState.patch((save) => {
          save.player.xp += e.amount ?? 0;
        });
        return;
      case "addGold":
        gameState.patch((save) => {
          save.inventory.gold += e.amount ?? 0;
        });
        return;
      case "addItem":
      case "removeItem":
        // Phase 1B — full ItemDatabase wiring lives there. No-op for now.
        return;
      // NOTE: NO `unlockAct` case — DECISIONS.md section 16 removed it.
      // Use `setFlag` with namespaced keys like "lilana:act1:done" instead.
      default:
        assertNever(e.type);
    }
  }
}

function assertNever(value: never): never {
  throw new Error(`DialogueRunner: unexpected effect type ${String(value)}`);
}
