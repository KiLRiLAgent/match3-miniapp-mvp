import { SKILL_CONFIG } from "./config";
import type { SkillId } from "./config";

export const MAX_PERK_LEVEL = 5;
export const PERKS_TO_OFFER = 3;

export interface PerkDef {
  skillId: SkillId;
  name: string;
  icon: string;
  descriptions: string[];
}

export interface PerkUpgrade {
  skillId: SkillId;
  level: number;
}

const PERK_DEFS: PerkDef[] = [
  {
    skillId: "powerStrike",
    name: "Мощный удар",
    icon: "⚡",
    descriptions: [
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
      "-5 маны",
      "-10 маны",
      "-15 маны",
      "-1 кулдаун",
      "-1 кулдаун, -15 маны",
    ],
  },
];

export class PerkManager {
  private levels: Record<SkillId, number> = {
    powerStrike: 0,
    stun: 0,
    heal: 0,
    hammer: 0,
  };

  getLevel(skillId: SkillId): number {
    return this.levels[skillId];
  }

  isMaxLevel(skillId: SkillId): boolean {
    return this.levels[skillId] >= MAX_PERK_LEVEL;
  }

  getAvailablePerks(): PerkDef[] {
    return PERK_DEFS.filter((p) => !this.isMaxLevel(p.skillId));
  }

  getRandomPerks(count: number = PERKS_TO_OFFER): PerkDef[] {
    const available = this.getAvailablePerks();
    if (available.length <= count) return [...available];

    const shuffled = [...available];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, count);
  }

  applyPerk(skillId: SkillId): PerkUpgrade {
    if (this.isMaxLevel(skillId)) {
      return { skillId, level: this.levels[skillId] };
    }

    this.levels[skillId]++;
    const level = this.levels[skillId];
    const cfg = SKILL_CONFIG[skillId];

    switch (skillId) {
      case "powerStrike":
        // +20% base damage per level (base is 100)
        cfg.damage = 100 + level * 20;
        break;
      case "stun":
        // +1 stun turn per level (base is 2)
        cfg.stunTurns = 2 + level;
        break;
      case "heal":
        // +10 HP per level (base is 50)
        cfg.heal = 50 + level * 10;
        break;
      case "hammer":
        // levels 1-3: -5 mana each, levels 4-5: -1 cooldown each
        if (level <= 3) {
          cfg.cost = Math.max(0, 20 - level * 5);
        } else {
          cfg.cost = Math.max(0, 20 - 3 * 5);
          cfg.cooldown = Math.max(1, 3 - (level - 3));
        }
        break;
    }

    return { skillId, level };
  }

  getNextDescription(skillId: SkillId): string {
    const level = this.levels[skillId];
    const def = PERK_DEFS.find((p) => p.skillId === skillId);
    if (!def || level >= MAX_PERK_LEVEL) return "";
    return def.descriptions[level];
  }

  getManaCost(skillId: SkillId): number {
    return SKILL_CONFIG[skillId].cost;
  }

  reset(): void {
    this.levels = { powerStrike: 0, stun: 0, heal: 0, hammer: 0 };
  }
}

export { PERK_DEFS };
