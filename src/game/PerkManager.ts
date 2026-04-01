import { SKILL_CONFIG, PERK_MAX_LEVEL, PERK_CHOICES, GAME_PARAMS } from "./config";
import type { SkillId } from "./config";

export const MAX_PERK_LEVEL = PERK_MAX_LEVEL;
export const PERKS_TO_OFFER = PERK_CHOICES;

export interface PerkDef {
  skillId: SkillId;
  name: string;
  icon: string;
  /** First entry = unlock description, rest = upgrade descriptions */
  descriptions: string[];
}

export interface PerkUpgrade {
  skillId: SkillId;
  level: number;
  isNewUnlock: boolean;
}

const PERK_DEFS: PerkDef[] = [
  {
    skillId: "powerStrike",
    name: "Мощный удар",
    icon: "⚡",
    descriptions: [
      "Наносит мощный физический урон",
      "Урон способности ↑",
      "Урон способности ↑↑",
      "Урон способности ↑↑↑",
      "Урон способности ↑↑↑↑",
      "Макс. урон способности",
    ],
  },
  {
    skillId: "stun",
    name: "Оглушение",
    icon: "⏳",
    descriptions: [
      "Оглушает противника на 1 ход",
      "Стоимость способности ↓",
      "Оглушает на 2 хода",
      "Стоимость способности ↓↓",
      "Оглушает на 3 хода",
      "Макс. оглушение",
    ],
  },
  {
    skillId: "heal",
    name: "Лечение",
    icon: "💚",
    descriptions: [
      "Восстанавливает здоровье",
      "Лечение ↑",
      "Лечение ↑↑",
      "Лечение ↑↑↑",
      "Лечение ↑↑↑↑",
      "Макс. лечение",
    ],
  },
  {
    skillId: "hammer",
    name: "Взрыв камня",
    icon: "🔨",
    descriptions: [
      "Взрывает 1 фишку на поле",
      "Стоимость способности ↓",
      "Взрывает 5 фишек крестом",
      "Стоимость способности ↓↓",
      "Взрывает 9 фишек квадратом",
      "Макс. взрыв",
    ],
  },
];

/**
 * Per-level stats for each skill.
 * Index 0 = level 1 (unlock), index 4 = level 5 (max).
 */
const SKILL_LEVEL_TABLE: Record<SkillId, Array<{ cost: number; cooldown: number; damage?: number; heal?: number; stunTurns?: number; hammerPattern?: "single" | "cross" | "square" }>> = {
  powerStrike: [
    { cost: 40, cooldown: 3, damage: 10 },  // physAttack * 10
    { cost: 40, cooldown: 3, damage: 15 },  // physAttack * 15
    { cost: 40, cooldown: 3, damage: 20 },  // physAttack * 20
    { cost: 40, cooldown: 3, damage: 25 },  // physAttack * 25
    { cost: 40, cooldown: 3, damage: 30 },  // physAttack * 30
  ],
  stun: [
    { cost: 60, cooldown: 6, stunTurns: 1 },
    { cost: 50, cooldown: 6, stunTurns: 1 },
    { cost: 50, cooldown: 6, stunTurns: 2 },
    { cost: 40, cooldown: 6, stunTurns: 2 },
    { cost: 40, cooldown: 6, stunTurns: 3 },
  ],
  heal: [
    { cost: 30, cooldown: 2, heal: 30 },
    { cost: 30, cooldown: 2, heal: 40 },
    { cost: 30, cooldown: 2, heal: 50 },
    { cost: 30, cooldown: 2, heal: 60 },
    { cost: 30, cooldown: 2, heal: 70 },
  ],
  hammer: [
    { cost: 40, cooldown: 4, hammerPattern: "single" },
    { cost: 30, cooldown: 4, hammerPattern: "single" },
    { cost: 30, cooldown: 3, hammerPattern: "cross" },
    { cost: 20, cooldown: 3, hammerPattern: "cross" },
    { cost: 20, cooldown: 3, hammerPattern: "square" },
  ],
};

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export class PerkManager {
  /** Level 0 = not unlocked. Level 1 = just unlocked (base). Level 2+ = upgraded. */
  private levels: Record<SkillId, number> = {
    powerStrike: 0,
    stun: 0,
    heal: 0,
    hammer: 0,
  };

  /** Skills in the order they were unlocked — used for button positioning */
  private _unlockedOrder: SkillId[] = [];

  get unlockedOrder(): readonly SkillId[] {
    return this._unlockedOrder;
  }

  isUnlocked(skillId: SkillId): boolean {
    return this.levels[skillId] >= 1;
  }

  getLevel(skillId: SkillId): number {
    return this.levels[skillId];
  }

  isMaxLevel(skillId: SkillId): boolean {
    return this.levels[skillId] >= MAX_PERK_LEVEL + 1; // +1 because level 1 = unlock
  }

  private getNewSkills(): PerkDef[] {
    return PERK_DEFS.filter((p) => !this.isUnlocked(p.skillId));
  }

  private getUpgradeableSkills(): PerkDef[] {
    return PERK_DEFS.filter((p) => this.isUnlocked(p.skillId) && !this.isMaxLevel(p.skillId));
  }

  getRandomPerks(count: number = PERKS_TO_OFFER): PerkDef[] {
    const newSkills = shuffle(this.getNewSkills());
    const upgrades = shuffle(this.getUpgradeableSkills());

    if (newSkills.length === 0) return upgrades.slice(0, count);
    if (upgrades.length === 0) return newSkills.slice(0, count);

    const newCount = Math.min(newSkills.length, count - 1);
    const upgradeCount = Math.min(upgrades.length, count - newCount);
    return [...newSkills.slice(0, newCount), ...upgrades.slice(0, upgradeCount)];
  }

  /** Apply skill stats from level table */
  private applySkillStats(skillId: SkillId, levelIdx: number) {
    const table = SKILL_LEVEL_TABLE[skillId];
    const stats = table[levelIdx];
    if (!stats) return;

    const cfg = SKILL_CONFIG[skillId];
    cfg.cost = stats.cost;
    cfg.cooldown = stats.cooldown;

    if (skillId === "powerStrike" && stats.damage !== undefined) {
      // Damage = physAttack * multiplier
      cfg.damage = GAME_PARAMS.player.physAttack * stats.damage;
    }
    if (stats.heal !== undefined) cfg.heal = stats.heal;
    if (stats.stunTurns !== undefined) cfg.stunTurns = stats.stunTurns;
    if (stats.hammerPattern !== undefined) cfg.hammerPattern = stats.hammerPattern;
  }

  applyPerk(skillId: SkillId): PerkUpgrade {
    if (this.isMaxLevel(skillId)) {
      return { skillId, level: this.levels[skillId], isNewUnlock: false };
    }

    const wasLocked = !this.isUnlocked(skillId);
    this.levels[skillId]++;
    const level = this.levels[skillId];

    if (wasLocked) {
      this._unlockedOrder.push(skillId);
    }

    // Apply stats from level table (level 1 = index 0, level 2 = index 1, etc.)
    this.applySkillStats(skillId, level - 1);

    return { skillId, level, isNewUnlock: wasLocked };
  }

  getNextDescription(skillId: SkillId): string {
    const level = this.levels[skillId];
    const def = PERK_DEFS.find((p) => p.skillId === skillId);
    if (!def || this.isMaxLevel(skillId)) return "";
    return def.descriptions[level] ?? "";
  }

  getManaCost(skillId: SkillId): number {
    return SKILL_CONFIG[skillId].cost;
  }

  reset(): void {
    this.levels = { powerStrike: 0, stun: 0, heal: 0, hammer: 0 };
    this._unlockedOrder = [];
    // Reset all skills to level 1 baseline
    for (const id of Object.keys(SKILL_LEVEL_TABLE) as SkillId[]) {
      this.applySkillStats(id, 0);
    }
  }
}

export { PERK_DEFS };
