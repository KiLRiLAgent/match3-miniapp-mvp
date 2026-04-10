/**
 * Passive perk registry — 12 one-time perks for arena runs (brief §11).
 *
 * Each passive perk can be picked exactly once per run. After being taken it is
 * removed from the generation pool. Effects are applied by ArenaPerkApplicator
 * (Task #5) at runtime — this module is pure data, zero Phaser imports.
 */

import type { PassivePerkDef } from "./types";

export const PASSIVE_PERKS: readonly PassivePerkDef[] = [
  {
    id: "vampire",
    name: "Вампиризм",
    description: "5% лайфстил от урона всех скилов",
  },
  {
    id: "mana_surge",
    name: "Мана-сёрдж",
    description: "+20 к стартовой мане в начале каждого боя",
  },
  {
    id: "bomb_master",
    name: "Бомбомастер",
    description: "Бомбы игрока наносят +10 урона",
  },
  {
    id: "crit_mastery",
    name: "Крит-мастер",
    description: "+10% к шансу крита на всё",
  },
  {
    id: "defuser",
    name: "Дефьюзер",
    description: "Когда ломаешь полоску босса, все бомбы на доске обезвреживаются",
  },
  {
    id: "mana_efficiency",
    name: "Эффективность маны",
    description: "Все скилы стоят на 5 меньше маны",
  },
  {
    id: "shield_breaker",
    name: "Пробитие щита",
    description: "15% шанс проигнорировать щит босса при ударе",
  },
  {
    id: "reflect",
    name: "Отражение",
    description: "20% урона от босса возвращается ему обратно",
  },
  {
    id: "rage",
    name: "Ярость",
    description: "+15% урона всех скилов когда HP < 50%",
  },
  {
    id: "regeneration",
    name: "Регенерация",
    description: "+3 HP в начале каждого своего хода",
  },
  {
    id: "explosive_magic",
    name: "Взрывная магия",
    description: "Магические матчи 5+ создают 1 бомбу с кд 3 хода",
  },
  {
    id: "quick_draw",
    name: "Быстрое чтение",
    description: "Все cooldowns скилов -1 на первом ходу каждого боя",
  },
];
