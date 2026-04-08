/**
 * GOLD STANDARD: Procedural EncounterDef generation for arena/roguelike modes
 *
 * Phase 2A introduced an Archero-style arena that generates fights on-demand
 * without authoring static `EncounterDef` entries for every floor + enemy
 * combination. The pattern: a stateless generator + a fallback chain in
 * CombatBridgeScene.
 *
 * 1. ENCOUNTER ID FORMAT
 *
 *    Synthetic encounter ids follow the format:
 *
 *      `arena_floor_${N}_${enemyType}`
 *
 *    where N ∈ [1, BOSS_FLOOR] and enemyType is a synthetic CharacterDef id
 *    like "arena_bandit", "arena_demon". Story encounters use kebab-case ids
 *    like "lilana-act4" — the underscore prefix `arena_` is the discriminator.
 *
 *      // ArenaRunScene.ts → CombatBridgeScene
 *      const encounterId = `arena_floor_${run.floor}_${run.enemyType}`;
 *      sceneRouter.push(this, "CombatBridgeScene", {
 *        encounterId,
 *        onVictoryNode: "arena_victory",   // dummy, ignored by arena branch
 *        onDefeatNode: "arena_defeat",     // dummy
 *        returnToDialogueId: "",            // empty, arena routes via PostCombat branch
 *      });
 *
 * 2. STATELESS GENERATOR
 *
 *    The generator is a singleton with two methods: `isArenaEncounter(id)`
 *    detects the format, and `generate(id)` produces an EncounterDef or null.
 *    No instance state — each call is pure given (id, optional Math.random
 *    for variance).
 *
 *      // src/v2/systems/ArenaEncounterGenerator.ts
 *      class ArenaEncounterGenerator {
 *        generate(encounterId: string): EncounterDef | null {
 *          const parsed = this.parseArenaId(encounterId);
 *          if (!parsed) return null;
 *          const { floor, enemyType } = parsed;
 *          const isBoss = floor >= BOSS_FLOOR;
 *          return {
 *            id: encounterId,
 *            characterId: enemyType,
 *            name: this.getNameForEnemy(enemyType),
 *            difficulty: Math.min(10, Math.ceil(floor * 1.5)),
 *            bossStats: this.scaleBossStats(floor, isBoss),
 *            bossPattern: this.getBossPatternForEnemy(enemyType),
 *            chains: floor >= 4 ? this.generateChains(floor, isBoss) : undefined,
 *            rewards: this.scaleRewards(floor, isBoss),
 *            // No relationshipImpact — arena fights don't update relationships
 *          };
 *        }
 *
 *        isArenaEncounter(encounterId: string): boolean {
 *          return this.parseArenaId(encounterId) !== null;
 *        }
 *      }
 *
 *      export const arenaEncounterGenerator = new ArenaEncounterGenerator();
 *
 * 3. FALLBACK CHAIN IN CombatBridgeScene
 *
 *    The bridge scene tries the static registry first, then the generator,
 *    then the Phase 1C synthetic-defeat fallback. Single source of failure
 *    for unknown encounters.
 *
 *      // src/v2/scenes/CombatBridgeScene.ts → create()
 *      let encounterDef = ENCOUNTERS[this.encounterId];
 *      if (!encounterDef) {
 *        const generated = arenaEncounterGenerator.generate(this.encounterId);
 *        if (generated) {
 *          encounterDef = generated;
 *        } else {
 *          this.handleMissingEncounter();  // Phase 1C synthetic defeat
 *          return;
 *        }
 *      }
 *
 *    Generated EncounterDefs flow through the SAME path as registered ones —
 *    no special branching downstream. Phase 1C resilience (idempotency,
 *    R3 toast routing) is preserved.
 *
 * 4. SCALING FORMULAS
 *
 *    Generator must produce EncounterDefs that pass `EncounterBuilder.build()`
 *    validation:
 *      - bossStats.layerCount > 0
 *      - bossStats.baseHpPerLayer > 0
 *      - chains.chainBlockedHpRatio ∈ [0..1] (if chains defined)
 *
 *    Phase 2A formulas (tunable):
 *      layerCount = isBoss ? 4 : Math.min(3, 1 + Math.floor(floor / 2))
 *      baseHpPerLayer = 30 + floor * 12 + (isBoss ? 30 : 0)
 *      physAttack = 8 + floor * 2 + (isBoss ? 5 : 0)
 *      chainsAtFloor4Plus, bossGets4Chains
 *      rewards.xp = 50 * floor + (isBoss ? 200 : 0)
 *
 * 5. POSTCOMBAT ROUTING DETECTION
 *
 *    PostCombatScene uses `arenaEncounterGenerator.isArenaEncounter(id)` to
 *    decide whether to route back to ArenaRunScene (advance floor / show
 *    reward / end run) or to DialogueScene (story flow). NO new flag fields
 *    in CombatResult — the encounterId itself is the discriminator.
 *
 *      // PostCombatScene.handleContinue()
 *      if (arenaEncounterGenerator.isArenaEncounter(result.encounterId)) {
 *        if (result.victory) {
 *          arenaSystem.advanceFloor({ ... });
 *          // route to ArenaRewardScene or ArenaScene
 *        } else {
 *          arenaSystem.abortRun();
 *          sceneRouter.replace(this, "ArenaScene", { runJustFailed: true });
 *        }
 *        return;
 *      }
 *      // Phase 1C story flow continues unchanged below
 *
 * 6. WHY THIS PATTERN
 *
 *    - Zero static content authoring for arena floors (no need to write 30
 *      EncounterDef variants by hand)
 *    - Generator scaling is one method to tune balance — no per-encounter edits
 *    - Story flow and arena flow share the SAME combat code path
 *      (CombatBridgeScene + GameScene + EncounterBuilder + PostCombatScene)
 *    - Bundle-efficient: 1 generator (~3 KB) vs 30+ static EncounterDefs
 *      (~15+ KB)
 *
 * 7. WHEN TO USE
 *
 *    - Procedural fights (arena, dungeons, daily challenges) where authoring
 *      every encounter is impractical
 *    - When fight params are derivable from a small set of inputs (floor,
 *      difficulty, enemy type)
 *
 *    DO NOT use for story fights — they need authored relationshipImpact,
 *    custom bossPattern matching narrative tone, hand-tuned chain placements.
 *
 * Reference:
 *   - src/v2/systems/ArenaEncounterGenerator.ts (the generator)
 *   - src/v2/scenes/CombatBridgeScene.ts → create() (fallback chain)
 *   - src/v2/scenes/PostCombatScene.ts → handleContinue() (routing branch)
 *   - src/v2/systems/ArenaSystem.ts → advanceFloor / abortRun (state machine)
 *   - .claude/teams/feature-v2-phase-2a-arena/DECISIONS.md R3, R8
 */
