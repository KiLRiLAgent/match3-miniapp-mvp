/**
 * BuffSystem — singleton, applies active arena run buffs to player stats.
 *
 * Phase 2A scope: pure read-side projection. `applyToStats` returns a NEW
 * `PlayerStats` object — never mutates the input or any save state. When
 * `arena.activeRun === null` (no run in progress, story fights, plain hub
 * activity) the function returns the input unchanged so non-arena flow is
 * untouched (DECISIONS R2, R3 RISK mitigation).
 *
 * Wired into `EncounterBuilder.build()` via task #9 — single-line hook so
 * non-arena fights see ZERO behavior change. Buffs disappear automatically
 * when `arenaSystem.completeRun()` / `abortRun()` clears `activeRun`.
 *
 * Effect-type runtime support split (mirrors `BuffDef` doc in
 * `src/v2/content/buffs/index.ts`):
 *
 *   FULLY APPLIED in `applyToStats`:
 *     - addPhysAttack, addMagAttack, addMaxHp, addMaxMp, addCrit
 *     - physPerFightSurvived (accumulator: scaled by floors cleared since
 *       buff was picked)
 *
 *   READ ELSEWHERE:
 *     - extraReward — surfaced via `getExtraRewardCount()` for ArenaRewardScene
 *
 *   STUBBED (Phase 2B):
 *     - addMpRegen      (needs GameScene per-turn hook)
 *     - damageReduction (needs damage pipeline hook)
 *     - reviveOnDeath   (needs GameScene defeat hook)
 *
 * RISK-8 hardening: pure logic, no Phaser imports. Allowed runtime imports:
 * `../core/GameState`, `../content/buffs`. Allowed type imports: `../core/types`,
 * `../content/types`.
 */

import { gameState } from "../core/GameState";
import { BUFFS } from "../content/buffs";
import type { PlayerStats } from "../core/types";
import type { BuffEffectType } from "../content/types";

class BuffSystem {
  /**
   * Project active arena run buffs onto a base PlayerStats. Returns a NEW
   * object — never mutates the input. No-op (returns input unchanged) when
   * there is no active arena run, so EncounterBuilder can call this
   * unconditionally for every encounter.
   */
  applyToStats(base: PlayerStats): PlayerStats {
    const save = gameState.get();
    const run = save.arena.activeRun;
    if (!run) return base;

    const result: PlayerStats = { ...base };
    for (const activeBuff of run.activeBuffs) {
      const def = BUFFS[activeBuff.buffDefId];
      if (!def) continue;
      this.applySingleBuff(
        def.effectType,
        def.value,
        result,
        activeBuff.sourceFightFloor,
        run.floor,
      );
    }
    return result;
  }

  /**
   * Human-readable list of active buffs for ArenaRunScene's UI strip. Returns
   * an empty array when there is no active run. Stale ids (BuffDef removed
   * from registry between save and load) are silently filtered out.
   */
  getActiveBuffsForDisplay(): Array<{ name: string; description: string }> {
    const save = gameState.get();
    if (!save.arena.activeRun) return [];
    return save.arena.activeRun.activeBuffs
      .map((b) => BUFFS[b.buffDefId])
      .filter((def): def is NonNullable<typeof def> => def != null)
      .map((def) => ({ name: def.name, description: def.description }));
  }

  /**
   * Sum of `value` across all active `extraReward` buffs. Read by
   * ArenaRewardScene to expand the choice list (e.g. 4 instead of 3).
   * Returns 0 when there is no active run.
   */
  getExtraRewardCount(): number {
    const save = gameState.get();
    if (!save.arena.activeRun) return 0;
    let total = 0;
    for (const activeBuff of save.arena.activeRun.activeBuffs) {
      const def = BUFFS[activeBuff.buffDefId];
      if (def?.effectType === "extraReward") total += def.value;
    }
    return total;
  }

  private applySingleBuff(
    effectType: BuffEffectType,
    value: number,
    target: PlayerStats,
    sourceFightFloor: number,
    currentFloor: number,
  ): void {
    switch (effectType) {
      case "addPhysAttack":
        target.physAttack += value;
        return;
      case "addMagAttack":
        target.magAttack += value;
        return;
      case "addMaxHp":
        target.hp += value;
        return;
      case "addMaxMp":
        target.mp += value;
        return;
      case "addCrit":
        target.crit += value;
        return;
      case "physPerFightSurvived": {
        // Accumulator: each floor cleared AFTER picking the buff adds `value`
        // to phys attack. Buff picked on floor 1, fighting floor 4 = 3 stacks.
        // Defensive max(0, ...) guards against any out-of-order edge case.
        const fightsSurvived = Math.max(0, currentFloor - sourceFightFloor);
        target.physAttack += value * fightsSurvived;
        return;
      }
      case "addMpRegen":
      case "damageReduction":
      case "extraReward":
      case "reviveOnDeath":
        // Phase 2A: extraReward is surfaced via getExtraRewardCount() above;
        // the other three need GameScene integration and ship in Phase 2B.
        // Empty case keeps the switch exhaustive on BuffEffectType so adding
        // a new effect type produces a TypeScript error here.
        return;
    }
  }
}

export const buffSystem = new BuffSystem();
