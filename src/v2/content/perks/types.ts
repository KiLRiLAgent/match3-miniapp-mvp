/**
 * Perk type definitions — union IDs and definition shapes for arena perks.
 *
 * Phase 2B: Variant B perk pool — passive perks (one-time pick, run-only)
 * and stat perks (unlimited safety net). Skill perks reuse v1
 * `SKILL_LEVEL_TABLE` and are NOT defined here.
 *
 * Pure types — zero Phaser imports, zero runtime code.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Passive perk IDs (12 one-time perks, brief §11)
// ─────────────────────────────────────────────────────────────────────────────

export type PassivePerkId =
  | "vampire"
  | "mana_surge"
  | "bomb_master"
  | "crit_mastery"
  | "defuser"
  | "mana_efficiency"
  | "shield_breaker"
  | "reflect"
  | "rage"
  | "regeneration"
  | "explosive_magic"
  | "quick_draw";

// ─────────────────────────────────────────────────────────────────────────────
// Stat perk IDs (6 unlimited perks, brief §12)
// ─────────────────────────────────────────────────────────────────────────────

export type StatPerkId =
  | "stat_hp"
  | "stat_phys"
  | "stat_mag"
  | "stat_mp"
  | "stat_crit"
  | "stat_start_mp";

// ─────────────────────────────────────────────────────────────────────────────
// Definitions
// ─────────────────────────────────────────────────────────────────────────────

/** Authored passive perk definition — one-time pick per run. */
export interface PassivePerkDef {
  id: PassivePerkId;
  name: string;
  description: string;
}

/** Authored stat perk definition — can be picked unlimited times per run. */
export interface StatPerkDef {
  id: StatPerkId;
  name: string;
  description: string;
  /** Stat key affected (maps to PlayerCombatStats / CombatContext fields). */
  stat: "hp" | "mp" | "physAttack" | "magAttack" | "crit" | "startMp";
  /** Magnitude per pick. */
  value: number;
}
