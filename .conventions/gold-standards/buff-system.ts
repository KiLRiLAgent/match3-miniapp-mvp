/**
 * GOLD STANDARD: Run-only buff system with decoupled application
 *
 * Phase 2A introduced run-scoped buffs (Archero-style "pick 1 of 3 between
 * fights") that boost player stats during arena combat. The challenge: keep
 * the buff application path COMPLETELY DECOUPLED from non-arena fights so
 * story combat sees ZERO behavior change.
 *
 * 1. PURE READ-ONLY APPLY
 *
 *    BuffSystem.applyToStats takes a base PlayerStats and returns a NEW
 *    PlayerStats with active buffs applied. It NEVER mutates the input or
 *    saves to state. When there is no active arena run, the early return
 *    makes it a perfect identity function for story fights.
 *
 *      // src/v2/systems/BuffSystem.ts
 *      class BuffSystem {
 *        applyToStats(base: PlayerStats): PlayerStats {
 *          const save = gameState.get();
 *          if (!save.arena.activeRun) return base;  // ← key: identity for story
 *
 *          const result: PlayerStats = { ...base };
 *          for (const activeBuff of save.arena.activeRun.activeBuffs) {
 *            const def = BUFFS[activeBuff.buffDefId];
 *            if (!def) continue;
 *            this.applySingleBuff(def.effectType, def.value, result, activeBuff.sourceFightFloor);
 *          }
 *          return result;
 *        }
 *      }
 *
 *    The early-return on `activeRun === null` is THE rule that prevents
 *    coupling. Story fights call this method but get the input back unchanged.
 *
 * 2. SINGLE-LINE HOOK IN EncounterBuilder
 *
 *    The hook in EncounterBuilder.build() is ONE LINE — no other build()
 *    changes. The hook replaces the direct save read with the buffed result.
 *
 *      // src/v2/systems/EncounterBuilder.ts → build()
 *      const playerStats = buffSystem.applyToStats(save.player.stats);
 *      // ... derive bossHpMax, bossLayerHpArray ...
 *      // ... return frozen CombatContext ...
 *
 *    Non-arena fights see identical behavior to before the hook (because
 *    applyToStats early-returns). Arena fights see boosted stats.
 *
 * 3. EXHAUSTIVE BuffEffectType SWITCH
 *
 *    BuffEffectType is a string union — the apply method must handle every
 *    case. TypeScript's exhaustiveness check (default in `--strict`) catches
 *    missing cases at compile time. Stub future-Phase effects with comments
 *    so the switch stays exhaustive without needing to implement everything.
 *
 *      private applySingleBuff(
 *        effectType: BuffEffectType,
 *        value: number,
 *        target: PlayerStats,
 *        sourceFightFloor: number,
 *      ): void {
 *        switch (effectType) {
 *          case "addPhysAttack":  target.physAttack += value; return;
 *          case "addMagAttack":   target.magAttack  += value; return;
 *          case "addMaxHp":       target.hp         += value; return;
 *          case "addMaxMp":       target.mp         += value; return;
 *          case "addCrit":        target.crit       += value; return;
 *          case "physPerFightSurvived": {
 *            const save = gameState.get();
 *            const currentFloor = save.arena.activeRun?.floor ?? sourceFightFloor;
 *            const fightsSurvived = Math.max(0, currentFloor - sourceFightFloor);
 *            target.physAttack += value * fightsSurvived;
 *            return;
 *          }
 *          case "addMpRegen":
 *          case "damageReduction":
 *          case "extraReward":
 *          case "reviveOnDeath":
 *            // Phase 2A: stubs. Phase 2B will integrate addMpRegen +
 *            // damageReduction into GameScene turn loop, reviveOnDeath into
 *            // HP exhaustion handler. extraReward is read separately by
 *            // ArenaRewardScene via getExtraRewardCount().
 *            return;
 *        }
 *      }
 *
 *    Adding a new BuffEffectType requires updating both the union AND the
 *    switch — TypeScript will fail compilation if you forget the switch.
 *
 * 4. EXTRA-REWARD AS SIDE-CHANNEL
 *
 *    Some buff effects don't fit "modify PlayerStats". `extraReward` increases
 *    the number of buff cards shown in ArenaRewardScene. Implementation: a
 *    separate getter that scans active buffs.
 *
 *      getExtraRewardCount(): number {
 *        const save = gameState.get();
 *        if (!save.arena.activeRun) return 0;
 *        let total = 0;
 *        for (const activeBuff of save.arena.activeRun.activeBuffs) {
 *          const def = BUFFS[activeBuff.buffDefId];
 *          if (def?.effectType === "extraReward") total += def.value;
 *        }
 *        return total;
 *      }
 *
 *      // ArenaRewardScene.ts
 *      const choiceCount = DEFAULT_CHOICE_COUNT + buffSystem.getExtraRewardCount();
 *
 * 5. RUN LIFECYCLE OWNS BUFF LIFECYCLE
 *
 *    Buffs live ONLY inside `save.arena.activeRun.activeBuffs`. When
 *    `arenaSystem.completeRun()` or `abortRun()` clears `activeRun`, the
 *    buffs disappear automatically. No separate cleanup code needed.
 *
 *      // ArenaSystem.completeRun() / abortRun()
 *      gameState.patch((s) => {
 *        // ... apply rewards ...
 *        s.arena.activeRun = null;  // ← buffs gone
 *      });
 *
 * 6. WHY THIS PATTERN
 *
 *    - Story fights are 100% protected: applyToStats early-return is the
 *      single guarantee, easy to reason about
 *    - No special fields on EncounterDef or CombatContext for buffs
 *    - No special fields on PlayerStats — just the same hp/mp/physAttack/etc
 *    - Buff lifecycle is automatic (run end = buffs cleared)
 *    - Adding a new buff: add a BuffDef + add a switch case — that's it
 *
 * 7. ANTI-PATTERN
 *
 *    Do NOT couple BuffSystem to non-arena code paths:
 *
 *      // WRONG — non-arena fights now depend on BuffSystem state
 *      class BuffSystem {
 *        applyToStats(base: PlayerStats): PlayerStats {
 *          const save = gameState.get();
 *          // No early return — applies "default buffs" from settings or
 *          // "permanent buffs" from progression
 *          let result = { ...base };
 *          for (const buff of save.permanentBuffs ?? []) {
 *            result = this.applyOne(buff, result);
 *          }
 *          if (save.arena.activeRun) {
 *            for (const buff of save.arena.activeRun.activeBuffs) {
 *              result = this.applyOne(buff, result);
 *            }
 *          }
 *          return result;
 *        }
 *      }
 *
 *    This breaks the decoupling rule — if `permanentBuffs` exists or
 *    progression buffs are added later, story fights see different stats
 *    than they did before, which would silently change game balance.
 *
 *    Per Phase 2A R2: BuffSystem MUST early-return when `activeRun === null`.
 *
 * Reference:
 *   - src/v2/systems/BuffSystem.ts (the system)
 *   - src/v2/systems/EncounterBuilder.ts (the single hook)
 *   - src/v2/content/buffs/index.ts (BUFFS registry, 10 defs)
 *   - src/v2/content/types.ts (BuffEffectType, BuffDef interfaces)
 *   - src/v2/systems/ArenaSystem.ts (run lifecycle that owns buff lifecycle)
 *   - .claude/teams/feature-v2-phase-2a-arena/DECISIONS.md R2
 */
