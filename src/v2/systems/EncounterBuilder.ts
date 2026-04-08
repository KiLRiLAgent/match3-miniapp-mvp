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
import { progressionSystem } from "./ProgressionSystem";
import { inventorySystem } from "./InventorySystem";
import { buffSystem } from "./BuffSystem";
import { getBossLayerHpArray } from "../../game/config";
import type {
  CombatContext,
  CombatResult,
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
    // Phase 2A: fold active arena run buffs onto base player stats. When no
    // run is active (story fights, hub activity), buffSystem.applyToStats
    // returns the input unchanged — non-arena fights see ZERO behavior
    // change (DECISIONS R2).
    const buffedStats = buffSystem.applyToStats(save.player.stats);
    const playerStats: PlayerCombatStats = {
      hpMax: buffedStats.hp,
      manaMax: buffedStats.mp,
      physAttack: buffedStats.physAttack,
      magAttack: buffedStats.magAttack,
      crit: buffedStats.crit,
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
   * Apply combat result to SaveData and return the fully-enriched CombatResult.
   *
   * SOLE point of combat reward mutation. Called from
   * CombatBridgeScene.handleCombatComplete after GameScene emits
   * RawCombatResult. Handles all victory-side effects in a deterministic
   * order so consumers never see partial state:
   *
   *   1. Relationship delta + decision log entry (if impact defined)
   *   2. Gold / combatsWon / completedEncounters (single gameState.patch)
   *   3. XP gain via progressionSystem.applyXpGain — handles multi-level
   *      overflow atomically in its own patch. RISK-2: this is the ONLY
   *      place combat XP is applied — the legacy `save.player.xp +=` line
   *      was removed in Phase 1B.
   *   4. Loot roll from rewards.loot — first entry whose random check
   *      passes wins (per Phase 1B spec). Uses inventorySystem.add which
   *      returns null on full backpack → item silently dropped, caller
   *      informed via lootedItems array.
   *
   * Returns a complete CombatResult so CombatBridgeScene can pass it
   * through to PostCombatScene without further spreading (RISK-5: single
   * enrichment path).
   *
   * MITIGATION-3: caller MUST call `gameState.flush()` immediately after
   * this returns to bypass the 2-second autosave debounce on mobile WebView.
   */
  applyResult(raw: RawCombatResult, encounterDef: EncounterDef): CombatResult {
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

    let xpGained = 0;
    let goldGained = 0;
    let leveledUp = false;
    let newLevel = gameState.get().player.level;
    const lootedItems: string[] = [];

    if (raw.victory) {
      // Non-XP victory bookkeeping in one atomic patch.
      gameState.patch((save) => {
        save.inventory.gold += encounterDef.rewards.gold;
        save.stats.combatsWon += 1;
        if (!save.story.completedEncounters.includes(encounterDef.id)) {
          save.story.completedEncounters.push(encounterDef.id);
        }
      });
      goldGained = encounterDef.rewards.gold;

      // XP gain via ProgressionSystem — sole combat-XP entry point.
      const xpResult = progressionSystem.applyXpGain(encounterDef.rewards.xp);
      xpGained = encounterDef.rewards.xp;
      leveledUp = xpResult.leveledUp;
      newLevel = xpResult.newLevel;

      // Loot roll — first entry whose chance passes wins (spec). Failed
      // inventorySystem.add (backpack full, unknown def) drops the item.
      const lootTable = encounterDef.rewards.loot;
      if (lootTable && lootTable.length > 0) {
        for (const entry of lootTable) {
          if (Math.random() < entry.chance) {
            const instance = inventorySystem.add(entry.itemDefId);
            if (instance) {
              lootedItems.push(entry.itemDefId);
            }
            break;
          }
        }
      }
    } else {
      gameState.patch((save) => {
        save.stats.combatsLost += 1;
      });
    }

    const result: CombatResult = {
      ...raw,
      appliedDelta: delta,
      xpGained,
      goldGained,
    };
    if (leveledUp) {
      result.leveledUp = true;
      result.newLevel = newLevel;
    }
    if (lootedItems.length > 0) {
      result.lootedItems = lootedItems;
    }
    return result;
  }
}

export const encounterBuilder = new EncounterBuilder();
