/**
 * Stat perk registry — 6 unlimited safety-net perks for arena runs (brief §12).
 *
 * Stat perks can be picked any number of times. Values are intentionally small
 * to avoid balance breaks. Used by the perk card generation algorithm to fill
 * remaining slots when skill and passive perks are exhausted.
 *
 * Pure data — zero Phaser imports.
 */

import type { StatPerkDef } from "./types";

export const STAT_PERKS: readonly StatPerkDef[] = [
  {
    id: "stat_hp",
    name: "Крепость",
    description: "+5 максимального HP",
    stat: "hp",
    value: 5,
  },
  {
    id: "stat_phys",
    name: "Сила",
    description: "+1 физическая атака",
    stat: "physAttack",
    value: 1,
  },
  {
    id: "stat_mag",
    name: "Мудрость",
    description: "+1 магическая атака",
    stat: "magAttack",
    value: 1,
  },
  {
    id: "stat_mp",
    name: "Мана-кап",
    description: "+3 к максимуму MP",
    stat: "mp",
    value: 3,
  },
  {
    id: "stat_crit",
    name: "Точность",
    description: "+2% к шансу крита",
    stat: "crit",
    value: 2,
  },
  {
    id: "stat_start_mp",
    name: "Энергия",
    description: "+5 к стартовой мане за бой",
    stat: "startMp",
    value: 5,
  },
];
