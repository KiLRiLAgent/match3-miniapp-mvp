/**
 * GOLD STANDARD: Dynamic progression formula with static table fallback
 *
 * When a game system needs to extend beyond a hand-tuned static table
 * (like XP thresholds, difficulty curves, reward scaling), use this pattern:
 * keep the static table for the authored range, compute dynamically beyond.
 *
 * This avoids two extremes:
 *   - Pure static table: requires editing the table every time the cap moves
 *   - Pure formula: loses the hand-tuned precision of the authored values
 *
 * 1. STATIC TABLE stays untouched
 *
 *    The existing hand-tuned values are preserved as-is. Zero balance change
 *    for the authored range:
 *
 *      const XP_TABLE: readonly number[] = [
 *        0, 100, 250, 500, 850, 1300, 1850, 2500, 3250, 4100, 5050,
 *      ];
 *
 * 2. DYNAMIC EXTENSION function
 *
 *    A pure function computes thresholds beyond the table by analyzing and
 *    continuing the existing curve pattern:
 *
 *      function getXpThreshold(level: number): number {
 *        if (level <= 1) return 0;
 *        if (level <= XP_TABLE.length) return XP_TABLE[level - 1];
 *        // Continue the curve: deltas grow by +100 per level
 *        let xp = XP_TABLE[XP_TABLE.length - 1];
 *        let delta = 950; // last known delta
 *        for (let l = XP_TABLE.length + 1; l <= level; l++) {
 *          delta += 100;
 *          xp += delta;
 *        }
 *        return xp;
 *      }
 *
 *    Key properties:
 *    - Returns EXACTLY the static table values for the authored range
 *    - Continues the same growth pattern (analyze the deltas between
 *      consecutive entries to find the acceleration)
 *    - Monotonically increasing — no level costs less than the previous
 *    - Pure function — same input always gives same output
 *
 * 3. ALL CALLERS use the function, not the table
 *
 *    Replace every direct XP_TABLE[index] access with the function call.
 *    The function IS the API; the table is an implementation detail:
 *
 *      // WRONG — breaks for levels beyond the table
 *      const threshold = XP_TABLE[player.level];
 *
 *      // RIGHT — works for any level
 *      const threshold = getXpThreshold(player.level + 1);
 *
 * 4. REMOVE cap guards
 *
 *    Once the formula extends indefinitely, remove all `level >= MAX_LEVEL`
 *    guards and `MAX_LEVEL` constants. The while loop in applyXpGain no
 *    longer needs a cap:
 *
 *      while (save.player.xp >= getXpThreshold(save.player.level + 1)) {
 *        save.player.level += 1;
 *        save.player.pendingStatPoints = (save.player.pendingStatPoints ?? 0) + 1;
 *      }
 *
 * 5. UI naturally handles it
 *
 *    If the UI was already written against the system API (getXpToNextLevel,
 *    getLevelEntryXp) rather than the raw table, no UI changes are needed.
 *    The "МАКС" branch (xpToNext === 0) becomes unreachable but harmless.
 *
 * 6. VERIFY the curve
 *
 *    Spot-check a few values to ensure the formula produces reasonable
 *    numbers. For the XP curve:
 *      Level 12: 5050 + 1050 = 6100
 *      Level 13: 6100 + 1150 = 7250
 *      Level 14: 7250 + 1250 = 8500
 *      Level 20: ~20,000 (each level ~1650 XP)
 *
 * Reference:
 *   - `src/v2/systems/ProgressionSystem.ts` → `getXpThreshold()` function
 *   - Phase 2C unlimited-leveling commit (ed2e28e)
 */
