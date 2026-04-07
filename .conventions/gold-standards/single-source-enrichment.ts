/**
 * GOLD STANDARD: Single-source enrichment for cross-layer result objects
 *
 * When a v1 module emits a "raw" result that v2 needs to enrich with extra
 * fields (XP, gold, level-up, loot), there must be exactly ONE place in the
 * codebase where the raw → enriched transformation happens. Pass-through
 * callers must not spread / re-construct fields locally.
 *
 * This convention emerged from RISK-5 in Phase 1B Task #6
 * (CombatBridgeScene + EncounterBuilder + PostCombatScene wiring).
 * Before the rule: CombatBridgeScene was both calling `applyResult` AND
 * spreading raw fields into a local CombatResult. After: `applyResult`
 * returns the fully-populated CombatResult and CombatBridgeScene is a
 * pure passthrough. Adding a new field (e.g. `lootedItems`) is then a
 * single-file change inside `applyResult`.
 *
 * 1. NAMING: RawX vs X
 *
 *    The v1 emit type is named `RawX`. The enriched v2 type is `X` and
 *    declared via `extends RawX`:
 *
 *      // src/v2/content/types.ts
 *      export interface RawCombatResult {
 *        encounterId: string;
 *        characterId: string;
 *        victory: boolean;
 *        chainsBroken: number;
 *        turnsPlayed: number;
 *      }
 *
 *      export interface CombatResult extends RawCombatResult {
 *        appliedDelta: RelationshipDelta;
 *        xpGained: number;
 *        goldGained: number;
 *        leveledUp?: boolean;
 *        newLevel?: number;
 *        lootedItems?: string[];
 *      }
 *
 *    Optional fields (`?:`) carry "did this happen" semantics; pass-through
 *    consumers gate on `if (result.leveledUp && result.newLevel !== undefined)`.
 *
 * 2. SINGLE ENRICHMENT POINT
 *
 *    The enrichment lives in the system that owns reward resolution. For
 *    Phase 1B that's `EncounterBuilder.applyResult`:
 *
 *      // src/v2/systems/EncounterBuilder.ts
 *      applyResult(raw: RawCombatResult, encounterDef: EncounterDef): CombatResult {
 *        // ... mutate SaveData (relationships, gold, XP via progressionSystem,
 *        //     loot roll via inventorySystem) ...
 *        const result: CombatResult = {
 *          ...raw,
 *          appliedDelta: delta,
 *          xpGained,
 *          goldGained,
 *        };
 *        if (leveledUp) {
 *          result.leveledUp = true;
 *          result.newLevel = newLevel;
 *        }
 *        if (lootedItems.length > 0) {
 *          result.lootedItems = lootedItems;
 *        }
 *        return result;
 *      }
 *
 *    NO other file in the codebase may construct a `CombatResult` literal.
 *    Adding a new enriched field means: extend the interface, populate it
 *    inside `applyResult`, and read it in PostCombatScene. Three files,
 *    one mutation site.
 *
 * 3. CALLERS ARE PURE PASSTHROUGH
 *
 *    Bridge scenes that connect v1 emit → v2 display do NOT spread, copy,
 *    or default fields. They call the enrichment function and forward the
 *    return value verbatim:
 *
 *      // src/v2/scenes/CombatBridgeScene.ts
 *      private handleCombatComplete(
 *        raw: RawCombatResult,
 *        encounterDef: EncounterDef,
 *        context: CombatContext,
 *      ): void {
 *        // ... scene plumbing (stop, wake, defer) ...
 *        const enriched = encounterBuilder.applyResult(raw, encounterDef);
 *        gameState.flush();
 *        sceneRouter.replace(this, "PostCombatScene", {
 *          result: enriched,
 *          encounterContext: context,
 *          // ...
 *        });
 *      }
 *
 *    Acceptance check: `grep -n "CombatResult = {" src/v2/` returns at most
 *    ONE line, and that line must be inside the enrichment function.
 *
 * 4. DISPLAY-ONLY CONSUMERS
 *
 *    The destination scene reads enriched fields with optional guards but
 *    NEVER mutates SaveData based on them — the enrichment function already
 *    did that. Header doc comment must reinforce this:
 *
 *      // src/v2/scenes/PostCombatScene.ts
 *      /**
 *       * PostCombatScene — pure display of CombatResult ...
 *       * NOTE: NO state mutation here — rewards already applied by
 *       * CombatBridgeScene.handleCombatComplete via encounterBuilder.applyResult.
 *       *\/
 *
 * 5. WHY THE RULE EXISTS
 *
 *    Phase 1A had two parallel paths: CombatBridgeScene was spreading
 *    `{ ...raw, xpGained, goldGained }` AND EncounterBuilder was returning
 *    a `RelationshipDelta`. When Phase 1B added `leveledUp` and
 *    `lootedItems`, the natural instinct was to add them in CombatBridgeScene.
 *    That would have:
 *
 *    - Duplicated the loot-roll logic (or required CombatBridge to call
 *      applyResult twice and merge)
 *    - Made adding any future field a two-place change
 *    - Created drift risk between bridge spread and applyResult mutation
 *
 *    Collapsing to a single enrichment point removed the drift risk and
 *    cut the cyclomatic surface area of CombatBridgeScene by half.
 *
 * 6. ANTI-PATTERN
 *
 *    Do NOT do this:
 *
 *      // WRONG — CombatBridgeScene reconstructs CombatResult locally
 *      encounterBuilder.applyResult(raw, encounterDef);
 *      const result: CombatResult = {
 *        ...raw,
 *        appliedDelta: delta,           // re-derived here, drift bait
 *        xpGained: encounterDef.rewards.xp,
 *        goldGained: encounterDef.rewards.gold,
 *        leveledUp: progressionSystem.getCurrentLevel() > previousLevel, // ugh
 *      };
 *
 *    Either applyResult returns the full result, OR the bridge owns the
 *    full enrichment. Never both, never partial.
 *
 * Reference:
 *   - src/v2/systems/EncounterBuilder.ts → applyResult (the SOLE enrichment site)
 *   - src/v2/scenes/CombatBridgeScene.ts → handleCombatComplete (passthrough)
 *   - src/v2/scenes/PostCombatScene.ts → renderUI (read-only display)
 *   - Phase 1B Task #6 RISK-5 mitigation
 */
