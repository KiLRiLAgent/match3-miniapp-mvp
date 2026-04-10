/**
 * PassivePerkEffects — 12 pure query functions for passive perk effects.
 *
 * All functions self-gate on arena state: return 0/false when no activeRun
 * or the perk hasn't been taken. GameScene reads these during combat to apply
 * per-perk behavior (lifesteal, regen, reflect, etc.).
 *
 * Zero Phaser imports. Zero SaveData writes.
 */

import { gameState } from "../core/GameState";

function hasPerk(id: string): boolean {
  const run = gameState.get().arena.activeRun;
  if (!run) return false;
  return (run.takenPassives ?? []).includes(id);
}

/** vampire: 5% lifesteal from skill damage. Returns 0 if not taken. */
export function getLifestealPercent(): number {
  return hasPerk("vampire") ? 5 : 0;
}

/** mana_surge: +20 starting mana per fight. Returns 0 if not taken. */
export function getManaBonusAtStart(): number {
  return hasPerk("mana_surge") ? 20 : 0;
}

/** bomb_master: +10 bomb damage. Returns 0 if not taken. */
export function getBombDamageBonus(): number {
  return hasPerk("bomb_master") ? 10 : 0;
}

/** crit_mastery: +10% crit chance. Returns 0 if not taken. */
export function getCritChanceBonus(): number {
  return hasPerk("crit_mastery") ? 10 : 0;
}

/** defuser: defuse all bombs on boss HP layer break. */
export function hasDefuser(): boolean {
  return hasPerk("defuser");
}

/** mana_efficiency: -5 to all skill costs. Returns 0 if not taken. */
export function getSkillCostReduction(): number {
  return hasPerk("mana_efficiency") ? 5 : 0;
}

/** shield_breaker: 15% chance per hit to ignore boss shield. Rolls Math.random. */
export function shouldIgnoreShield(): boolean {
  if (!hasPerk("shield_breaker")) return false;
  return Math.random() < 0.15;
}

/** reflect: 20% of boss damage reflected back. Returns 0 if not taken. */
export function getReflectPercent(): number {
  return hasPerk("reflect") ? 0.2 : 0;
}

/** rage: damage multiplier when HP < 50%. Returns 1.0 (no effect) if not taken or HP >= threshold. */
export function getRageDamageMultiplier(currentHp: number, maxHp: number): number {
  if (!hasPerk("rage")) return 1;
  return currentHp < maxHp * 0.5 ? 1.15 : 1;
}

/** regeneration: +3 HP per turn. Returns 0 if not taken. */
export function getRegenAmount(): number {
  return hasPerk("regeneration") ? 3 : 0;
}

/** explosive_magic: 5+ magic matches create a bomb. */
export function hasExplosiveMagic(): boolean {
  return hasPerk("explosive_magic");
}

/** quick_draw: -1 to all skill cooldowns on first turn of each fight. */
export function hasQuickDraw(): boolean {
  return hasPerk("quick_draw");
}
