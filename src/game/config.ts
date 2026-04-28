import { TileKind } from "../match3/types";
import type { BaseTileKind } from "../match3/types";
import { clamp } from "../utils/helpers";

// Динамические размеры экрана (устанавливаются в main.ts)
export let GAME_WIDTH = 480;
export let GAME_HEIGHT = 800;

export let DPR = 1;
export function setDPR(dpr: number) { DPR = dpr; }

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

// Размеры поля (динамически вычисляются)
export let CELL_SIZE = 46; // Размер ячейки (пересчитывается в updateScaledValues)
export const BOARD_PADDING = 8;
export const SCREEN_PADDING = 2; // Отступ от краёв экрана
export const TILE_DISPLAY_SCALE = 1.20; // Tile sprite size relative to CELL_SIZE

export function updateScaledValues() {
  // Вычисляем CELL_SIZE чтобы поле занимало всю ширину экрана
  CELL_SIZE = Math.floor((GAME_WIDTH - 2 * SCREEN_PADDING - 2 * BOARD_PADDING) / BOARD_WIDTH);
  UI_LAYOUT = getUILayout();
}

export const PLAYER_MAG_DAMAGE_MULTIPLIER = 0.5;

export const BOSS_DAMAGED_HP_THRESHOLD = 0.5;

// === МУТАБЕЛЬНЫЕ ПАРАМЕТРЫ ДЛЯ НАСТРОЕК ===
export const GAME_PARAMS = {
  player: {
    hpMax: 200,
    manaMax: 100,
    physAttack: 10,
    magAttack: 10,
  },
  boss: {
    // hpMax / hpPerLayer recalculated from layerCount × baseHpPerLayer ×
    // layerMultipliers by recalcBossHpMax() at boot — kept here for type
    // shape. With the defaults below hpMax lands at 19000.
    hpMax: 19000,
    physAttack: 10,
    layerCount: 10,
    hpPerLayer: 1900,
    baseHpPerLayer: 1000,
    // Layer ordering: arr index 0 is the BOTTOM layer (last to deplete —
    // the boss's "second wind"); index N-1 is the TOP layer (first to
    // break). User-visible numbering inverts this (top = x10, bottom =
    // x1), so the multiplier ramp is set so the BOTTOM layer is toughest.
    //
    //   user x10 (top)    -> idx 9 -> 1.0  -> 1000 HP   ← first to break
    //   user x9           -> idx 8 -> 1.2  -> 1200 HP
    //   user x8           -> idx 7 -> 1.4  -> 1400 HP
    //   user x7           -> idx 6 -> 1.6  -> 1600 HP
    //   user x6           -> idx 5 -> 1.8  -> 1800 HP
    //   user x5           -> idx 4 -> 2.0  -> 2000 HP
    //   user x4           -> idx 3 -> 2.2  -> 2200 HP
    //   user x3           -> idx 2 -> 2.4  -> 2400 HP
    //   user x2           -> idx 1 -> 2.6  -> 2600 HP
    //   user x1 (bottom)  -> idx 0 -> 2.8  -> 2800 HP   ← last to break
    layerMultipliers: [2.8, 2.6, 2.4, 2.2, 2.0, 1.8, 1.6, 1.4, 1.2, 1.0] as number[],
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
  // Настройки фона и позиции босса
  background: {
    offsetY: -190, // Фон выше на 30px (было -160)
    zoomScale: 1.75, // Зум поверх width-fit масштаба (+2%)
    bossOnBgY: 0.47, // Босс ниже на 3% (было 0.44)
    bossScale: 0.387, // Адаптировано под спрайты 927×1650
    introBossMultiplier: 1.0, // Сафира одинакового размера в интро и бою
    introBossYOffset: 0, // Сафира не сдвигается относительно фона при зуме
  },
};

// Загрузить из localStorage
export function loadGameParams() {
  try {
    const saved = localStorage.getItem("match3_params");
    if (saved) {
      const parsed = JSON.parse(saved);
      // SECURITY (F1): Object.assign со вложенными объектами уязвим к prototype pollution
      // если когда-то добавим nested merge. Сейчас GAME_PARAMS.* плоские, JSON.parse
      // блокирует __proto__ — безопасно. background намеренно НЕ читается из
      // localStorage (controls hardcoded by code).
      Object.assign(GAME_PARAMS.player, parsed.player || {});
      Object.assign(GAME_PARAMS.boss, parsed.boss || {});
      Object.assign(GAME_PARAMS.tiles, parsed.tiles || {});
      Object.assign(GAME_PARAMS.bossAbilities, parsed.bossAbilities || {});
      if (parsed.bossPattern && Array.isArray(parsed.bossPattern)) {
        GAME_PARAMS.bossPattern = parsed.bossPattern;
      }
      // Загружаем стоимость скиллов
      if (parsed.skillCosts) {
        if (parsed.skillCosts.powerStrike !== undefined) SKILL_CONFIG.powerStrike.cost = parsed.skillCosts.powerStrike;
        if (parsed.skillCosts.stun !== undefined) SKILL_CONFIG.stun.cost = parsed.skillCosts.stun;
        if (parsed.skillCosts.heal !== undefined) SKILL_CONFIG.heal.cost = parsed.skillCosts.heal;
        if (parsed.skillCosts.hammer !== undefined) SKILL_CONFIG.hammer.cost = parsed.skillCosts.hammer;
      }

      // Валидация критических значений
      GAME_PARAMS.player.hpMax = clamp(GAME_PARAMS.player.hpMax, 1, 10000);
      GAME_PARAMS.player.manaMax = clamp(GAME_PARAMS.player.manaMax, 1, 10000);
      GAME_PARAMS.player.physAttack = clamp(GAME_PARAMS.player.physAttack, 0, 1000);
      GAME_PARAMS.player.magAttack = clamp(GAME_PARAMS.player.magAttack, 0, 1000);
      GAME_PARAMS.boss.physAttack = clamp(GAME_PARAMS.boss.physAttack, 0, 1000);
      GAME_PARAMS.boss.layerCount = clamp(GAME_PARAMS.boss.layerCount, 1, 20);
      GAME_PARAMS.boss.baseHpPerLayer = clamp(GAME_PARAMS.boss.baseHpPerLayer, 1, 10000);
      // Validate & pad layer multipliers to match layerCount
      if (!Array.isArray(GAME_PARAMS.boss.layerMultipliers)) {
        GAME_PARAMS.boss.layerMultipliers = [];
      }
      while (GAME_PARAMS.boss.layerMultipliers.length < GAME_PARAMS.boss.layerCount) {
        GAME_PARAMS.boss.layerMultipliers.push(1.0);
      }
      GAME_PARAMS.boss.layerMultipliers.length = GAME_PARAMS.boss.layerCount;
      GAME_PARAMS.boss.layerMultipliers = GAME_PARAMS.boss.layerMultipliers.map(
        (m: number) => clamp(typeof m === "number" ? m : 1.0, 0.1, 10.0)
      );
      // Recalculate hpMax from layers
      recalcBossHpMax();
      GAME_PARAMS.tiles.hpPerTile = clamp(GAME_PARAMS.tiles.hpPerTile, 0, 1000);
      GAME_PARAMS.tiles.mpPerTile = clamp(GAME_PARAMS.tiles.mpPerTile, 0, 1000);
      GAME_PARAMS.tiles.swordDamage = clamp(GAME_PARAMS.tiles.swordDamage, 0, 1000);
      GAME_PARAMS.tiles.starDamage = clamp(GAME_PARAMS.tiles.starDamage, 0, 1000);
      // Boss abilities
      const ba = GAME_PARAMS.bossAbilities;
      ba.attackDamage = clamp(ba.attackDamage, 0, 10000);
      ba.attackCooldown = clamp(ba.attackCooldown, 1, 100);
      ba.bombCount = clamp(ba.bombCount, 0, 20);
      ba.bombCooldown = clamp(ba.bombCooldown, 1, 100);
      ba.bombDamage = clamp(ba.bombDamage, 0, 10000);
      ba.bombsAbilityCooldown = clamp(ba.bombsAbilityCooldown, 1, 100);
      ba.shieldDuration = clamp(ba.shieldDuration, 1, 100);
      ba.shieldCooldown = clamp(ba.shieldCooldown, 1, 100);
      ba.powerStrikeDamage = clamp(ba.powerStrikeDamage, 0, 10000);
      ba.powerStrikeManaDrain = clamp(ba.powerStrikeManaDrain, 0, 10000);
      ba.powerStrikeCooldown = clamp(ba.powerStrikeCooldown, 1, 100);
      // Skill costs
      SKILL_CONFIG.powerStrike.cost = clamp(SKILL_CONFIG.powerStrike.cost, 0, 10000);
      SKILL_CONFIG.stun.cost = clamp(SKILL_CONFIG.stun.cost, 0, 10000);
      SKILL_CONFIG.heal.cost = clamp(SKILL_CONFIG.heal.cost, 0, 10000);
      SKILL_CONFIG.hammer.cost = clamp(SKILL_CONFIG.hammer.cost, 0, 10000);
      // Boss pattern must be non-empty
      if (!GAME_PARAMS.bossPattern.length) {
        GAME_PARAMS.bossPattern = [1, 2, 1, 3, 1, 4];
      }
    }
  } catch {
    // Игнорируем ошибки
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
  const screenPadding = SCREEN_PADDING;
  const bottomPadding = 16 + SAFE_AREA.bottom; // Базовый отступ

  // 1. Кнопки скиллов (круглые, самый низ) — размер адаптивный к ширине
  const avatarRightForSkills = screenPadding + 4 + 65 / 2 + 65 / 2 + 8; // avatar right edge
  const skillsAvailW = GAME_WIDTH - avatarRightForSkills - screenPadding;
  const skillButtonSize = Math.min(78, Math.floor((skillsAvailW - 3 * 6) / 4));
  const skillButtonSpacing = 12;
  const skillCostOffset = 4; // бейдж маны теперь на кнопке, не под ней
  const skillButtonsY = GAME_HEIGHT - bottomPadding - skillButtonSize / 2 - skillCostOffset;

  // 2. MP бар игрока (над скиллами с отступом)
  const playerBarHeight = 14;
  const skillsTopY = skillButtonsY - skillButtonSize / 2; // верх кнопок скиллов
  const playerMpBarY = skillsTopY - 16 - playerBarHeight; // 16px отступ между скиллами и MP баром

  // 3. HP бар игрока (над MP)
  const playerHpBarY = playerMpBarY - playerBarHeight - 6;

  // 4. Аватар игрока - от HP бара до низа скиллов (включая текст стоимости)
  const avatarWidth = 65; // На 30% шире (было 50)
  const skillsBottomY = skillButtonsY + skillButtonSize / 2 + skillCostOffset; // низ текста стоимости
  const avatarHeight = skillsBottomY - playerHpBarY;
  const avatarFramePadding = 4;
  const avatarX = screenPadding + avatarFramePadding + avatarWidth / 2;
  const avatarY = playerHpBarY + avatarHeight / 2;

  // HP/MP бары начинаются после аватара
  const playerBarsX = avatarX + avatarWidth / 2 + 8;
  const playerBarWidth = GAME_WIDTH - playerBarsX - screenPadding;

  // 5. Match-3 поле (над нижней панелью, выровнено по ширине)
  const boardBottomY = playerHpBarY - 12;
  const boardOriginY = boardBottomY - boardHeight;
  const boardOriginX = screenPadding + BOARD_PADDING;

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

    // Кнопки скиллов (центрированы после аватара, spacing адаптивный)
    skillButtonsY,
    skillButtonSize,
    skillButtonSpacing: (() => {
      const avatarRightEdge = avatarX + avatarWidth / 2 + 8;
      const availableWidth = GAME_WIDTH - avatarRightEdge - screenPadding;
      const totalButtonsOnly = skillButtonSize * 4;
      const maxSpacing = skillButtonSpacing;
      const fitSpacing = Math.floor((availableWidth - totalButtonsOnly) / 3);
      return Math.min(maxSpacing, Math.max(4, fitSpacing));
    })(),
    skillButtonsStartX: (() => {
      const avatarRightEdge = avatarX + avatarWidth / 2 + 8;
      const availableWidth = GAME_WIDTH - avatarRightEdge - screenPadding;
      const totalButtonsOnly = skillButtonSize * 4;
      const fitSpacing = Math.min(skillButtonSpacing, Math.max(4, Math.floor((availableWidth - totalButtonsOnly) / 3)));
      const totalButtonsWidth = skillButtonSize * 4 + fitSpacing * 3;
      return avatarRightEdge + (availableWidth - totalButtonsWidth) / 2 + skillButtonSize / 2;
    })(),
  };
};

// Обновляется при вызове updateScaledValues
export let UI_LAYOUT = getUILayout();

// UI Colors - centralized color palette
export const UI_COLORS = {
  background: 0x0d0f1a,
  boardBg: 0x161820,
  bossHp: 0xde3e3e,
  playerHp: 0x4caf50,
  playerMana: 0x3b82f6,
  playerTurnText: "#9ef7a5",
  bossTurnText: "#ffb347",
  defusedFlash: 0x44ff66,
} as const;

// Boss layered HP bar (dynamic from GAME_PARAMS)
export const getBossLayerCount = () => GAME_PARAMS.boss.layerCount;

/**
 * Returns HP for each layer (index 0 = bottom/last layer, index N-1 = top/first layer).
 * Each layer HP = baseHpPerLayer * layerMultipliers[i].
 * Array length = layerCount.
 *
 * v1 callers: invoke without args — uses GAME_PARAMS defaults.
 * v2 callers (EncounterBuilder): pass encounter-specific values.
 */
export function getBossLayerHpArray(
  layerCount: number = GAME_PARAMS.boss.layerCount,
  baseHpPerLayer: number = GAME_PARAMS.boss.baseHpPerLayer,
  multipliers: number[] = GAME_PARAMS.boss.layerMultipliers,
): number[] {
  const arr: number[] = [];
  for (let i = 0; i < layerCount; i++) {
    const m = i < multipliers.length ? multipliers[i] : 1.0;
    arr.push(Math.ceil(baseHpPerLayer * m));
  }
  return arr;
}

/** Recalculate hpMax from layer multipliers */
export function recalcBossHpMax() {
  const arr = getBossLayerHpArray();
  GAME_PARAMS.boss.hpMax = arr.reduce((sum, hp) => sum + hp, 0);
  GAME_PARAMS.boss.hpPerLayer = Math.ceil(GAME_PARAMS.boss.hpMax / GAME_PARAMS.boss.layerCount);
}

/**
 * Given current boss HP, returns 1-based layer index using per-layer HP array.
 * Layer N (top) is first to deplete, layer 1 (bottom) is last.
 *
 * Optional params allow per-encounter override (used by GameScene v2 patch).
 * Zero-arg invocation uses GAME_PARAMS defaults — backward-compatible with v1.
 */
export function getBossLayerIndex(
  currentHp: number,
  layerCount: number = GAME_PARAMS.boss.layerCount,
  baseHpPerLayer: number = GAME_PARAMS.boss.baseHpPerLayer,
  multipliers: number[] = GAME_PARAMS.boss.layerMultipliers,
): number {
  if (currentHp <= 0) return 0;
  const arr = getBossLayerHpArray(layerCount, baseHpPerLayer, multipliers);
  let cumulative = 0;
  for (let i = 0; i < arr.length; i++) {
    cumulative += arr[i];
    if (currentHp <= cumulative) return i + 1;
  }
  return arr.length;
}

export const BOSS_LAYER_COLORS = [0xde3e3e, 0xf5c542] as const;

// Input thresholds
export const INPUT_THRESHOLD = {
  tapDistance: 10,
} as const;

// CRIT multipliers for enhanced matches (4+ tiles)
export const CRIT_MULTIPLIERS = {
  /** Match of exactly 4 tiles */
  match4: 2,
  /** Match of 5+ tiles (or L-shape) */
  match5: 3,
} as const;

// Perk system constants
export const PERK_MAX_LEVEL = 5;
export const PERK_CHOICES = 3;

// Tile classification helpers
export const DAMAGE_TILES: readonly TileKind[] = [TileKind.Sword, TileKind.Star] as const;
export const RESOURCE_TILES: readonly TileKind[] = [TileKind.Mana, TileKind.Heal] as const;

export type SkillId = "powerStrike" | "stun" | "heal" | "hammer";

export interface SkillDef {
  name: string;
  icon: string;
  cost: number;
  damage: number;
  heal: number;
  cooldown: number;
  stunTurns?: number;
  isInteractive?: boolean;
  iconTexture?: string;
  description: string;
  hammerPattern?: "single" | "cross" | "square";
}

export const SKILL_CONFIG: Record<SkillId, SkillDef> = {
  powerStrike: {
    name: "Мощный удар",
    icon: "⚡",
    cost: 40,
    damage: GAME_PARAMS.player.physAttack * 10,
    heal: 0,
    cooldown: 3,
    description: "Физ. урон x10",
  },
  stun: {
    name: "Оглушение",
    icon: "⏳",
    cost: 60,
    damage: 0,
    heal: 0,
    cooldown: 6,
    stunTurns: 1,
    description: "+1 к КД босса",
  },
  heal: {
    name: "Лечение",
    icon: "💚",
    cost: 30,
    damage: 0,
    heal: 30,
    cooldown: 2,
    iconTexture: "tile_heal",
    description: "+30 HP",
  },
  hammer: {
    name: "Взрыв камня",
    icon: "🔨",
    cost: 40,
    damage: 0,
    heal: 0,
    cooldown: 4,
    isInteractive: true,
    description: "Взрывает 1 фишку",
    hammerPattern: "single",
  },
};
