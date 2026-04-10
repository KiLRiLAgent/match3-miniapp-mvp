/**
 * GOLD STANDARD: Option B derived view for arena perks (zero global mutation)
 *
 * Phase 2B arena rework introduced a perk system that reuses v1's
 * SKILL_LEVEL_TABLE data but NEVER mutates v1 globals (SKILL_CONFIG,
 * GAME_PARAMS). This "Option B" pattern computes effective stats locally.
 *
 * 1. WHY NOT REUSE v1 PerkManager
 *
 *    v1 PerkManager.applySkillStats() writes directly to global SKILL_CONFIG
 *    and GAME_PARAMS.player.physAttack (PerkManager.ts lines 169-185).
 *    PerkManager.reset() wipes everything. These globals are shared between
 *    v1 boss fights and v2 arena — any mutation leaks across modes.
 *
 *    ANTI-PATTERN (v1):
 *      // PerkManager.ts — MUTATES GLOBALS
 *      private applySkillStats(skillId: SkillId, levelIdx: number) {
 *        const cfg = SKILL_CONFIG[skillId];  // ← global reference
 *        cfg.cost = stats.cost;               // ← MUTATION
 *        cfg.damage = GAME_PARAMS.player.physAttack * stats.damage; // ← reads+writes globals
 *      }
 *
 * 2. OPTION B: EXPORT TABLE, COMPUTE LOCALLY
 *
 *    Step 1: Export the data (one-line change in PerkManager.ts):
 *
 *      export const SKILL_LEVEL_TABLE: Record<SkillId, Array<{...}>> = { ... };
 *
 *    Step 2: Compute effective stats in a pure function:
 *
 *      // ArenaPerkApplicator.ts — ZERO MUTATION
 *      import { SKILL_LEVEL_TABLE } from "../../game/PerkManager";
 *
 *      export function computeEffectiveSkills(
 *        perkLevels: Record<string, number>,
 *        physAttack: number,
 *      ): Record<SkillId, EffectiveSkillStats> {
 *        const result = {} as Record<SkillId, EffectiveSkillStats>;
 *        for (const skillId of ALL_SKILL_IDS) {
 *          const level = perkLevels[skillId] ?? 0;
 *          if (level <= 0) { result[skillId] = { unlocked: false, ... }; continue; }
 *          const entry = SKILL_LEVEL_TABLE[skillId][level - 1];
 *          result[skillId] = {
 *            unlocked: true,
 *            cost: entry.cost,
 *            damage: skillId === "powerStrike" ? physAttack * entry.damage! : entry.damage,
 *            // ... other fields from entry
 *          };
 *        }
 *        return result;
 *      }
 *
 * 3. THREE-TIER CARD GENERATION
 *
 *    The perk card modal shows 3 cards with priority-based selection:
 *
 *      Slot 1: skill perk    (if any skill is not maxed)
 *      Slot 2: passive perk  (if any passive remains in pool)
 *      Slot 3+: stat perks   (unlimited safety net — always available)
 *
 *    This guarantees exactly 3 cards in every scenario. Stat perks are the
 *    fallback that prevents empty modals even after all skills and passives
 *    are exhausted.
 *
 * 4. VERIFICATION
 *
 *    After any change to v2 perk code, run:
 *
 *      grep -r "SKILL_CONFIG\[.*\]\s*=" src/v2/
 *
 *    MUST return empty. If it returns any matches, the code is mutating v1
 *    globals and must be refactored.
 *
 * 5. STATE PERSISTENCE
 *
 *    Perk state lives in SaveData.arena.activeRun:
 *      - perkLevels: Record<string, number>     — skill perk levels (0 = not picked)
 *      - takenPassives: string[]                 — IDs of one-time passives taken
 *      - statPerkCounts: Record<string, number>  — stat perk pick counts
 *
 *    All reset by ArenaPerkSystem.initForRun() when a new run starts.
 *    All cleared automatically when activeRun is set to null (run end).
 *
 * Files:
 *   - src/game/PerkManager.ts          — export SKILL_LEVEL_TABLE (one line)
 *   - src/v2/systems/ArenaPerkApplicator.ts — computeEffectiveSkills, computePassiveSnapshot
 *   - src/v2/systems/ArenaPerkSystem.ts     — initForRun, getCardOptions, applyCard
 *   - src/v2/systems/PassivePerkEffects.ts  — 12 pure query functions
 *   - src/v2/systems/arenaStatPerkSystem.ts — applyStatPerksToStats (BuffSystem mirror)
 *   - src/v2/content/perks/                 — types, passive-perks, stat-perks, index
 */
