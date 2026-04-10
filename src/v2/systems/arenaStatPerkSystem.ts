/**
 * arenaStatPerkSystem — applies accumulated stat perks to player stats.
 *
 * Mirrors BuffSystem.applyToStats pattern: returns a NEW PlayerStats object,
 * never mutates input. Called in EncounterBuilder.build() AFTER
 * buffSystem.applyToStats(). When statPerkCounts is empty or no active run,
 * returns input unchanged.
 *
 * Handles 5 stat types: hp, mp, physAttack, magAttack, crit.
 * stat_start_mp is handled separately — populates `manaStart` on
 * PlayerCombatStats (optional field added in Phase 2B).
 *
 * Zero Phaser imports. Zero SaveData writes.
 */

import { STAT_PERKS } from "../content/perks/stat-perks";
import type { PlayerStats } from "../core/types";

/**
 * Apply stat perk bonuses to base player stats. Returns a NEW object.
 * No-op when statPerkCounts is empty.
 */
export function applyStatPerksToStats(
  base: PlayerStats,
  statPerkCounts: Record<string, number>,
): PlayerStats {
  const counts = statPerkCounts;
  if (!counts || Object.keys(counts).length === 0) return base;

  const result: PlayerStats = { ...base };

  for (const perk of STAT_PERKS) {
    const count = counts[perk.id] ?? 0;
    if (count <= 0) continue;
    const bonus = perk.value * count;

    switch (perk.stat) {
      case "hp":
        result.hp += bonus;
        break;
      case "mp":
        result.mp += bonus;
        break;
      case "physAttack":
        result.physAttack += bonus;
        break;
      case "magAttack":
        result.magAttack += bonus;
        break;
      case "crit":
        result.crit += bonus;
        break;
      case "startMp":
        // Handled separately in EncounterBuilder via manaStart field
        break;
    }
  }

  return result;
}

/**
 * Compute total starting MP bonus from stat_start_mp picks.
 * Used by EncounterBuilder to populate PlayerCombatStats.manaStart.
 */
export function getStartMpBonus(statPerkCounts: Record<string, number>): number {
  const count = statPerkCounts["stat_start_mp"] ?? 0;
  if (count <= 0) return 0;
  const perk = STAT_PERKS.find((p) => p.id === "stat_start_mp");
  return perk ? perk.value * count : 0;
}
