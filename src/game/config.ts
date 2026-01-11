import { TileKind } from "../match3/types";
import type { BaseTileKind } from "../match3/types";

// Динамические размеры экрана (устанавливаются в main.ts)
export let GAME_WIDTH = 480;
export let GAME_HEIGHT = 800;

// Safe area insets (from Telegram)
export let SAFE_AREA = { top: 0, bottom: 0, left: 0, right: 0 };

// Установка реального размера экрана и safe areas
export function setScreenSize(
  width: number,
  height: number,
  safeArea?: { top: number; bottom: number; left: number; right: number }
) {
  GAME_WIDTH = width;
  GAME_HEIGHT = height;
  if (safeArea) {
    SAFE_AREA = safeArea;
  }
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

// Порог для смены спрайта босса при низком HP
export const BOSS_DAMAGED_HP_THRESHOLD = 0.5;
// Множитель магического урона
export const PLAYER_MAG_DAMAGE_MULTIPLIER = 0.5;

// === МУТАБЕЛЬНЫЕ ПАРАМЕТРЫ ДЛЯ НАСТРОЕК ===
export const GAME_PARAMS = {
  player: {
    hpMax: 200,
    manaMax: 100,
    physAttack: 10,
    magAttack: 10,
  },
  boss: {
    hpMax: 1000,
    physAttack: 10,
  },
  tiles: {
    hpPerTile: 2,
    mpPerTile: 5,
    swordDamage: 10,
    starDamage: 10,
  },
  bossAbilities: {
    attackDamage: 30,
    attackCooldown: 1,
    bombCount: 5,
    bombCooldown: 3,
    bombDamage: 30,
    bombsAbilityCooldown: 2,
    shieldDuration: 2,
    shieldCooldown: 1,
    powerStrikeDamage: 100,
    powerStrikeManaDrain: 50,
    powerStrikeCooldown: 2,
  },
  // Паттерн способностей босса (1=атака, 2=бомбы, 3=щит, 4=мощный удар)
  bossPattern: [1, 2, 1, 3, 1, 4] as number[],
};

// Валидация числового значения
function isValidNumber(value: unknown, min = 0, max = 10000): value is number {
  return typeof value === "number" && !isNaN(value) && value >= min && value <= max;
}

// Безопасное присваивание числового параметра
function safeAssignNumber<T extends Record<string, number>>(
  target: T,
  key: keyof T,
  value: unknown,
  min = 0,
  max = 10000
): void {
  if (isValidNumber(value, min, max)) {
    target[key] = value as T[keyof T];
  }
}

// Загрузить из localStorage
export function loadGameParams() {
  try {
    const saved = localStorage.getItem("match3_params");
    if (!saved) return;

    const parsed: unknown = JSON.parse(saved);
    if (typeof parsed !== "object" || parsed === null) return;

    const data = parsed as Record<string, unknown>;

    // Валидируем player параметры
    if (typeof data.player === "object" && data.player !== null) {
      const player = data.player as Record<string, unknown>;
      safeAssignNumber(GAME_PARAMS.player, "hpMax", player.hpMax, 1, 10000);
      safeAssignNumber(GAME_PARAMS.player, "manaMax", player.manaMax, 1, 10000);
      safeAssignNumber(GAME_PARAMS.player, "physAttack", player.physAttack, 0, 1000);
      safeAssignNumber(GAME_PARAMS.player, "magAttack", player.magAttack, 0, 1000);
    }

    // Валидируем boss параметры
    if (typeof data.boss === "object" && data.boss !== null) {
      const boss = data.boss as Record<string, unknown>;
      safeAssignNumber(GAME_PARAMS.boss, "hpMax", boss.hpMax, 1, 100000);
      safeAssignNumber(GAME_PARAMS.boss, "physAttack", boss.physAttack, 0, 1000);
    }

    // Валидируем tiles параметры
    if (typeof data.tiles === "object" && data.tiles !== null) {
      const tiles = data.tiles as Record<string, unknown>;
      safeAssignNumber(GAME_PARAMS.tiles, "hpPerTile", tiles.hpPerTile, 0, 1000);
      safeAssignNumber(GAME_PARAMS.tiles, "mpPerTile", tiles.mpPerTile, 0, 1000);
      safeAssignNumber(GAME_PARAMS.tiles, "swordDamage", tiles.swordDamage, 0, 1000);
      safeAssignNumber(GAME_PARAMS.tiles, "starDamage", tiles.starDamage, 0, 1000);
    }

    // Валидируем bossAbilities параметры
    if (typeof data.bossAbilities === "object" && data.bossAbilities !== null) {
      const ba = data.bossAbilities as Record<string, unknown>;
      safeAssignNumber(GAME_PARAMS.bossAbilities, "attackDamage", ba.attackDamage, 0, 1000);
      safeAssignNumber(GAME_PARAMS.bossAbilities, "attackCooldown", ba.attackCooldown, 1, 100);
      safeAssignNumber(GAME_PARAMS.bossAbilities, "bombCount", ba.bombCount, 0, 56);
      safeAssignNumber(GAME_PARAMS.bossAbilities, "bombCooldown", ba.bombCooldown, 1, 100);
      safeAssignNumber(GAME_PARAMS.bossAbilities, "bombDamage", ba.bombDamage, 0, 1000);
      safeAssignNumber(GAME_PARAMS.bossAbilities, "bombsAbilityCooldown", ba.bombsAbilityCooldown, 1, 100);
      safeAssignNumber(GAME_PARAMS.bossAbilities, "shieldDuration", ba.shieldDuration, 1, 100);
      safeAssignNumber(GAME_PARAMS.bossAbilities, "shieldCooldown", ba.shieldCooldown, 1, 100);
      safeAssignNumber(GAME_PARAMS.bossAbilities, "powerStrikeDamage", ba.powerStrikeDamage, 0, 10000);
      safeAssignNumber(GAME_PARAMS.bossAbilities, "powerStrikeManaDrain", ba.powerStrikeManaDrain, 0, 1000);
      safeAssignNumber(GAME_PARAMS.bossAbilities, "powerStrikeCooldown", ba.powerStrikeCooldown, 1, 100);
    }

    // Валидируем bossPattern
    if (Array.isArray(data.bossPattern)) {
      const validPattern = data.bossPattern.filter(
        (n): n is number => isValidNumber(n, 1, 4)
      );
      if (validPattern.length > 0) {
        GAME_PARAMS.bossPattern = validPattern;
      }
    }

    // Валидируем skillCosts
    if (typeof data.skillCosts === "object" && data.skillCosts !== null) {
      const costs = data.skillCosts as Record<string, unknown>;
      if (isValidNumber(costs.powerStrike, 0, 1000)) SKILL_CONFIG.powerStrike.cost = costs.powerStrike;
      if (isValidNumber(costs.stun, 0, 1000)) SKILL_CONFIG.stun.cost = costs.stun;
      if (isValidNumber(costs.heal, 0, 1000)) SKILL_CONFIG.heal.cost = costs.heal;
      if (isValidNumber(costs.hammer, 0, 1000)) SKILL_CONFIG.hammer.cost = costs.hammer;
    }
  } catch {
    // Игнорируем ошибки парсинга
  }
}

// Сохранить в localStorage
export function saveGameParams() {
  try {
    const dataToSave = {
      ...GAME_PARAMS,
      skillCosts: {
        powerStrike: SKILL_CONFIG.powerStrike.cost,
        stun: SKILL_CONFIG.stun.cost,
        heal: SKILL_CONFIG.heal.cost,
        hammer: SKILL_CONFIG.hammer.cost,
      },
    };
    localStorage.setItem("match3_params", JSON.stringify(dataToSave));
  } catch {
    // Игнорируем ошибки
  }
}

// Способности босса (используют GAME_PARAMS)
export const BOSS_ABILITIES = {
  get attack() {
    return {
      name: "Атака",
      cooldown: GAME_PARAMS.bossAbilities.attackCooldown,
      damage: GAME_PARAMS.bossAbilities.attackDamage,
      hasCutscene: false,
    };
  },
  get bombs() {
    return {
      name: "Бомбы",
      cooldown: GAME_PARAMS.bossAbilities.bombsAbilityCooldown,
      bombCount: GAME_PARAMS.bossAbilities.bombCount,
      bombCooldown: GAME_PARAMS.bossAbilities.bombCooldown,
      bombDamage: GAME_PARAMS.bossAbilities.bombDamage,
      hasCutscene: true,
    };
  },
  get shield() {
    return {
      name: "Щит",
      cooldown: GAME_PARAMS.bossAbilities.shieldCooldown,
      shieldDuration: GAME_PARAMS.bossAbilities.shieldDuration,
      hasCutscene: true,
    };
  },
  get powerStrike() {
    return {
      name: "Мощный удар",
      cooldown: GAME_PARAMS.bossAbilities.powerStrikeCooldown,
      damage: GAME_PARAMS.bossAbilities.powerStrikeDamage,
      manaDrain: GAME_PARAMS.bossAbilities.powerStrikeManaDrain,
      hasCutscene: true,
    };
  },
};

// Типы способностей босса
export type BossAbilityType = "attack" | "bombs" | "shield" | "powerStrike";

// Маппинг числа на тип способности
const ABILITY_MAP: Record<number, BossAbilityType> = {
  1: "attack",
  2: "bombs",
  3: "shield",
  4: "powerStrike",
};

// Названия способностей для UI
export const ABILITY_NAMES: Record<number, string> = {
  1: "Атака",
  2: "Бомбы",
  3: "Щит",
  4: "Удар",
};

// Паттерн способностей босса (динамический, из GAME_PARAMS)
export function getBossAbilityPattern(): BossAbilityType[] {
  return GAME_PARAMS.bossPattern.map(n => ABILITY_MAP[n] || "attack");
}

export const BASE_TYPES: BaseTileKind[] = [
  TileKind.Sword,
  TileKind.Star,
  TileKind.Mana,
  TileKind.Heal,
];

// UI Layout - строится СНИЗУ ВВЕРХ с фиксированными размерами
export const getUILayout = () => {
  const boardWidth = BOARD_WIDTH * CELL_SIZE;
  const boardHeight = BOARD_HEIGHT * CELL_SIZE;

  // === СНИЗУ ВВЕРХ ===
  const screenPadding = 16; // Отступ от краёв экрана
  const bottomPadding = 16 + SAFE_AREA.bottom; // Базовый отступ

  // 1. Кнопки скиллов (круглые, самый низ)
  const skillButtonSize = 50;
  const skillButtonSpacing = 12;
  const skillCostOffset = 18; // место для текста стоимости под кнопкой
  const skillButtonsY = GAME_HEIGHT - bottomPadding - skillButtonSize / 2 - skillCostOffset;

  // 2. MP бар игрока (над скиллами с отступом)
  const playerBarHeight = 14;
  const skillsTopY = skillButtonsY - skillButtonSize / 2; // верх кнопок скиллов
  const playerMpBarY = skillsTopY - 16 - playerBarHeight; // 16px отступ между скиллами и MP баром

  // 3. HP бар игрока (над MP)
  const playerHpBarY = playerMpBarY - playerBarHeight - 6;

  // 4. Аватар игрока - от HP бара до низа скиллов (включая текст стоимости)
  const avatarWidth = 50;
  const skillsBottomY = skillButtonsY + skillButtonSize / 2 + skillCostOffset; // низ текста стоимости
  const avatarHeight = skillsBottomY - playerHpBarY;
  const avatarX = screenPadding + avatarWidth / 2;
  const avatarY = playerHpBarY + avatarHeight / 2;

  // HP/MP бары начинаются после аватара
  const playerBarsX = avatarX + avatarWidth / 2 + 8;
  const playerBarWidth = GAME_WIDTH - playerBarsX - screenPadding;

  // 5. Match-3 поле (над нижней панелью)
  const boardBottomY = playerHpBarY - 12;
  const boardOriginY = boardBottomY - boardHeight;
  const boardOriginX = (GAME_WIDTH - boardWidth) / 2;

  // 6. HP бар босса (над полем, меньше ширина для круглой иконки)
  const cooldownIconSize = 40;
  const hpBarWidth = boardWidth - cooldownIconSize - 8;
  const hpBarHeight = 16;
  const bossHpBarY = boardOriginY - 6 - hpBarHeight - 20; // над полем, +20px выше
  const cooldownIconX = boardOriginX + hpBarWidth + 4 + cooldownIconSize / 2;

  // 7. Название босса (над HP баром)
  const bossNameY = bossHpBarY - 18;

  // === СВЕРХУ (растягивается) ===
  // Изображение босса занимает пространство от верха до HP бара
  const bossImageTopY = 0; // Без отступа - босс от самого верха
  const bossImageBottomY = bossNameY - 6;
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
    cooldownIconX,
    cooldownIconY: bossHpBarY + hpBarHeight / 2,

    // Игрок (снизу)
    avatarX,
    avatarY,
    avatarWidth,
    avatarHeight,
    playerHpBarX: playerBarsX,
    playerHpBarY,
    playerMpBarY,
    playerBarWidth,
    playerBarHeight,

    // Кнопки скиллов (центрированы)
    skillButtonsY,
    skillButtonSize,
    skillButtonSpacing,
    skillButtonsStartX: (GAME_WIDTH - (skillButtonSize * 4 + skillButtonSpacing * 3)) / 2 + skillButtonSize / 2,
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

export type SkillId = "powerStrike" | "stun" | "heal" | "hammer";

// Порядок скиллов для UI
export const SKILL_IDS: readonly SkillId[] = ["powerStrike", "stun", "heal", "hammer"] as const;

export interface SkillDef {
  name: string;
  icon: string;
  cost: number;
  damage: number;
  heal: number;
  cooldown: number;
  stunTurns?: number;
  isInteractive?: boolean;
  description: string;
}

export const SKILL_CONFIG: Record<SkillId, SkillDef> = {
  powerStrike: {
    name: "Мощный удар",
    icon: "💪",
    cost: 40,
    damage: 100,
    heal: 0,
    cooldown: 3,
    description: "100 урона",
  },
  stun: {
    name: "Стан",
    icon: "🎯",
    cost: 50,
    damage: 0,
    heal: 0,
    cooldown: 5,
    stunTurns: 2,
    description: "+2 к кулдауну босса",
  },
  heal: {
    name: "Хил",
    icon: "💚",
    cost: 30,
    damage: 0,
    heal: 50,
    cooldown: 2,
    description: "+50 HP",
  },
  hammer: {
    name: "Молоток",
    icon: "🔨",
    cost: 20,
    damage: 0,
    heal: 0,
    cooldown: 3,
    isInteractive: true,
    description: "Удалить фишку",
  },
};
