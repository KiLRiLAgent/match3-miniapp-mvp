/**
 * ProgressionSystem -- single source of truth for player XP, level-ups,
 * stat point allocation, and effective stat computation.
 *
 * Phase stat-point-allocation: auto stat growth on level-up is REMOVED.
 * Instead, each level-up grants 1 pending stat point that the player
 * manually distributes via PlayerStatsScene UI. The effective stats are
 * computed from base stats + allocated points * per-point values.
 *
 * Allocation workflow:
 *   1. Player opens PlayerStatsScene, sees pending points counter.
 *   2. Taps [+] to tentatively allocate points to stats.
 *   3. Taps [-] to undo tentative allocations (only unsaved ones).
 *   4. Taps "Сохранить" to make allocations permanent.
 *   5. Taps "Сброс" to undo all tentative allocations.
 *
 * Session state: tentative allocations live in `sessionDeltas` (in-memory
 * only). `saveAllocation()` folds them into the persistent `allocatedStats`
 * and zeroes out `sessionDeltas`. `resetPendingAllocation()` returns the
 * session deltas to the pending pool.
 *
 * Inventory integration is injected via `setInventoryProvider` to avoid a
 * hard runtime dependency on InventorySystem.
 */

import { gameState } from "../core/GameState";
import type {
  AllocatedStats,
  EffectivePlayerStats,
  ItemStats,
  PlayerStats,
} from "../core/types";

/**
 * Cumulative XP required to reach each level.
 *
 * `XP_TABLE[n]` is the total XP needed to BE at level `n+1`. Level 1 requires
 * 0 XP (start state), level 2 requires 100 XP, ..., level 11 requires 5050
 * XP. Level 11 is the current cap -- any XP beyond that is retained on the
 * player record but does not grant further level-ups.
 */
const XP_TABLE: readonly number[] = [
  0, 100, 250, 500, 850, 1300, 1850, 2500, 3250, 4100, 5050,
];

const MAX_LEVEL = XP_TABLE.length; // 11

/** Stat value gained per allocated point. */
export const STAT_PER_POINT = {
  hp: 5,
  mp: 4,
  physAttack: 2,
  magAttack: 2,
} as const;

/** Base stats at level 1 (before any allocation or equipment). */
export const BASE_STATS = {
  hp: 200,
  mp: 100,
  physAttack: 10,
  magAttack: 10,
} as const;

/** Allocatable stat keys. */
export type AllocatableStat = keyof AllocatedStats;
const ALLOCATABLE_STATS: readonly AllocatableStat[] = [
  "hp", "mp", "physAttack", "magAttack",
];

/**
 * Optional provider for equipment-derived stat bonuses. Registered by the
 * integration layer once InventorySystem is live.
 */
export type InventoryStatsProvider = () => ItemStats;

/**
 * Result of `applyXpGain` -- lets callers drive post-combat UX.
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
   * In-memory tentative stat deltas for the current allocation session.
   * NOT persisted -- folded into SaveData.player.allocatedStats on
   * `saveAllocation()`, discarded on `resetPendingAllocation()`.
   */
  private sessionDeltas: AllocatedStats = { hp: 0, mp: 0, physAttack: 0, magAttack: 0 };

  /**
   * Wire an equipment stats provider. Called once from the integration
   * layer after InventorySystem has been constructed.
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
   * at `MAX_LEVEL`.
   */
  getXpToNextLevel(): number {
    const player = gameState.get().player;
    if (player.level >= MAX_LEVEL) return 0;
    const nextThreshold = XP_TABLE[player.level];
    return Math.max(0, nextThreshold - player.xp);
  }

  /**
   * Cumulative XP that was required to enter the player's current level.
   */
  getLevelEntryXp(): number {
    const level = gameState.get().player.level;
    if (level <= 1) return 0;
    return XP_TABLE[level - 1];
  }

  /**
   * Grant XP and process any level-ups. Each level-up increments
   * `pendingStatPoints` by 1 (no auto stat growth).
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

      while (
        save.player.level < MAX_LEVEL &&
        save.player.xp >= XP_TABLE[save.player.level]
      ) {
        save.player.level += 1;
        // Grant 1 pending stat point per level gained.
        save.player.pendingStatPoints = (save.player.pendingStatPoints ?? 0) + 1;
      }

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

  // ─── Stat Point Allocation ──────────────────────────────────────────────

  /** Number of unspent pending stat points (persistent + session). */
  getPendingPoints(): number {
    const persistent = gameState.get().player.pendingStatPoints ?? 0;
    const sessionSpent = this.getTotalSessionDeltas();
    return persistent - sessionSpent;
  }

  /** Currently saved allocation (excludes session tentative deltas). */
  getAllocatedStats(): AllocatedStats {
    const saved = gameState.get().player.allocatedStats;
    return {
      hp: saved?.hp ?? 0,
      mp: saved?.mp ?? 0,
      physAttack: saved?.physAttack ?? 0,
      magAttack: saved?.magAttack ?? 0,
    };
  }

  /** Session-tentative deltas (not yet saved). */
  getSessionDeltas(): AllocatedStats {
    return { ...this.sessionDeltas };
  }

  /**
   * Tentatively allocate 1 pending point to a stat.
   * Returns true if successful, false if no pending points available.
   */
  allocatePoint(stat: AllocatableStat): boolean {
    if (this.getPendingPoints() <= 0) return false;
    this.sessionDeltas[stat] += 1;
    this.recalcBaseStats();
    return true;
  }

  /**
   * Return 1 tentatively-allocated point from a stat.
   * Only works for unsaved session deltas (not permanently saved ones).
   * Returns true if successful.
   */
  deallocatePoint(stat: AllocatableStat): boolean {
    if (this.sessionDeltas[stat] <= 0) return false;
    this.sessionDeltas[stat] -= 1;
    this.recalcBaseStats();
    return true;
  }

  /**
   * Make all tentative allocations permanent. Folds `sessionDeltas` into
   * `allocatedStats`, subtracts from `pendingStatPoints`, saves.
   */
  saveAllocation(): void {
    const totalSession = this.getTotalSessionDeltas();
    if (totalSession === 0) return;

    const deltas = { ...this.sessionDeltas };
    gameState.patch((save) => {
      const alloc = save.player.allocatedStats ?? { hp: 0, mp: 0, physAttack: 0, magAttack: 0 };
      alloc.hp += deltas.hp;
      alloc.mp += deltas.mp;
      alloc.physAttack += deltas.physAttack;
      alloc.magAttack += deltas.magAttack;
      save.player.allocatedStats = alloc;
      save.player.pendingStatPoints = Math.max(0, (save.player.pendingStatPoints ?? 0) - totalSession);
    });

    this.sessionDeltas = { hp: 0, mp: 0, physAttack: 0, magAttack: 0 };
    this.recalcBaseStats();
    gameState.flush();
  }

  /**
   * Undo all tentative (unsaved) allocations, returning points to the
   * pending pool. Does NOT touch permanently saved allocations.
   */
  resetPendingAllocation(): void {
    this.sessionDeltas = { hp: 0, mp: 0, physAttack: 0, magAttack: 0 };
    this.recalcBaseStats();
  }

  /**
   * Full progression reset: level 1, xp 0, clear all allocated stats and
   * pending points. Used for the "reset progression" debug feature.
   */
  resetProgression(): void {
    this.sessionDeltas = { hp: 0, mp: 0, physAttack: 0, magAttack: 0 };
    gameState.patch((save) => {
      save.player.level = 1;
      save.player.xp = 0;
      save.player.xpToNext = XP_TABLE[1] ?? 0;
      save.player.allocatedStats = { hp: 0, mp: 0, physAttack: 0, magAttack: 0 };
      save.player.pendingStatPoints = 0;
      save.player.stats = {
        hp: BASE_STATS.hp,
        mp: BASE_STATS.mp,
        physAttack: BASE_STATS.physAttack,
        magAttack: BASE_STATS.magAttack,
        crit: save.player.stats.crit, // preserve crit from equipment/other sources
      };
    });
    gameState.flush();
  }

  /**
   * Recalculate `SaveData.player.stats` from base + total allocation
   * (saved + session tentative). Called after every allocation change.
   */
  private recalcBaseStats(): void {
    const saved = this.getAllocatedStats();
    const session = this.sessionDeltas;
    gameState.patch((save) => {
      save.player.stats.hp = BASE_STATS.hp + (saved.hp + session.hp) * STAT_PER_POINT.hp;
      save.player.stats.mp = BASE_STATS.mp + (saved.mp + session.mp) * STAT_PER_POINT.mp;
      save.player.stats.physAttack = BASE_STATS.physAttack +
        (saved.physAttack + session.physAttack) * STAT_PER_POINT.physAttack;
      save.player.stats.magAttack = BASE_STATS.magAttack +
        (saved.magAttack + session.magAttack) * STAT_PER_POINT.magAttack;
    });
  }

  // ─── Effective Stats ────────────────────────────────────────────────────

  /**
   * Materialize the player's effective stats: base PlayerStats plus any
   * equipment bonuses from the registered inventory provider.
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

  // ─── Helpers ────────────────────────────────────────────────────────────

  private getTotalSessionDeltas(): number {
    return ALLOCATABLE_STATS.reduce((sum, k) => sum + this.sessionDeltas[k], 0);
  }
}

export const progressionSystem = new ProgressionSystem();
