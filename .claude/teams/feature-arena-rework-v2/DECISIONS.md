# DECISIONS — feature-arena-rework-v2

**Primary Architect**: architect-systems
**Status**: COMPLETED
**Phase**: Phase 2B — Arena Rework v2 (10 bosses, perks, sell items)

This document records architectural decisions made during the arena rework feature.
On any conflict between a task description and this document, this document wins.

---

## R2A-1: 10-boss authored BOSS_CURVE table

**Decision**: Arena runs consist of 10 fights (9 normal + 1 final boss) with an
authored difficulty curve. The BOSS_CURVE table in `ArenaEncounterGenerator.ts`
defines layers, HP per layer, and total HP for each floor.

**Rationale**: 6 fights (Phase 2A) felt too short for meaningful perk progression.
10 fights with 49 total HP layers gives ~49 perk picks per run, enough to max
out 4 skills (16 picks) + collect most passives (12) + some stat perks.

**Implementation**: `BOSS_CURVE` array in `ArenaEncounterGenerator.ts`. Floor 10
is always `arena_demon` with 15 layers / 3000 HP total. Floors 1-9 use the 5
existing enemy types procedurally assigned.

---

## R2A-2: Option B ArenaPerkApplicator (zero SKILL_CONFIG mutation)

**Decision**: Do NOT reuse v1 `PerkManager.applySkillStats()` for arena perks.
Instead, export `SKILL_LEVEL_TABLE` and compute effective stats locally in
`ArenaPerkApplicator.computeEffectiveSkills()`.

**Rationale**: v1 `PerkManager.applySkillStats()` (lines 169-185) writes directly
to global `SKILL_CONFIG` and `GAME_PARAMS.player.physAttack`. `PerkManager.reset()`
wipes everything. Any v1 mutation leaks across arena runs and into v1 boss fights.
Option B avoids this by reading the table as pure data and computing locally.

**Verification**: `grep -r "SKILL_CONFIG\[.*\]\s*=" src/v2/` MUST return empty.

**Files**:
- `src/game/PerkManager.ts` — ONE LINE: `export const SKILL_LEVEL_TABLE`
- `src/v2/systems/ArenaPerkApplicator.ts` — `computeEffectiveSkills()`, `computePassiveSnapshot()`
- `src/v2/systems/ArenaPerkSystem.ts` — `initForRun()`, `getCardOptions()`, `applyCard()`

---

## R2A-3: Per-run 1.15x compounding difficulty multiplier

**Decision**: `difficultyMultiplier = Math.pow(1.15, totalRunsCompleted)`.
Applied to boss HP and phys/mag attack. NOT applied to layer counts.

**Rationale**: Keeps early runs accessible while scaling challenge for returning
players. Layer count stays fixed so the perk-per-layer progression curve remains
predictable. 1.15x per run means run 5 is ~1.75x — manageable with accumulated
items and player skill.

**Implementation**: `ArenaSystem.getDifficultyMultiplier()`. Read by
`ArenaEncounterGenerator.generate()` to scale `baseHpPerLayer` and
`bossStats.physAttack/magAttack`.

---

## R2A-4: Variant B perk pool (12 passive + 6 stat + 16 skill)

**Decision**: Three perk categories with priority-based card generation:
1. **Skill perks** (4 skills x 5 levels = 16 max picks) — reuse v1 SKILL_LEVEL_TABLE
2. **Passive perks** (12 one-time picks) — authored in `content/perks/passive-perks.ts`
3. **Stat perks** (6 types, unlimited picks) — safety net in `content/perks/stat-perks.ts`

Card generation: slot 1 = skill (if unmaxed), slot 2 = passive (if remaining),
slots 3+ = unique stat perks. Guarantees 3 cards always available.

**Rationale**: Variant A (skill-only) would exhaust after 16 picks (~floor 3-4),
leaving the player with empty modals. Passive perks add tactical variety, stat
perks provide an infinite safety net.

---

## R2A-5: Bundle budget — actual v2 chunk 134.33 kB

**Actuals** (post-arena-rework):
- v1 chunk: 135.46 kB (within 135 kB ceiling, marginal)
- v2 chunk: 134.33 kB (above 125 kB Phase 2B interim ceiling)

**Phase 2C revert commitment**: Return to 90 kB via:
- Extract `src/v2/ui/SceneChrome.ts` (shared button/title helpers) — est. -5-7 kB
- Extract `src/v2/ui/theme.ts` (colors, fonts, spacings) — est. -3-4 kB
- Extract `src/v2/ui/modalChrome.ts` (modal patterns) — est. -2-3 kB
- Inline Russian string dedup via dictionary lookup — est. -3-5 kB
- DEV-only gating for ArenaPerkSystem debug helpers

---

## R2A-6: Buff milestones at floors 3, 6, 9

**Decision**: ArenaRewardScene (buff pick from 3 options) triggers ONLY after
defeating bosses on floors 3, 6, and 9. All other inter-boss transitions go
directly to the next fight.

**Rationale**: 3 buff picks per run (matching Phase 2A) keeps buff accumulation
meaningful without overwhelming the player. Milestone spacing (every 3 floors)
creates a natural rhythm of "earn reward → use it for next 3 fights".

**Implementation**: `BUFF_FLOORS = [3, 6, 9]` constant in `ArenaEncounterGenerator.ts`.
Read by routing logic in `PostCombatScene` and `CombatBridgeScene`.

---

## R2A-7: Task #11 BossTransition CUT — greetings via CombatBridgeScene overlay

**Decision**: The planned `BossTransitionOverlay` component (slide-left blur
animation, 1.2-1.5s transition) was CUT from scope. Greeting phrases are still
authored on `CharacterDef.greetings` (5 enemies x 3 phrases) and can be
displayed via a simple overlay in CombatBridgeScene in a future pass.

**Rationale**: The transition animation required Phaser preFX.addBlur() which is
WebGL-only and has inconsistent support in Telegram WebView. Simpler to ship
greetings as a text overlay and iterate on the visual transition later.

---

## R2A-8: 3 passive perks deferred (runtime hooks needed)

**Decision**: `bomb_master`, `explosive_magic`, and `crit_mastery` are defined in
the perk data modules but their RUNTIME EFFECTS are deferred. The data is authored
and the perks can be picked, but the game mechanics they modify don't have hooks
yet.

**Deferred perks**:
- `bomb_master` (+10 bomb damage) — needs GameScene bomb damage pipeline hook
- `explosive_magic` (5+ magic matches create bomb) — needs GameScene match-count hook
- `crit_mastery` (+10% crit chance) — needs GameScene crit roll integration

**All 12 passive perks are authored and pickable**. `PassivePerkEffects.ts` returns
the correct values for all 12 — wiring into GameScene combat loop is Phase 2C work.
