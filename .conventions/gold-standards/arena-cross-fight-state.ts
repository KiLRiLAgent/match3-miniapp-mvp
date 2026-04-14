/**
 * GOLD STANDARD: Arena cross-fight state persistence
 *
 * When adding a new piece of state that must survive between arena fights
 * within a single run (but reset on run start/end), follow this established
 * pattern. Three examples exist: skillCooldowns (Phase 2B), carriedHp, and
 * carriedMana (Phase 2C arena-hp-carry-over).
 *
 * 1. OPTIONAL FIELD on ArenaRunState
 *
 *    Add the field as optional with a JSDoc comment. Optional means existing
 *    mid-run saves load cleanly (undefined = default behavior, no migration
 *    logic needed for the field itself):
 *
 *      // src/v2/core/types.ts
 *      export interface ArenaRunState {
 *        // ... existing fields ...
 *        /** v2: arena HP carry-over — remaining HP after last fight (undefined = full). *\/
 *        carriedHp?: number;
 *      }
 *
 *    SAVE_VERSION must still be bumped with a no-op migration to maintain the
 *    version chain:
 *
 *      // src/v2/core/SaveManager.ts MIGRATIONS
 *      4: (old) => ({ ...old, version: 5 }),
 *
 * 2. MUTATION METHOD on ArenaSystem
 *
 *    All ArenaRunState writes go through ArenaSystem singleton methods that
 *    guard on `activeRun !== null`. Never write to ArenaRunState directly
 *    from scenes:
 *
 *      // src/v2/systems/ArenaSystem.ts
 *      saveCarriedStats(hp: number, mana: number): void {
 *        const run = gameState.get().arena.activeRun;
 *        if (!run) return;           // guard: no-op when no run active
 *        gameState.patch((s) => {
 *          if (!s.arena.activeRun) return;
 *          s.arena.activeRun.carriedHp = hp;
 *          s.arena.activeRun.carriedMana = mana;
 *        });
 *      }
 *
 * 3. TRANSPORT via CombatContext / RawCombatResult
 *
 *    State flows through the existing combat bridge pipeline:
 *
 *    a) EncounterBuilder.build() reads from ArenaRunState, passes via
 *       PlayerCombatStats (frozen, DeepReadonly):
 *
 *         const playerStats: PlayerCombatStats = {
 *           // ... base stats ...
 *           ...(run?.carriedHp !== undefined ? { carriedHp: run.carriedHp } : {}),
 *         };
 *
 *    b) GameScene reads from encounterContext.playerStats in resetState():
 *
 *         // v2: arena HP carry-over
 *         if (this.encounterContext?.playerStats.carriedHp !== undefined) {
 *           this.playerHp = Math.min(this.encounterContext.playerStats.carriedHp, this.playerHp);
 *         }
 *
 *    c) GameScene emits via RawCombatResult in emitV2CombatResult():
 *
 *         remainingHp: this.playerHp,
 *
 *    d) CombatBridgeScene.handleCombatComplete() saves back to ArenaSystem:
 *
 *         if (raw.victory && raw.remainingHp !== undefined && arenaSystem.getActiveRun()) {
 *           arenaSystem.saveCarriedStats(raw.remainingHp, raw.remainingMana);
 *         }
 *
 * 4. ORDERING in GameScene.resetState()
 *
 *    Carried state applies AFTER perk/buff bonuses. The ordering matters:
 *      1. Base stats from encounterContext (hpMax, manaMax)
 *      2. Perk bonuses (manaStart, manaBonusAtStart, etc.)
 *      3. Carried values (floor/ceiling against computed values)
 *
 *    HP uses Math.min (can't exceed max), mana uses Math.max (keep higher
 *    of perk bonus or carried remainder). Add a comment explaining the intent.
 *
 * 5. startNewRun() does NOT set the fields
 *
 *    First fight of a new run uses undefined = full HP / default mana.
 *    Do NOT initialize to explicit values in startNewRun() — undefined IS
 *    the correct initial state.
 *
 * 6. ArenaRunScene DISPLAY
 *
 *    Show the carried state between fights. First fight: "Полное здоровье".
 *    Subsequent fights: bar visualization with current/max values. Use the
 *    same stat source as EncounterBuilder (buffSystem.applyToStats) for
 *    consistent max values.
 *
 * Reference commits:
 *   - skillCooldowns: Phase 2B arena-rework-v2
 *   - carriedHp/carriedMana: Phase 2C arena-hp-carry-over (74d587d)
 */
