import { TileKind } from "../match3/types";
import type { BaseTileKind } from "../match3/types";

export const BOARD_SIZE = 8;
export const CELL_SIZE = 56;
export const BOARD_PADDING = 12;

export const GAME_WIDTH = 480;
export const GAME_HEIGHT = 800;

export const BOSS_HP_MAX = 1000;
export const PLAYER_HP_MAX = 100;
export const PLAYER_MANA_MAX = 100;
export const ULT_CHARGE_REQUIRED = 1;
export const BOSS_ATTACK_DAMAGE = 18;

export const BASE_TYPES: BaseTileKind[] = [
  TileKind.Sword,
  TileKind.Star,
  TileKind.Mana,
  TileKind.Heal,
];

export const DAMAGE_PER_TILE: Record<BaseTileKind, number> = {
  [TileKind.Sword]: 10,
  [TileKind.Star]: 12,
  [TileKind.Mana]: 0,
  [TileKind.Heal]: 0,
};

export const MATCH_GAINS = {
  mana: 3,
  heal: 2,
};

export type SkillId = "skill1" | "skill2" | "skill3" | "skill4";

export const SKILL_CONFIG: Record<
  SkillId,
  {
    name: string;
    cost: number;
    description: string;
  }
> = {
  skill1: {
    name: "Attack Boost",
    cost: 30,
    description: "120 dmg",
  },
  skill2: {
    name: "Magic Blast",
    cost: 50,
    description: "Clear row",
  },
  skill3: {
    name: "Heal",
    cost: 40,
    description: "+30 HP",
  },
  skill4: {
    name: "Ultimate",
    cost: 0,
    description: "Clear 5",
  },
};
