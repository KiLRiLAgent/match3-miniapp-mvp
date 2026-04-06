/**
 * EncounterBuilder — single point of truth for assembling `CombatContext`
 * from `EncounterDef + PlayerSave + RelationshipState`. Also the SOLE point
 * of combat reward SaveData mutation via `applyResult(raw, encounterDef)`.
 *
 * Flow:
 *   1. CombatBridgeScene calls `build(encounterDef)` → returns frozen CombatContext
 *   2. GameScene runs combat with that context, emits RawCombatResult via callback
 *   3. CombatBridgeScene calls `applyResult(raw, encounterDef)` → mutates SaveData,
 *      returns the applied delta for caller to enrich into CombatResult
 *   4. CombatBridgeScene MUST call `gameState.flush()` after applyResult
 *      (per MITIGATION-3 — bypass autosave debounce on mobile WebView)
 *
 * RISK-8 hardening (MITIGATION-6): runtime imports limited to core/GameState,
 * RelationshipSystem, and game/config. All content/types imports are type-only.
 *
 * Phase 1A: no inventory aggregation, no relationship-driven boss modifiers
 * (reserved hooks). Phase 1B will extend `build()` to fold equipment stats
 * into `playerStats` and apply `relationshipSnapshot` modifiers to layered HP.
 */

import { gameState } from "../core/GameState";
import { relationshipSystem } from "./RelationshipSystem";
import { getBossLayerHpArray } from "../../game/config";
import type {
  CombatContext,
  EncounterDef,
  PlayerCombatStats,
  RawCombatResult,
} from "../content/types";
import type { RelationshipDelta, RelationshipState } from "../core/types";

class EncounterBuilder {
  /**
   * Assemble a CombatContext for the given encounter.
   * - Validates encounterDef inputs (throws on invalid layerCount /
   *   baseHpPerLayer / chainBlockedHpRatio).
   * - Computes derived.bossHpMax and derived.bossLayerHpArray via the
   *   refactored `getBossLayerHpArray()` (now accepts optional override params).
   * - Captures playerStats from SaveData (rename hp→hpMax, mp→manaMax).
   * - Captures relationshipSnapshot via deep clone — required because
   *   RelationshipSystem.getState() returns a LIVE reference for met
   *   characters (see RelationshipSystem.ts:55-58 JSDoc).
   * - Returns shallow-frozen context (DeepReadonly enforces compile-time
   *   immutability for nested structures).
   */
  build(encounterDef: EncounterDef): CombatContext {
    const def = encounterDef.bossStats;
    if (def.layerCount <= 0) {
      throw new Error(
        `EncounterBuilder: invalid layerCount ${def.layerCount} in ${encounterDef.id}`,
      );
    }
    if (def.baseHpPerLayer <= 0) {
      throw new Error(
        `EncounterBuilder: invalid baseHpPerLayer ${def.baseHpPerLayer} in ${encounterDef.id}`,
      );
    }
    if (encounterDef.chains) {
      const r = encounterDef.chains.chainBlockedHpRatio;
      if (r < 0 || r > 1) {
        throw new Error(
          `EncounterBuilder: invalid chainBlockedHpRatio ${r} in ${encounterDef.id}`,
        );
      }
    }

    const layerHpArray = getBossLayerHpArray(
      def.layerCount,
      def.baseHpPerLayer,
      def.layerMultipliers,
    );
    const bossHpMax = layerHpArray.reduce((sum, hp) => sum + hp, 0);

    const save = gameState.get();
    const playerStats: PlayerCombatStats = {
      hpMax: save.player.stats.hp,
      manaMax: save.player.stats.mp,
      physAttack: save.player.stats.physAttack,
      magAttack: save.player.stats.magAttack,
      crit: save.player.stats.crit,
    };

    // Deep clone — relationshipSystem.getState() returns LIVE reference for
    // met characters, and decisionLog is an array that must not alias.
    const liveRelationship = relationshipSystem.getState(encounterDef.characterId);
    const relationshipSnapshot: RelationshipState = {
      ...liveRelationship,
      decisionLog: liveRelationship.decisionLog.map(entry => ({
        ...entry,
        delta: { ...entry.delta },
      })),
    };

    // Phase 1B hook: relationshipSnapshot.cynicism > 40 → boost layer HP, etc.

    return Object.freeze({
      encounterId: encounterDef.id,
      characterId: encounterDef.characterId,
      encounterDef: Object.freeze({ ...encounterDef }),
      playerStats: Object.freeze(playerStats),
      derived: Object.freeze({
        bossHpMax,
        bossLayerHpArray: Object.freeze([...layerHpArray]) as readonly number[],
      }),
      relationshipSnapshot: Object.freeze(relationshipSnapshot),
    }) as CombatContext;
  }

  /**
   * Apply combat result to SaveData. SOLE point of combat reward mutation.
   * Called from CombatBridgeScene.handleCombatComplete after GameScene emits
   * RawCombatResult. Returns the relationship delta that was applied (for
   * caller to enrich into CombatResult).
   *
   * MITIGATION-3: caller MUST call `gameState.flush()` immediately after
   * this returns to bypass the 2-second autosave debounce on mobile WebView.
   */
  applyResult(raw: RawCombatResult, encounterDef: EncounterDef): RelationshipDelta {
    const delta: RelationshipDelta = encounterDef.relationshipImpact
      ? raw.victory
        ? { ...encounterDef.relationshipImpact.winDelta }
        : { ...encounterDef.relationshipImpact.loseDelta }
      : {};

    if (Object.keys(delta).length > 0) {
      relationshipSystem.applyDelta(encounterDef.characterId, delta);
      relationshipSystem.logDecision(
        encounterDef.characterId,
        "combat",
        raw.encounterId,
        raw.victory
          ? `Victory in ${encounterDef.name} (${raw.chainsBroken} chains broken)`
          : `Defeat in ${encounterDef.name}`,
        delta,
      );
    }

    if (raw.victory) {
      gameState.patch((save) => {
        save.player.xp += encounterDef.rewards.xp;
        save.inventory.gold += encounterDef.rewards.gold;
        save.stats.combatsWon += 1;
        if (!save.story.completedEncounters.includes(encounterDef.id)) {
          save.story.completedEncounters.push(encounterDef.id);
        }
      });
    } else {
      gameState.patch((save) => {
        save.stats.combatsLost += 1;
      });
    }

    return delta;
  }
}

export const encounterBuilder = new EncounterBuilder();
