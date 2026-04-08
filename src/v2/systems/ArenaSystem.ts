/**
 * ArenaSystem — single source of truth for arena run state mutations
 * (Phase 2A).
 *
 * A run is the roguelike unit: 5 normal fights + 1 boss fight across floors
 * 1..6. Persistent state (XP, gold, items) from cleared floors accumulates
 * into `activeRun.accumulatedRewards` and is flushed to SaveData on run
 * completion OR abort (defeat). Permadeath resets `activeRun` to null after
 * the flush — the current floor's lost fight contributes nothing.
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

const BOSS_FLOOR = 6;
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
    const newRun: ArenaRunState = {
      floor: 1,
      enemyType: this.pickEnemyForFloor(1),
      activeBuffs: [],
      accumulatedRewards: { xp: 0, gold: 0, items: [] },
      startedAt: Date.now(),
    };
    gameState.patch((s) => {
      s.arena.activeRun = newRun;
    });
    return newRun;
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

    gameState.patch((s) => {
      const active = s.arena.activeRun;
      if (!active) return;
      active.floor += 1;
      active.enemyType = this.pickEnemyForFloor(active.floor);
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
}

export const arenaSystem = new ArenaSystem();
