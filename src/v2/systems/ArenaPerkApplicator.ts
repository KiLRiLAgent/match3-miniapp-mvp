/**
 * ArenaPerkApplicator — pure derived view for arena perk effects (Option B).
 *
 * CRITICAL: does NOT mutate SKILL_CONFIG or GAME_PARAMS. Reads SKILL_LEVEL_TABLE
 * as a reference table and computes effective stats locally. GameScene reads
 * computed values via CombatContext, never from globals.
 *
 * Two public functions:
 *  - computeEffectiveSkills — skill stats derived from perkLevels
 *  - computePassiveSnapshot — passive + stat perk effects as a flat snapshot
 *
 * Zero Phaser imports. Zero SKILL_CONFIG writes.
 */

import { SKILL_LEVEL_TABLE } from "../../game/PerkManager";
import type { SkillId } from "../../game/config";
import type { PassivePerkId } from "../content/perks/types";
import { PASSIVE_PERKS } from "../content/perks/passive-perks";
import { STAT_PERKS } from "../content/perks/stat-perks";

// ─────────────────────────────────────────────────────────────────────────────
// Effective skill stats — computed locally, ZERO mutation
// ─────────────────────────────────────────────────────────────────────────────

export interface EffectiveSkillStats {
  unlocked: boolean;
  level: number;
  cost: number;
  cooldown: number;
  damage?: number;
  heal?: number;
  stunTurns?: number;
  hammerPattern?: "single" | "cross" | "square";
}

/**
 * Compute effective skill stats for all 4 skills based on current perk levels.
 * Level 0 = not unlocked. Level 1 = base (index 0 in table). Level N = index N-1.
 *
 * `physAttack` is needed for powerStrike damage calculation (damage = physAttack * multiplier).
 *
 * Returns a snapshot — caller should NOT cache across perk changes.
 */
export function computeEffectiveSkills(
  perkLevels: Record<string, number>,
  physAttack: number,
): Record<SkillId, EffectiveSkillStats> {
  const result = {} as Record<SkillId, EffectiveSkillStats>;
  const skillIds: SkillId[] = ["powerStrike", "stun", "heal", "hammer"];

  for (const skillId of skillIds) {
    const level = perkLevels[skillId] ?? 0;
    if (level <= 0) {
      result[skillId] = {
        unlocked: false,
        level: 0,
        cost: 0,
        cooldown: 0,
      };
      continue;
    }

    const table = SKILL_LEVEL_TABLE[skillId];
    const idx = Math.min(level - 1, table.length - 1);
    const entry = table[idx];

    result[skillId] = {
      unlocked: true,
      level,
      cost: entry.cost,
      cooldown: entry.cooldown,
      damage:
        skillId === "powerStrike" && entry.damage !== undefined
          ? physAttack * entry.damage
          : entry.damage,
      heal: entry.heal,
      stunTurns: entry.stunTurns,
      hammerPattern: entry.hammerPattern,
    };
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Passive snapshot — all 14 effect fields as flat booleans/numbers
// ─────────────────────────────────────────────────────────────────────────────

export interface PassiveSnapshot {
  /** vampire: 5% lifesteal from skill damage */
  lifestealPercent: number;
  /** rage: +15% skill damage when HP < 50% */
  rageDmgMult: number;
  /** rage HP threshold (0.5 = 50%) */
  rageHpThreshold: number;
  /** crit_mastery: +10% crit chance */
  critBonus: number;
  /** bomb_master: +10 bomb damage */
  bombDmgBonus: number;
  /** shield_breaker: 15% chance to ignore boss shield */
  shieldBreakChance: number;
  /** reflect: 20% boss damage reflected back */
  reflectPercent: number;
  /** regeneration: +3 HP per turn */
  regenPerTurn: number;
  /** mana_surge: +20 starting mana per fight */
  manaBonusAtStart: number;
  /** stat_start_mp accumulated: +N starting mana per fight */
  startMpBonus: number;
  /** mana_efficiency: -5 skill cost */
  skillCostReduction: number;
  /** defuser: defuse all bombs when breaking a boss HP layer */
  hasDefuser: boolean;
  /** quick_draw: -1 to all skill cooldowns on first turn of each fight */
  hasQuickDraw: boolean;
  /** explosive_magic: 5+ magic matches create a bomb */
  hasExplosiveMagic: boolean;
}

/**
 * Compute the passive snapshot from taken passives + stat perk counts.
 * All fields default to 0/false when the corresponding perk is not taken.
 */
export function computePassiveSnapshot(
  takenPassives: string[],
  statPerkCounts: Record<string, number>,
): PassiveSnapshot {
  const has = (id: PassivePerkId): boolean => takenPassives.includes(id);

  // Accumulate stat perk bonuses
  let startMpBonus = 0;
  for (const perk of STAT_PERKS) {
    const count = statPerkCounts[perk.id] ?? 0;
    if (perk.id === "stat_start_mp") {
      startMpBonus += perk.value * count;
    }
  }

  return {
    lifestealPercent: has("vampire") ? 5 : 0,
    rageDmgMult: has("rage") ? 1.15 : 1,
    rageHpThreshold: has("rage") ? 0.5 : 0,
    critBonus: has("crit_mastery") ? 10 : 0,
    bombDmgBonus: has("bomb_master") ? 10 : 0,
    shieldBreakChance: has("shield_breaker") ? 0.15 : 0,
    reflectPercent: has("reflect") ? 0.2 : 0,
    regenPerTurn: has("regeneration") ? 3 : 0,
    manaBonusAtStart: has("mana_surge") ? 20 : 0,
    startMpBonus,
    skillCostReduction: has("mana_efficiency") ? 5 : 0,
    hasDefuser: has("defuser"),
    hasQuickDraw: has("quick_draw"),
    hasExplosiveMagic: has("explosive_magic"),
  };
}

// Re-export PASSIVE_PERKS for convenient lookup by consumers
export { PASSIVE_PERKS, STAT_PERKS };
