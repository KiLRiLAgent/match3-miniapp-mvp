/**
 * ArenaSystem — single source of truth for arena run state mutations.
 *
 * Phase 2B rework: a run is 10 fights (9 normal + 1 final boss, floors 1..10).
 * Persistent state (XP, gold, items) from cleared floors accumulates into
 * `activeRun.accumulatedRewards` and is flushed to SaveData on run completion
 * OR abort (defeat). Permadeath resets `activeRun` to null after the flush.
 *
 * Per-run difficulty scaling: `difficultyMultiplier = 1.15^totalRunsCompleted`
 * applied to HP + phys/mag attack (NOT layers). Read by CombatBridgeScene
 * and passed to ArenaEncounterGenerator.generate().
 *
 * Mirrors RelationshipSystem / ProgressionSystem / InventorySystem singleton
 * pattern: pure logic, zero Phaser deps, all writes flow through
 * `gameState.patch` so persistence and downstream consumers stay in sync.
 */

import { gameState } from "../core/GameState";
import type { ActiveBuff, ArenaRunState } from "../core/types";
import { ARENA_ENEMIES } from "../content/characters/arena-enemies";
import { progressionSystem } from "./ProgressionSystem";
import { inventorySystem } from "./InventorySystem";
import { ARENA_TOTAL_FLOORS, BUFF_FLOORS } from "./ArenaEncounterGenerator";

const BOSS_FLOOR = ARENA_TOTAL_FLOORS;
const BOSS_ENEMY_ID = "arena_demon";

/** Non-boss enemy pool (floors 1..5). Derived from ARENA_ENEMIES registry. */
const NON_BOSS_ENEMY_IDS: readonly string[] = Object.keys(ARENA_ENEMIES).filter(
  (id) => id !== BOSS_ENEMY_ID,
);

class ArenaSystem {
  /**
   * Start a new arena run. No-op if a run is already active — caller is
   * expected to check `getActiveRun()` first (ArenaScene "Continue" button).
   * Returns the new run state on success, null if a run was already running.
   */
  startNewRun(): ArenaRunState | null {
    const save = gameState.get();
    if (save.arena.activeRun !== null) return null;
    // Phase 2A+ Archero map: pre-roll all 6 floors up front so ArenaRunScene
    // can display the complete path. Floor 6 is always the boss.
    const plannedEnemies = this.pickAllEnemiesForRun();
    const newRun: ArenaRunState = {
      floor: 1,
      enemyType: plannedEnemies[0],
      activeBuffs: [],
      accumulatedRewards: { xp: 0, gold: 0, items: [] },
      startedAt: Date.now(),
      plannedEnemies,
    };
    gameState.patch((s) => {
      s.arena.activeRun = newRun;
    });
    return newRun;
  }

  /**
   * Return the characterIds of all 10 planned floors for the active run.
   * Lazy-fills `plannedEnemies` on pre-fix mid-run saves (backward compat).
   * Returns an empty array if no run is active.
   */
  getPlannedEnemies(): readonly string[] {
    const run = gameState.get().arena.activeRun;
    if (!run) return [];
    if (run.plannedEnemies && run.plannedEnemies.length === BOSS_FLOOR) {
      return run.plannedEnemies;
    }
    // Backward-compat: pre-2B save with 6 floors or missing plannedEnemies.
    // Reconstruct — past floors are unknown so we seed with the current
    // enemy for [currentFloor] and fresh rolls for future floors.
    const filled: string[] = new Array(BOSS_FLOOR).fill("");
    filled[run.floor - 1] = run.enemyType;
    for (let i = 0; i < BOSS_FLOOR; i++) {
      if (filled[i] === "") {
        filled[i] = this.pickEnemyForFloor(i + 1);
      }
    }
    gameState.patch((s) => {
      if (s.arena.activeRun) s.arena.activeRun.plannedEnemies = filled;
    });
    return filled;
  }

  /**
   * Per-run difficulty multiplier: `1.15^totalRunsCompleted`.
   * Run 1 = 1.00x, Run 2 = 1.15x, Run 3 ≈ 1.32x, etc.
   */
  getDifficultyMultiplier(): number {
    const totalRuns = gameState.get().arena.totalRunsCompleted;
    return Math.pow(1.15, totalRuns);
  }

  /** True if this floor should show a buff pick (ArenaRewardScene) after victory. */
  isBuffFloor(floor: number): boolean {
    return BUFF_FLOORS.has(floor);
  }

  /**
   * Check for an incompatible active run from a pre-Phase 2B save (6-floor
   * structure). If detected, flush accumulated rewards to persistent state
   * and null the run so the player can start fresh with the new 10-floor
   * structure. No-op if no run is active or run is already compatible.
   */
  checkActiveRunCompatibility(): void {
    const run = gameState.get().arena.activeRun;
    if (!run) return;
    // Old 6-floor runs won't have perkLevels and will have floor > 0.
    // More reliably: if plannedEnemies exists but length !== BOSS_FLOOR (10),
    // the run was started under the old 6-floor regime.
    const isOldRun =
      (run.plannedEnemies && run.plannedEnemies.length !== BOSS_FLOOR) ||
      (run.perkLevels === undefined && run.floor > 0 && !run.plannedEnemies);
    if (!isOldRun) return;

    // Flush any accumulated rewards from the old run.
    progressionSystem.applyXpGain(run.accumulatedRewards.xp);
    gameState.patch((s) => {
      s.inventory.gold += run.accumulatedRewards.gold;
      s.arena.activeRun = null;
    });
    for (const itemDefId of run.accumulatedRewards.items) {
      inventorySystem.add(itemDefId);
    }
    gameState.flush();
  }

  /**
   * Advance to the next floor after a victory. Accumulates the fight's
   * rewards into `accumulatedRewards`, then either bumps `floor` / rolls a
   * new enemy (floors 1..5) or finalizes the run via `completeRun()` (boss
   * floor cleared). Returns the updated run state, or null if the run was
   * finalized or no run was active.
   */
  advanceFloor(rewardFromFight: {
    xp: number;
    gold: number;
    items: string[];
  }): ArenaRunState | null {
    const run = gameState.get().arena.activeRun;
    if (!run) return null;
    // Snapshot the pre-patch floor explicitly. Defensive: today the patch
    // below only mutates accumulatedRewards, but the snapshot insulates the
    // boss-floor decision from any future patch additions that might touch
    // floor (B4 nitpick on review #5).
    const currentFloor = run.floor;

    // Accumulate rewards from the fight we just won. Single patch keeps
    // persistence atomic — one write per advance.
    gameState.patch((s) => {
      const active = s.arena.activeRun;
      if (!active) return;
      active.accumulatedRewards.xp += rewardFromFight.xp;
      active.accumulatedRewards.gold += rewardFromFight.gold;
      active.accumulatedRewards.items.push(...rewardFromFight.items);
    });

    // Boss floor cleared → run complete.
    if (currentFloor >= BOSS_FLOOR) {
      this.completeRun();
      return null;
    }

    // Phase 2A+: read the next enemy from the pre-rolled path instead of
    // re-rolling, so the Archero map stays consistent with what the player
    // actually fights. Lazy-fill via getPlannedEnemies() for backward compat.
    const plannedEnemies = this.getPlannedEnemies();
    const nextFloor = currentFloor + 1;
    const nextEnemy =
      plannedEnemies[nextFloor - 1] ?? this.pickEnemyForFloor(nextFloor);
    gameState.patch((s) => {
      const active = s.arena.activeRun;
      if (!active) return;
      active.floor = nextFloor;
      active.enemyType = nextEnemy;
    });
    return gameState.get().arena.activeRun;
  }

  /**
   * Finalize a victorious run: flush accumulated rewards to persistent
   * SaveData (XP → progressionSystem, gold → inventory.gold, items →
   * inventorySystem.add), bump `bestScore` to the cleared floor (which is
   * `run.floor` — boss floor), increment `totalRunsCompleted`, clear
   * `activeRun`.
   */
  completeRun(): void {
    const run = gameState.get().arena.activeRun;
    if (!run) return;

    progressionSystem.applyXpGain(run.accumulatedRewards.xp);
    gameState.patch((s) => {
      s.inventory.gold += run.accumulatedRewards.gold;
      if (run.floor > s.arena.bestScore) s.arena.bestScore = run.floor;
      s.arena.totalRunsCompleted += 1;
      s.arena.activeRun = null;
    });
    for (const itemDefId of run.accumulatedRewards.items) {
      inventorySystem.add(itemDefId);
    }
    // Force-persist all reward mutations atomically. Bypasses the autosave
    // debounce so a Telegram WebView background suspend / scene re-mount
    // cannot lose accumulated XP / gold / loot mid-flush (M5 mandate, mirrors
    // CombatBridgeScene MITIGATION-3 pattern).
    gameState.flush();
  }

  /**
   * Finalize a failed/aborted run: rewards from cleared floors are still
   * applied (DECISIONS R5 — both completeRun and abortRun flush persistent
   * rewards). `bestScore` is the LAST cleared floor, which is `floor - 1`
   * because the current floor's fight was lost. Increments
   * `totalRunsFailed`, clears `activeRun`.
   */
  abortRun(): void {
    const run = gameState.get().arena.activeRun;
    if (!run) return;

    progressionSystem.applyXpGain(run.accumulatedRewards.xp);
    gameState.patch((s) => {
      s.inventory.gold += run.accumulatedRewards.gold;
      const cleared = Math.max(0, run.floor - 1);
      if (cleared > s.arena.bestScore) s.arena.bestScore = cleared;
      s.arena.totalRunsFailed += 1;
      s.arena.activeRun = null;
    });
    for (const itemDefId of run.accumulatedRewards.items) {
      inventorySystem.add(itemDefId);
    }
    // Same M5 force-persist as completeRun — defeat is the most likely
    // moment for the player to background the app, so the flush window
    // matters most here.
    gameState.flush();
  }

  /**
   * Append a buff pick to the active run. `sourceFightFloor` records which
   * floor the buff was picked on (used by BuffSystem accumulator buffs like
   * physPerFightSurvived, and by UI tooltips). Returns true on success,
   * false if no run is active.
   */
  addBuff(buffDefId: string): boolean {
    const run = gameState.get().arena.activeRun;
    if (!run) return false;
    const buff: ActiveBuff = {
      buffDefId,
      sourceFightFloor: run.floor,
    };
    gameState.patch((s) => {
      if (!s.arena.activeRun) return;
      s.arena.activeRun.activeBuffs.push(buff);
    });
    return true;
  }

  /**
   * v2: arena HP/mana carry-over — store remaining HP and mana in the active
   * run state. Called from CombatBridgeScene after each arena fight victory.
   */
  saveCarriedStats(hp: number, mana: number): void {
    const run = gameState.get().arena.activeRun;
    if (!run) return;
    gameState.patch((s) => {
      if (!s.arena.activeRun) return;
      s.arena.activeRun.carriedHp = hp;
      s.arena.activeRun.carriedMana = mana;
    });
  }

  /**
   * v2: arena cooldown persistence — store final skill cooldowns in the
   * active run state. Called from CombatBridgeScene after each arena fight.
   */
  setSkillCooldowns(cooldowns: Record<string, number>): void {
    const run = gameState.get().arena.activeRun;
    if (!run) return;
    gameState.patch((s) => {
      if (!s.arena.activeRun) return;
      s.arena.activeRun.skillCooldowns = { ...cooldowns };
    });
  }

  /** Current run state or null if idle. */
  getActiveRun(): ArenaRunState | null {
    return gameState.get().arena.activeRun;
  }

  /** True if the given floor index is the boss floor. */
  isBossFloor(floor: number): boolean {
    return floor >= BOSS_FLOOR;
  }

  /**
   * Pick an enemy characterId for a floor. Floors 1..5 roll uniformly from
   * the non-boss pool; floor 6 returns the fixed boss id. Kept private so
   * `startNewRun` and `advanceFloor` are the only mutation entry points.
   */
  private pickEnemyForFloor(floor: number): string {
    if (floor >= BOSS_FLOOR) return BOSS_ENEMY_ID;
    const idx = Math.floor(Math.random() * NON_BOSS_ENEMY_IDS.length);
    return NON_BOSS_ENEMY_IDS[idx] ?? BOSS_ENEMY_ID;
  }

  /**
   * Pre-roll all 10 floors of a run at `startNewRun`. Floors 1..9 use the
   * standard random pool; floor 10 is always the boss (arena_demon).
   */
  private pickAllEnemiesForRun(): string[] {
    const result: string[] = [];
    for (let floor = 1; floor <= BOSS_FLOOR; floor++) {
      result.push(this.pickEnemyForFloor(floor));
    }
    return result;
  }
}

export const arenaSystem = new ArenaSystem();
