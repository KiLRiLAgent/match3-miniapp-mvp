/**
 * ProgressionSystem — single source of truth for player XP, level-ups, and
 * effective stat computation.
 *
 * Mirrors the RelationshipSystem pattern: singleton, pure-logic (zero Phaser
 * deps), all writes flow through `gameState.patch` so persistence and
 * downstream consumers stay in sync.
 *
 * Inventory integration is injected via `setInventoryProvider` to avoid a
 * hard runtime dependency on InventorySystem (which is authored in parallel
 * under task #5). Consumers that want equipment-adjusted stats wire the
 * provider once at boot; without a provider, `computeEffectiveStats` returns
 * a clean snapshot of base PlayerStats.
 */

import { gameState } from "../core/GameState";
import type { ItemStats, PlayerStats, SaveData } from "../core/types";
import type { EffectivePlayerStats } from "../content/types";

/**
 * Cumulative XP required to reach each level.
 *
 * `XP_TABLE[n]` is the total XP needed to BE at level `n+1`. Level 1 requires
 * 0 XP (start state), level 2 requires 100 XP, ..., level 11 requires 5050
 * XP. Level 11 is the current cap — any XP beyond that is retained on the
 * player record but does not grant further level-ups.
 */
const XP_TABLE: readonly number[] = [
  0, 100, 250, 500, 850, 1300, 1850, 2500, 3250, 4100, 5050,
];

const MAX_LEVEL = XP_TABLE.length; // 11

/** Per-level stat growth applied automatically on level up. */
const LEVEL_UP_STAT_GROWTH = {
  hp: 20,
  mp: 10,
  physAttack: 1,
  magAttack: 1,
} as const;

/**
 * Optional provider for equipment-derived stat bonuses. Registered by the
 * integration layer (task #6) once InventorySystem is live. Returning a
 * partial `ItemStats` is enough — undefined keys are treated as zero.
 */
export type InventoryStatsProvider = () => ItemStats;

/**
 * Result of `applyXpGain` — lets callers drive post-combat UX (level-up
 * celebrations, perk prompts, etc.) without re-reading gameState.
 */
export interface XpGainResult {
  newLevel: number;
  leveledUp: boolean;
  previousLevel: number;
  levelsGained: number;
}

class ProgressionSystem {
  private inventoryProvider?: InventoryStatsProvider;

  /**
   * Wire an equipment stats provider. Called once from the integration
   * layer after InventorySystem has been constructed. Calling with
   * `undefined` clears any previous registration (useful for tests).
   */
  setInventoryProvider(provider: InventoryStatsProvider | undefined): void {
    this.inventoryProvider = provider;
  }

  /** Current player level (clamped read, never throws). */
  getCurrentLevel(): number {
    return gameState.get().player.level;
  }

  /**
   * XP remaining before the next level-up. Returns `0` once the player is
   * at `MAX_LEVEL` (no further thresholds exist).
   */
  getXpToNextLevel(): number {
    const player = gameState.get().player;
    if (player.level >= MAX_LEVEL) return 0;
    const nextThreshold = XP_TABLE[player.level]; // XP_TABLE[level] = xp needed for level+1
    return Math.max(0, nextThreshold - player.xp);
  }

  /**
   * Grant XP and process any level-ups that result. Handles multi-level
   * overflow: a large XP award can jump the player from level 1 to level 3
   * in a single call, applying stat growth per level gained.
   *
   * Returns a summary so callers can react (level-up toast, perk pick, etc.)
   * without re-querying gameState.
   */
  applyXpGain(amount: number): XpGainResult {
    if (!Number.isFinite(amount) || amount <= 0) {
      const level = this.getCurrentLevel();
      return { newLevel: level, leveledUp: false, previousLevel: level, levelsGained: 0 };
    }

    let previousLevel = 0;
    let newLevel = 0;

    gameState.patch((save) => {
      previousLevel = save.player.level;
      save.player.xp += Math.floor(amount);

      // Walk up the XP table while the player has crossed the next threshold
      // and is still below MAX_LEVEL. Each step applies stat growth in-place.
      while (
        save.player.level < MAX_LEVEL &&
        save.player.xp >= XP_TABLE[save.player.level]
      ) {
        save.player.level += 1;
        this.applyLevelUpStats(save, save.player.level - 1, save.player.level);
      }

      // Sync xpToNext for UI read-throughs (players.level already reflects
      // the new level; xpToNext becomes 0 at MAX_LEVEL).
      save.player.xpToNext =
        save.player.level >= MAX_LEVEL
          ? 0
          : XP_TABLE[save.player.level] - save.player.xp;

      newLevel = save.player.level;
    });

    const levelsGained = newLevel - previousLevel;
    return {
      newLevel,
      leveledUp: levelsGained > 0,
      previousLevel,
      levelsGained,
    };
  }

  /**
   * Apply per-level stat growth for the range `(fromLevel, toLevel]`.
   *
   * Mutates `save.player.stats` in place — intended to be called from
   * within a `gameState.patch` callback (it takes the draft save directly
   * so multi-level loops stay atomic).
   */
  applyLevelUpStats(save: SaveData, fromLevel: number, toLevel: number): void {
    const delta = toLevel - fromLevel;
    if (delta <= 0) return;
    const stats = save.player.stats;
    stats.hp += LEVEL_UP_STAT_GROWTH.hp * delta;
    stats.mp += LEVEL_UP_STAT_GROWTH.mp * delta;
    stats.physAttack += LEVEL_UP_STAT_GROWTH.physAttack * delta;
    stats.magAttack += LEVEL_UP_STAT_GROWTH.magAttack * delta;
  }

  /**
   * Materialize the player's effective stats: base PlayerStats plus any
   * equipment bonuses from the registered inventory provider. If no
   * provider is wired (Phase 1B before task #6 integration, or tests), the
   * returned object is a shallow clone of base stats — callers can freely
   * mutate it without affecting SaveData.
   */
  computeEffectiveStats(): EffectivePlayerStats {
    const base: PlayerStats = gameState.get().player.stats;
    const bonus: ItemStats = this.inventoryProvider?.() ?? {};

    return {
      hp: base.hp + (bonus.hp ?? 0),
      mp: base.mp + (bonus.mp ?? 0),
      physAttack: base.physAttack + (bonus.physAttack ?? 0),
      magAttack: base.magAttack + (bonus.magAttack ?? 0),
      crit: base.crit + (bonus.crit ?? 0),
    };
  }
}

export const progressionSystem = new ProgressionSystem();
