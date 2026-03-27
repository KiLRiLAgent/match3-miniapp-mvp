import { SKILL_CONFIG, PERK_MAX_LEVEL, PERK_CHOICES } from "./config";
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
      "Наносит 100 урона",
      "+20% урона",
      "+40% урона",
      "+60% урона",
      "+80% урона",
      "+100% урона",
    ],
  },
  {
    skillId: "stun",
    name: "Стан",
    icon: "⏳",
    descriptions: [
      "Задерживает атаку босса на 2 хода",
      "+1 ход стана",
      "+2 хода стана",
      "+3 хода стана",
      "+4 хода стана",
      "+5 ходов стана",
    ],
  },
  {
    skillId: "heal",
    name: "Хил",
    icon: "💚",
    descriptions: [
      "Восстанавливает 50 HP",
      "+10 HP хила",
      "+20 HP хила",
      "+30 HP хила",
      "+40 HP хила",
      "+50 HP хила",
    ],
  },
  {
    skillId: "hammer",
    name: "Молоток",
    icon: "🔨",
    descriptions: [
      "Удаляет любую фишку с поля",
      "-5 маны",
      "-10 маны",
      "-15 маны",
      "-1 кулдаун",
      "-1 кулдаун, -15 маны",
    ],
  },
];

// Baseline skill values (before any perks) — used to restore on reset
const SKILL_BASELINE: Record<SkillId, { damage: number; heal: number; cost: number; cooldown: number; stunTurns?: number }> = {
  powerStrike: { damage: 100, heal: 0, cost: 40, cooldown: 3 },
  stun:        { damage: 0,   heal: 0, cost: 50, cooldown: 5, stunTurns: 2 },
  heal:        { damage: 0,   heal: 50, cost: 30, cooldown: 2 },
  hammer:      { damage: 0,   heal: 0, cost: 20, cooldown: 3 },
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
    return this.levels[skillId] >= MAX_PERK_LEVEL + 1; // +1 because level 1 = unlock, 2-6 = upgrades
  }

  /** Skills not yet unlocked */
  private getNewSkills(): PerkDef[] {
    return PERK_DEFS.filter((p) => !this.isUnlocked(p.skillId));
  }

  /** Unlocked skills that can still be upgraded */
  private getUpgradeableSkills(): PerkDef[] {
    return PERK_DEFS.filter((p) => this.isUnlocked(p.skillId) && !this.isMaxLevel(p.skillId));
  }

  /**
   * Get perk choices: mix of new skill unlocks + upgrades for existing skills.
   * - New skills fill remaining slots after upgrades (1 upgrade per unlocked skill)
   * - If no new skills left, show only upgrades
   */
  getRandomPerks(count: number = PERKS_TO_OFFER): PerkDef[] {
    const newSkills = shuffle(this.getNewSkills());
    const upgrades = shuffle(this.getUpgradeableSkills());

    if (newSkills.length === 0) {
      // All unlocked — show only upgrades
      return upgrades.slice(0, count);
    }

    if (upgrades.length === 0) {
      // Nothing unlocked yet — show only new skills
      return newSkills.slice(0, count);
    }

    // Mix: upgrades first (1 per unlocked skill), fill rest with new skills
    const upgradeCount = Math.min(upgrades.length, count - 1); // leave at least 1 slot for new
    const newCount = Math.min(newSkills.length, count - upgradeCount);
    return [...upgrades.slice(0, upgradeCount), ...newSkills.slice(0, newCount)];
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
      // Level 1 = just unlocked, use baseline stats (no upgrade yet)
      return { skillId, level, isNewUnlock: true };
    }

    // Level 2+ = upgrade
    const upgradeLevel = level - 1; // upgrade index (1-based)
    const cfg = SKILL_CONFIG[skillId];

    switch (skillId) {
      case "powerStrike":
        cfg.damage = 100 + upgradeLevel * 20;
        break;
      case "stun":
        cfg.stunTurns = 2 + upgradeLevel;
        break;
      case "heal":
        cfg.heal = 50 + upgradeLevel * 10;
        break;
      case "hammer":
        if (upgradeLevel <= 3) {
          cfg.cost = Math.max(0, 20 - upgradeLevel * 5);
        } else {
          cfg.cost = Math.max(0, 20 - 3 * 5);
          cfg.cooldown = Math.max(1, 3 - (upgradeLevel - 3));
        }
        break;
    }

    return { skillId, level, isNewUnlock: false };
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
    // Restore SKILL_CONFIG to baseline values
    for (const id of Object.keys(SKILL_BASELINE) as SkillId[]) {
      const base = SKILL_BASELINE[id];
      const cfg = SKILL_CONFIG[id];
      cfg.damage = base.damage;
      cfg.heal = base.heal;
      cfg.cost = base.cost;
      cfg.cooldown = base.cooldown;
      if (base.stunTurns !== undefined) cfg.stunTurns = base.stunTurns;
    }
  }
}

export { PERK_DEFS };
