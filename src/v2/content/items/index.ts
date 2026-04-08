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
 *
 * Phase 2A: registry expanded from 6 → 24 items with legendary tier (R6).
 * Distribution: 8 weapon + 8 armor + 8 accessory, 2 per rarity per slot.
 * Stat scaling: common (1 field, baseline) → rare (+50%) → epic (+120%) →
 * legendary (+250%, always contains `crit`). Existing Phase 1B items
 * (`wooden_blade`, `silver_dagger`, `student_robes`, `padded_cuirass`,
 * `simple_amulet`, `focus_charm`) are UNTOUCHED.
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

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2A — new items (18 total) reach parity of 2 per rarity per slot.
// Scaling baseline: weapon physAttack, armor hp, accessory mp.
// Legendary items ALWAYS contain `crit` per DECISIONS.md R6.
// ─────────────────────────────────────────────────────────────────────────────

// ── Weapons (6 new: 1 common, 1 rare, 2 epic, 2 legendary) ──────────────────

const iron_blade: ItemDef = {
  id: "iron_blade",
  name: "Железный клинок",
  description: "Простой кованый меч. Без изысков, но надёжен в бою.",
  slot: "weapon",
  rarity: "common",
  baseStats: { physAttack: 5 },
};

const runed_sword: ItemDef = {
  id: "runed_sword",
  name: "Рунный меч",
  description: "Лезвие с выгравированными рунами младших демонов.",
  slot: "weapon",
  rarity: "rare",
  baseStats: { physAttack: 8, magAttack: 2 },
};

const dawn_blade: ItemDef = {
  id: "dawn_blade",
  name: "Клинок рассвета",
  description: "Оружие падших стражей. Излучает мягкое золотое сияние.",
  slot: "weapon",
  rarity: "epic",
  baseStats: { physAttack: 12, crit: 3 },
};

const phantom_dagger: ItemDef = {
  id: "phantom_dagger",
  name: "Призрачный кинжал",
  description: "Полупрозрачное лезвие режет и плоть, и душу.",
  slot: "weapon",
  rarity: "epic",
  baseStats: { physAttack: 11, magAttack: 4 },
};

const dragonslayer: ItemDef = {
  id: "dragonslayer",
  name: "Драконоборец",
  description: "Двуручный меч, выкованный из сердца погибшего змея.",
  slot: "weapon",
  rarity: "legendary",
  baseStats: { physAttack: 18, crit: 6, hp: 20 },
};

const void_reaver: ItemDef = {
  id: "void_reaver",
  name: "Жнец Пустоты",
  description: "Клинок, выкроенный из тени. Шепчет имена тех, кого ты убьёшь.",
  slot: "weapon",
  rarity: "legendary",
  baseStats: { physAttack: 17, magAttack: 8, crit: 5 },
};

// ── Armor (6 new: 1 common, 1 rare, 2 epic, 2 legendary) ────────────────────

const linen_tunic: ItemDef = {
  id: "linen_tunic",
  name: "Льняная туника",
  description: "Простая одежда послушника. Дёшево и сердито.",
  slot: "armor",
  rarity: "common",
  baseStats: { hp: 20 },
};

const chainmail_vest: ItemDef = {
  id: "chainmail_vest",
  name: "Кольчужный жилет",
  description: "Плетёные кольца из закалённой стали. Надёжная защита для наёмника.",
  slot: "armor",
  rarity: "rare",
  baseStats: { hp: 32, physAttack: 2 },
};

const mage_robes: ItemDef = {
  id: "mage_robes",
  name: "Мантия мага",
  description: "Тяжёлые бархатные складки, расшитые серебряной нитью каналов маны.",
  slot: "armor",
  rarity: "epic",
  baseStats: { hp: 40, mp: 12 },
};

const dragon_scale: ItemDef = {
  id: "dragon_scale",
  name: "Чешуя дракона",
  description: "Доспех из пластин, которые сами вспыхивают алым перед смертельным ударом.",
  slot: "armor",
  rarity: "epic",
  baseStats: { hp: 48, crit: 3 },
};

const aegis_plate: ItemDef = {
  id: "aegis_plate",
  name: "Эгида",
  description: "Легендарная кираса небесной стражи. Говорят, её нельзя пробить.",
  slot: "armor",
  rarity: "legendary",
  baseStats: { hp: 75, mp: 10, crit: 5 },
};

const phoenix_mantle: ItemDef = {
  id: "phoenix_mantle",
  name: "Мантия Феникса",
  description: "Тёплое перо феникса в каждом шве. Пахнет пеплом и надеждой.",
  slot: "armor",
  rarity: "legendary",
  baseStats: { hp: 70, magAttack: 8, crit: 5 },
};

// ── Accessories (6 new: 1 common, 1 rare, 2 epic, 2 legendary) ──────────────

const copper_ring: ItemDef = {
  id: "copper_ring",
  name: "Медное кольцо",
  description: "Грубо обработанное кольцо с крошечным кристаллом маны.",
  slot: "accessory",
  rarity: "common",
  baseStats: { mp: 6 },
};

const silver_pendant: ItemDef = {
  id: "silver_pendant",
  name: "Серебряный кулон",
  description: "Гранёный камешек на серебряной цепочке. Помогает сосредоточиться.",
  slot: "accessory",
  rarity: "rare",
  baseStats: { mp: 10, crit: 1 },
};

const mage_circlet: ItemDef = {
  id: "mage_circlet",
  name: "Венец мага",
  description: "Тонкий обруч архимага. Усиливает любое заклинание прикосновением.",
  slot: "accessory",
  rarity: "epic",
  baseStats: { mp: 14, magAttack: 5 },
};

const warriors_band: ItemDef = {
  id: "warriors_band",
  name: "Браслет воина",
  description: "Кожаный браслет с железными заклёпками. Увеличивает точность ударов.",
  slot: "accessory",
  rarity: "epic",
  baseStats: { physAttack: 6, crit: 3 },
};

const arcane_orb: ItemDef = {
  id: "arcane_orb",
  name: "Аркановый шар",
  description: "Сфера, внутри которой клубится пойманная буря магической энергии.",
  slot: "accessory",
  rarity: "legendary",
  baseStats: { mp: 20, magAttack: 10, crit: 6 },
};

const eternity_charm: ItemDef = {
  id: "eternity_charm",
  name: "Талисман вечности",
  description: "Оберег из тёмного металла. Тот, кто носит его, забывает, что такое старение.",
  slot: "accessory",
  rarity: "legendary",
  baseStats: { mp: 18, hp: 25, crit: 8 },
};

export const ITEMS: Record<string, ItemDef> = {
  // Phase 1B originals (untouched)
  wooden_blade,
  silver_dagger,
  student_robes,
  padded_cuirass,
  simple_amulet,
  focus_charm,
  // Phase 2A — weapons
  iron_blade,
  runed_sword,
  dawn_blade,
  phantom_dagger,
  dragonslayer,
  void_reaver,
  // Phase 2A — armor
  linen_tunic,
  chainmail_vest,
  mage_robes,
  dragon_scale,
  aegis_plate,
  phoenix_mantle,
  // Phase 2A — accessories
  copper_ring,
  silver_pendant,
  mage_circlet,
  warriors_band,
  arcane_orb,
  eternity_charm,
};
