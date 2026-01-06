import { TileKind } from "../match3/types";
import type { BaseTileKind } from "../match3/types";

// Динамические размеры экрана (устанавливаются в main.ts)
export let GAME_WIDTH = 480;
export let GAME_HEIGHT = 800;

// Установка реального размера экрана
export function setScreenSize(width: number, height: number) {
  GAME_WIDTH = width;
  GAME_HEIGHT = height;
}

// Размер поля (8 ширина x 7 высота)
export const BOARD_WIDTH = 8;
export const BOARD_HEIGHT = 7;

// Фиксированные размеры элементов (не масштабируются!)
export const CELL_SIZE = 46; // Размер ячейки
export const BOARD_PADDING = 8;

export function updateScaledValues() {
  UI_LAYOUT = getUILayout();
}

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
export const BOSS_DAMAGED_HP_THRESHOLD = 0.5; // Переход на damaged спрайт при HP < 50%

// Способности босса
export const BOSS_ABILITIES = {
  attack: {
    name: "Атака",
    cooldown: 1,
    damage: BOSS_PHYS_ATTACK * 3, // 30
    hasCutscene: false,
  },
  bombs: {
    name: "Бомбы",
    cooldown: 2,
    bombCount: 5,
    bombCooldown: 3,
    bombDamage: BOSS_PHYS_ATTACK * 3, // 30 за бомбу
    hasCutscene: true,
  },
  shield: {
    name: "Щит",
    cooldown: 1,
    shieldDuration: 2,
    hasCutscene: true,
  },
  powerStrike: {
    name: "Мощный удар",
    cooldown: 2,
    damage: BOSS_PHYS_ATTACK * 10, // 100
    manaDrain: 50,
    hasCutscene: true,
  },
} as const;

// Паттерн способностей босса (зацикливается)
export const BOSS_ABILITY_PATTERN = [
  "attack",
  "bombs",
  "attack",
  "shield",
  "attack",
  "powerStrike",
] as const;

export type BossAbilityType = typeof BOSS_ABILITY_PATTERN[number];

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

// UI Layout - строится СНИЗУ ВВЕРХ с фиксированными размерами
export const getUILayout = () => {
  const boardWidth = BOARD_WIDTH * CELL_SIZE;
  const boardHeight = BOARD_HEIGHT * CELL_SIZE;

  // === СНИЗУ ВВЕРХ ===

  // 1. Кнопки скиллов (самый низ)
  const skillButtonSize = 56;
  const skillButtonSpacing = 12;
  const skillButtonsY = GAME_HEIGHT - 40; // Центр кнопок от низа

  // 2. HP/MP бары игрока (над кнопками)
  const playerBarHeight = 14;
  const playerBarWidth = 140;
  const playerBarsBottomY = skillButtonsY - skillButtonSize / 2 - 12;
  const playerMpBarY = playerBarsBottomY - playerBarHeight;
  const playerHpBarY = playerMpBarY - playerBarHeight - 6;

  // 3. Аватар игрока (слева от баров)
  const avatarSize = 50;
  const avatarY = (playerHpBarY + playerMpBarY + playerBarHeight) / 2;

  // 4. Match-3 поле (над нижней панелью)
  const boardBottomY = playerHpBarY - 20;
  const boardOriginY = boardBottomY - boardHeight;
  const boardOriginX = (GAME_WIDTH - boardWidth) / 2;

  // 5. HP бар босса (над полем)
  const hpBarWidth = boardWidth;
  const hpBarHeight = 18;
  const bossHpBarY = boardOriginY - 8 - hpBarHeight;

  // 6. Название босса (над HP баром)
  const bossNameY = bossHpBarY - 22;

  // 7. Иконка кулдауна (справа от HP бара)
  const cooldownIconSize = 40;

  // === СВЕРХУ (растягивается) ===
  // Изображение босса занимает всё пространство от верха до HP бара
  const bossImageTopY = 0;
  const bossImageBottomY = bossNameY - 8;
  const bossImageHeight = bossImageBottomY - bossImageTopY;
  const bossImageCenterY = bossImageTopY + bossImageHeight / 2;

  return {
    // Размеры доски
    boardOriginX,
    boardOriginY,
    boardWidth,
    boardHeight,

    // Босс (изображение растягивается!)
    bossImageCenterY,
    bossImageHeight,
    bossNameY,
    bossHpBarY,
    bossHpBarX: boardOriginX,
    hpBarWidth,
    hpBarHeight,
    cooldownIconSize,
    cooldownIconX: boardOriginX + boardWidth + 8,
    cooldownIconY: bossHpBarY + hpBarHeight / 2,

    // Игрок (снизу)
    avatarX: 35,
    avatarY,
    avatarSize,
    playerHpBarX: 70,
    playerHpBarY,
    playerMpBarY,
    playerBarWidth,
    playerBarHeight,

    // Кнопки скиллов
    skillButtonsY,
    skillButtonSize,
    skillButtonSpacing,
    skillButtonsStartX: GAME_WIDTH / 2 - (skillButtonSize * 2 + skillButtonSpacing * 1.5),

    // Deprecated (для совместимости)
    topPanelY: 0,
    topPanelHeight: 0,
    bottomPanelY: 0,
    bottomPanelHeight: 0,
    bossImageSize: 0,
    bossY: bossImageCenterY,
    panelMargin: 16,
  };
};

// Обновляется при вызове updateScaledValues
export let UI_LAYOUT = getUILayout();

// UI Colors - centralized color palette
export const UI_COLORS = {
  background: 0x0d0f1a,
  panelBg: 0x131a2d,
  panelBgAlt: 0x111726,
  boardBg: 0x161820,
  bossHp: 0xde3e3e,
  playerHp: 0x4caf50,
  playerMana: 0x3b82f6,
  playerTurnText: "#9ef7a5",
  bossTurnText: "#ffb347",
  defusedFlash: 0x44ff66,
  overlay: 0x000000,
} as const;

// Input thresholds
export const INPUT_THRESHOLD = {
  tapDistance: 10,
} as const;

// Tile classification helpers
export const DAMAGE_TILES: readonly TileKind[] = [TileKind.Sword, TileKind.Star] as const;
export const RESOURCE_TILES: readonly TileKind[] = [TileKind.Mana, TileKind.Heal] as const;

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
