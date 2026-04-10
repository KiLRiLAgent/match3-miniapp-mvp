/**
 * ArenaPerkSystem — singleton managing perk state for arena runs.
 *
 * Writes to SaveData.arena.activeRun.{perkLevels, takenPassives, statPerkCounts}
 * via gameState.patch. Reads SKILL_LEVEL_TABLE (exported from v1 PerkManager)
 * and perk registries from content/perks/.
 *
 * Card generation algorithm per brief §14:
 *   Slot 1: skill perk (if any unmaxed)
 *   Slot 2: passive perk (if any remaining in pool)
 *   Slots 3+: unique stat perks (safety net — always available)
 *
 * Zero Phaser imports. Zero SKILL_CONFIG mutation.
 */

import { gameState } from "../core/GameState";
import { MAX_PERK_LEVEL } from "../../game/PerkManager";
import type { SkillId } from "../../game/config";
import { PASSIVE_PERKS } from "../content/perks/passive-perks";
import { STAT_PERKS } from "../content/perks/stat-perks";

// ─────────────────────────────────────────────────────────────────────────────
// Card types — discriminated union for the 3 perk categories
// ─────────────────────────────────────────────────────────────────────────────

export interface SkillPerkCard {
  type: "skill";
  skillId: SkillId;
  name: string;
  description: string;
  icon: string;
  currentLevel: number;
  nextLevel: number;
}

export interface PassivePerkCard {
  type: "passive";
  perkId: string;
  name: string;
  description: string;
}

export interface StatPerkCard {
  type: "stat";
  perkId: string;
  name: string;
  description: string;
  currentCount: number;
}

export type PerkCard = SkillPerkCard | PassivePerkCard | StatPerkCard;

// ─────────────────────────────────────────────────────────────────────────────
// Skill metadata for card generation (mirrors PerkManager.PERK_DEFS)
// ─────────────────────────────────────────────────────────────────────────────

const SKILL_META: Record<SkillId, { name: string; icon: string; descriptions: string[] }> = {
  powerStrike: {
    name: "Мощный удар",
    icon: "⚡",
    descriptions: [
      "Наносит мощный физический урон",
      "Урон способности ↑",
      "Урон способности ↑↑",
      "Урон способности ↑↑↑",
      "Урон способности ↑↑↑↑",
    ],
  },
  stun: {
    name: "Оглушение",
    icon: "⏳",
    descriptions: [
      "Оглушает противника на 1 ход",
      "Стоимость способности ↓",
      "Оглушает на 2 хода",
      "Стоимость способности ↓↓",
      "Оглушает на 3 хода",
    ],
  },
  heal: {
    name: "Лечение",
    icon: "💚",
    descriptions: [
      "Восстанавливает здоровье",
      "Лечение ↑",
      "Лечение ↑↑",
      "Лечение ↑↑↑",
      "Лечение ↑↑↑↑",
    ],
  },
  hammer: {
    name: "Взрыв камня",
    icon: "🔨",
    descriptions: [
      "Взрывает 1 фишку на поле",
      "Стоимость способности ↓",
      "Взрывает 5 фишек крестом",
      "Стоимость способности ↓↓",
      "Взрывает 9 фишек квадратом",
    ],
  },
};

const ALL_SKILL_IDS: SkillId[] = ["powerStrike", "stun", "heal", "hammer"];

/** Max level per skill — level 1 = unlock, +MAX_PERK_LEVEL upgrades. */
const SKILL_MAX_LEVEL = MAX_PERK_LEVEL + 1;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function randomFrom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton
// ─────────────────────────────────────────────────────────────────────────────

class ArenaPerkSystem {
  /**
   * Initialize perk state for a new run. Called by ArenaSystem.startNewRun()
   * after the run state is created. Resets perkLevels/takenPassives/statPerkCounts.
   */
  initForRun(): void {
    gameState.patch((s) => {
      if (!s.arena.activeRun) return;
      s.arena.activeRun.perkLevels = {};
      s.arena.activeRun.takenPassives = [];
      s.arena.activeRun.statPerkCounts = {};
    });
  }

  /**
   * Generate 3 perk cards for the player to choose from.
   * Algorithm per brief §14:
   *   1. Try to add a skill card (if any skill is not maxed)
   *   2. Try to add a passive card (if any passive remains)
   *   3. Fill remaining with unique stat cards
   */
  getCardOptions(): PerkCard[] {
    const run = gameState.get().arena.activeRun;
    if (!run) return [];

    const perkLevels = run.perkLevels ?? {};
    const takenPassives = run.takenPassives ?? [];
    const statPerkCounts = run.statPerkCounts ?? {};

    const cards: PerkCard[] = [];

    // Slot 1: skill perk (if any unmaxed)
    const unmaxedSkills = ALL_SKILL_IDS.filter(
      (id) => (perkLevels[id] ?? 0) < SKILL_MAX_LEVEL,
    );
    if (unmaxedSkills.length > 0) {
      const skillId = randomFrom(unmaxedSkills);
      const level = perkLevels[skillId] ?? 0;
      const meta = SKILL_META[skillId];
      cards.push({
        type: "skill",
        skillId,
        name: meta.name,
        description: meta.descriptions[level] ?? meta.descriptions[meta.descriptions.length - 1],
        icon: meta.icon,
        currentLevel: level,
        nextLevel: level + 1,
      });
    }

    // Slot 2: passive perk (if any remain in pool)
    const takenSet = new Set(takenPassives);
    const availablePassives = PASSIVE_PERKS.filter((p) => !takenSet.has(p.id));
    if (availablePassives.length > 0) {
      const passive = randomFrom(availablePassives);
      cards.push({
        type: "passive",
        perkId: passive.id,
        name: passive.name,
        description: passive.description,
      });
    }

    // Slots 3+: fill with unique stat perks
    const usedStatIds = new Set<string>();
    while (cards.length < 3) {
      const available = STAT_PERKS.filter((s) => !usedStatIds.has(s.id));
      if (available.length === 0) break; // safety — should never happen (6 stat types > 3 slots)
      const stat = randomFrom(available);
      usedStatIds.add(stat.id);
      cards.push({
        type: "stat",
        perkId: stat.id,
        name: stat.name,
        description: stat.description,
        currentCount: statPerkCounts[stat.id] ?? 0,
      });
    }

    return cards;
  }

  /**
   * Apply a chosen perk card to the active run state.
   * Writes to SaveData via gameState.patch.
   */
  applyCard(card: PerkCard): void {
    gameState.patch((s) => {
      const run = s.arena.activeRun;
      if (!run) return;

      // Ensure perk fields exist (backward compat with mid-run saves)
      if (!run.perkLevels) run.perkLevels = {};
      if (!run.takenPassives) run.takenPassives = [];
      if (!run.statPerkCounts) run.statPerkCounts = {};

      switch (card.type) {
        case "skill": {
          const current = run.perkLevels[card.skillId] ?? 0;
          if (current < SKILL_MAX_LEVEL) {
            run.perkLevels[card.skillId] = current + 1;
          }
          break;
        }
        case "passive": {
          if (!run.takenPassives.includes(card.perkId)) {
            run.takenPassives.push(card.perkId);
          }
          break;
        }
        case "stat": {
          run.statPerkCounts[card.perkId] = (run.statPerkCounts[card.perkId] ?? 0) + 1;
          break;
        }
      }
    });
  }

  /** Read current perk levels for the active run (or empty if no run). */
  getPerkLevels(): Record<string, number> {
    return gameState.get().arena.activeRun?.perkLevels ?? {};
  }

  /** Read taken passive IDs for the active run (or empty if no run). */
  getTakenPassives(): string[] {
    return gameState.get().arena.activeRun?.takenPassives ?? [];
  }

  /** Read stat perk counts for the active run (or empty if no run). */
  getStatPerkCounts(): Record<string, number> {
    return gameState.get().arena.activeRun?.statPerkCounts ?? {};
  }
}

export const arenaPerkSystem = new ArenaPerkSystem();
