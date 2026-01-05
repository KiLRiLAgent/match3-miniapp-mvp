import { TileKind } from "../match3/types";
import type { BaseTileKind } from "../match3/types";

// Размер поля (8 ширина x 7 высота согласно прототипу)
export const BOARD_WIDTH = 8;
export const BOARD_HEIGHT = 7;
export const CELL_SIZE = 56;
export const BOARD_PADDING = 12;

export const GAME_WIDTH = 480;
export const GAME_HEIGHT = 800;

// Параметры игрока
export const PLAYER_HP_MAX = 200;
export const PLAYER_MANA_MAX = 100;
export const PLAYER_PHYS_ATTACK = 10;
export const PLAYER_MAG_ATTACK = 10;
export const PLAYER_MAG_DAMAGE_MULTIPLIER = 0.5; // Магическая атака наносит 50% урона
export const HP_PER_TILE = 10;
export const MP_PER_TILE = 10;

// Параметры противника
export const BOSS_HP_MAX = 500;
export const BOSS_PHYS_ATTACK = 10;
export const BOSS_ABILITY_COOLDOWN = 3;
export const BOSS_ABILITY_MULTIPLIER = 10;
export const BOSS_DAMAGED_HP_THRESHOLD = 0.5; // Переход на damaged спрайт при HP < 50%

export const BASE_TYPES: BaseTileKind[] = [
  TileKind.Sword,
  TileKind.Star,
  TileKind.Mana,
  TileKind.Heal,
];

// Урон за фишку = атака игрока (физ/маг) * 1
export const DAMAGE_PER_TILE: Record<BaseTileKind, number> = {
  [TileKind.Sword]: PLAYER_PHYS_ATTACK,
  [TileKind.Star]: PLAYER_MAG_ATTACK,
  [TileKind.Mana]: 0,
  [TileKind.Heal]: 0,
};

export const MATCH_GAINS = {
  mana: MP_PER_TILE,
  heal: HP_PER_TILE,
};

// Способность игрока "Мощный удар"
export const POWER_STRIKE_COST = 50;
export const POWER_STRIKE_MULTIPLIER = 10;

export type SkillId = "skill1" | "skill2" | "skill3" | "skill4";

export interface SkillDef {
  name: string;
  cost: number;
  damage: number;
  heal: number;
  description: string;
}

export const SKILL_CONFIG: Record<SkillId, SkillDef> = {
  skill1: {
    name: "Power",
    cost: POWER_STRIKE_COST,
    damage: PLAYER_PHYS_ATTACK * POWER_STRIKE_MULTIPLIER,
    heal: 0,
    description: "Физ x10",
  },
  skill2: {
    name: "Blast",
    cost: 100,
    damage: 100,
    heal: 0,
    description: "100 урона",
  },
  skill3: {
    name: "Heal",
    cost: 30,
    damage: 0,
    heal: 50,
    description: "+50 HP",
  },
  skill4: {
    name: "Ult",
    cost: 100,
    damage: 200,
    heal: 0,
    description: "200 урона",
  },
};
