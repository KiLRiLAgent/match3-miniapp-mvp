/**
 * Item registry — single source of truth for all `ItemDef` instances loaded
 * into v2. Keyed by `ItemDef.id`. Add new items by declaring them inline and
 * registering in the `ITEMS` map below.
 *
 * Following the same pattern as `CHARACTERS`, `DIALOGUES`, `ENCOUNTERS`,
 * `LOCATIONS`. Pure data — no functions, no Phaser imports.
 *
 * Field naming: `baseStats` uses `hp` / `mp` (NOT `hpMax` / `manaMax`) to match
 * `ItemStats` in `src/v2/core/types.ts`.
 */

import type { ItemDef } from "../types";

const wooden_blade: ItemDef = {
  id: "wooden_blade",
  name: "Деревянный клинок",
  description: "Тренировочное оружие первокурсника. Лёгкий, но крепкий.",
  slot: "weapon",
  rarity: "common",
  baseStats: { physAttack: 5 },
};

const silver_dagger: ItemDef = {
  id: "silver_dagger",
  name: "Серебряный кинжал",
  description: "Тонкий клинок с гравировкой. Острый, как взгляд старосты.",
  slot: "weapon",
  rarity: "rare",
  baseStats: { physAttack: 10, crit: 2 },
};

const student_robes: ItemDef = {
  id: "student_robes",
  name: "Студенческая мантия",
  description: "Стандартная униформа Университета Падших. Удобна и неприметна.",
  slot: "armor",
  rarity: "common",
  baseStats: { hp: 20 },
};

const padded_cuirass: ItemDef = {
  id: "padded_cuirass",
  name: "Стёганый кирас",
  description: "Армированная нагрудная пластина с рунической подкладкой.",
  slot: "armor",
  rarity: "rare",
  baseStats: { hp: 40, mp: 5 },
};

const simple_amulet: ItemDef = {
  id: "simple_amulet",
  name: "Простой амулет",
  description: "Серебряная подвеска с кристаллом маны. Слабый, но надёжный фокус.",
  slot: "accessory",
  rarity: "common",
  baseStats: { mp: 5 },
};

const focus_charm: ItemDef = {
  id: "focus_charm",
  name: "Талисман сосредоточения",
  description: "Резной талисман, усиливающий концентрацию заклинателя.",
  slot: "accessory",
  rarity: "rare",
  baseStats: { mp: 15, magAttack: 3 },
};

export const ITEMS: Record<string, ItemDef> = {
  wooden_blade,
  silver_dagger,
  student_robes,
  padded_cuirass,
  simple_amulet,
  focus_charm,
};
