/**
 * Buff registry — single source of truth for all `BuffDef` instances surfaced
 * by ArenaRewardScene during an arena run. Pure data — no Phaser imports, no
 * functions. Mirrors the registry pattern used by `ITEMS`, `CHARACTERS`,
 * `DIALOGUES`, `ENCOUNTERS`, `LOCATIONS`.
 *
 * Phase 2A scope: 10 BuffDefs covering the buff taxonomy in DECISIONS.md R7.
 * Effect-type runtime support split:
 *
 *   FULLY SUPPORTED (applied via BuffSystem.applyToStats hook in
 *   EncounterBuilder.build()):
 *     - addPhysAttack, addMagAttack, addMaxHp, addMaxMp, addCrit
 *
 *   PARTIAL / Phase 2B continuation:
 *     - addMpRegen           — needs GameScene per-turn hook (Phase 2B)
 *     - damageReduction      — needs damage pipeline hook (Phase 2B)
 *     - physPerFightSurvived — needs ArenaSystem fight counter (Phase 2B)
 *     - extraReward          — handled by ArenaRewardScene buff slot count
 *     - reviveOnDeath        — needs GameScene defeat hook (Phase 2B)
 *
 * Buff `rarity` here refers to BUFF rarity (drives reward-pool weighting),
 * NOT item rarity. Russian copy consistent with v2 voice.
 *
 * `stackable` semantics (architect-frontend FE-13 / Round 2 consensus):
 *  - All stat-add and modifier buffs are `stackable: true` so the player can
 *    accumulate multiple instances across a run (Archero-style). Without this
 *    flag, the ArenaRewardScene buff-pool filter (`!stackable && already-picked
 *    → skip`) would lock out the core stat buffs after the first pick, leaving
 *    the player out of meaningful choices on later floors.
 *  - `buff_luck` (extraReward) and `buff_phoenix` (one-time revive) are
 *    intentionally NON-stackable: stacking has no semantic meaning.
 */

import type { BuffDef } from "../types";

const buff_strength: BuffDef = {
  id: "buff_strength",
  name: "Сила",
  description: "+10 к физической атаке на этот забег.",
  effectType: "addPhysAttack",
  value: 10,
  rarity: "common",
  stackable: true,
};

const buff_magic: BuffDef = {
  id: "buff_magic",
  name: "Магия",
  description: "+10 к магической атаке на этот забег.",
  effectType: "addMagAttack",
  value: 10,
  rarity: "common",
  stackable: true,
};

const buff_vitality: BuffDef = {
  id: "buff_vitality",
  name: "Здоровье",
  description: "+50 к максимуму HP на этот забег.",
  effectType: "addMaxHp",
  value: 50,
  rarity: "common",
  stackable: true,
};

const buff_mana: BuffDef = {
  id: "buff_mana",
  name: "Мана",
  description: "+30 к максимуму MP на этот забег.",
  effectType: "addMaxMp",
  value: 30,
  rarity: "common",
  stackable: true,
};

const buff_crit: BuffDef = {
  id: "buff_crit",
  name: "Крит",
  description: "+10% к шансу критического удара.",
  effectType: "addCrit",
  value: 10,
  rarity: "rare",
  stackable: true,
};

const buff_speed: BuffDef = {
  id: "buff_speed",
  name: "Скорость",
  description: "+1 регенерация маны за каждый ход. (Phase 2B)",
  effectType: "addMpRegen",
  value: 1,
  rarity: "rare",
  stackable: true,
};

const buff_ward: BuffDef = {
  id: "buff_ward",
  name: "Защита",
  description: "−20% получаемого урона. (Phase 2B)",
  effectType: "damageReduction",
  value: 20,
  rarity: "rare",
  stackable: true,
};

const buff_revenge: BuffDef = {
  id: "buff_revenge",
  name: "Месть",
  description: "+5 к физ. атаке за каждый пройденный бой. (Phase 2B)",
  effectType: "physPerFightSurvived",
  value: 5,
  rarity: "epic",
  stackable: true,
};

const buff_luck: BuffDef = {
  id: "buff_luck",
  name: "Удача",
  description: "+1 дополнительный выбор бафа в следующем награждении.",
  effectType: "extraReward",
  value: 1,
  rarity: "epic",
};

const buff_phoenix: BuffDef = {
  id: "buff_phoenix",
  name: "Феникс",
  description: "Однократно: восстановить 50% HP при поражении. (Phase 2B)",
  effectType: "reviveOnDeath",
  value: 50,
  rarity: "epic",
};

export const BUFFS: Record<string, BuffDef> = {
  buff_strength,
  buff_magic,
  buff_vitality,
  buff_mana,
  buff_crit,
  buff_speed,
  buff_ward,
  buff_revenge,
  buff_luck,
  buff_phoenix,
};
