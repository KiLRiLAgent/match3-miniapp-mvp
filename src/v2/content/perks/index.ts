/**
 * Perk barrel export — single entry point for all perk data modules.
 *
 * Phase 2B: 12 passive perks + 6 stat perks. Skill perks reuse v1
 * `SKILL_LEVEL_TABLE` from `PerkManager.ts` and are not re-exported here.
 *
 * Pure data — zero Phaser imports.
 */

export type { PassivePerkId, StatPerkId, PassivePerkDef, StatPerkDef } from "./types";
export { PASSIVE_PERKS } from "./passive-perks";
export { STAT_PERKS } from "./stat-perks";
