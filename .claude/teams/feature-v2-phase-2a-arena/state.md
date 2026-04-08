# Team State — feature-v2-phase-2a-arena

## Phase: EXECUTION
## Complexity: COMPLEX (5/6 MEDIUM triggers → COMPLEX by accumulation)
## Team Name: feature-v2-phase-2a-arena

## Feature Definition of Done

- `npm run build` passes (tsc strict + vite)
- v1 main chunk ≤135 KB unchanged
- v2 chunk ≤100 KB (Round 4 amendment, Phase 2B must return to 80 KB)
- All 19 tasks completed and reviewed
- All Phase 2A acceptance criteria from `.briefs/v2-phase-2a-arena-items.md` met
- v2-isolation preserved (no v1 → v2 runtime imports)
- SAVE_VERSION 1 → 2 migration tested with existing Phase 1B/1C saves
- v1 smoke test passes (R17 from Phase 1C: clean localStorage → IntroScene → GameScene)
- Match-3 mechanic untouched (Board.ts, GameScene.ts core, src/match3/, src/game/, src/ui/ v1)
- `.conventions/` updated with arena/buff/scene-chrome patterns
- 3-architect approval per task

## Phase 1 Instructions (PLANNING — currently here)

1. Spawn 3 architects (frontend/backend/systems) ✅
2. Send DEBATE PLAN ✅
3. Wait for SPEC APPROVED from all 3
4. Designate Primary (likely architect-systems — cross-cutting infra)
5. Compile VERIFICATION_PLAN.md from architects' verification checks
6. Risk analysis (Step 4b): Primary identifies risks → spawn risk testers → mitigations
7. Switch architects to REVIEW MODE
8. Spawn coders (max 3 active) → change Phase to EXECUTION

## Phase 2 Instructions (EXECUTION)

Monitor mode. Track DONE/STUCK signals. Update task statuses. When all 19 → COMPLETED, change Phase to VERIFICATION.

## Phase 3 Instructions (VERIFICATION)

1. Conventions task #19 last (check all coding tasks done first)
2. Cross-task consistency check via Primary architect
3. Update VERIFICATION_PLAN.md with actual paths
4. Spawn ci-verifier + spec-verifier in parallel
5. Fix-verify loop if FAIL items (max 3 iterations)
6. Compile VERIFICATION_REPORT.md
7. Shutdown team + TeamDelete + Present Human Checks

## Team Roster

- architect-frontend: ACTIVE (REVIEW MODE)
- architect-backend: ACTIVE (REVIEW MODE)
- architect-systems: ACTIVE (REVIEW MODE — PRIMARY)
- coder-1: ACTIVE (Wave 1)
- coder-2: ACTIVE (Wave 1)
- coder-3: ACTIVE (Wave 1)

## Tasks

### Wave 1 (Foundation, parallel, no deps)
- #1: SaveData migration v1 → v2 — UNASSIGNED
- #2: ItemRarity legendary + 18 items — UNASSIGNED
- #3: 5 arena enemy CharacterDefs — UNASSIGNED
- #4: BuffDef registry (10+) + types — UNASSIGNED

### Wave 2 (Systems, after Wave 1)
- #5: ArenaSystem (blocked by #1)
- #6: BuffSystem (blocked by #1, #4)
- #7: ArenaEncounterGenerator (blocked by #2, #3)
- #8: ShopSystem (blocked by #2)

### Wave 3 (Integration, after Wave 2)
- #9: EncounterBuilder buff hook (blocked by #6)
- #10: CombatBridge fallback (blocked by #7)
- #11: PostCombatScene arena routing (blocked by #5, #7)

### Wave 4 (Scenes, after Wave 2)
- #12: ArenaScene (blocked by #5)
- #13: ArenaRunScene (blocked by #3, #5, #6)
- #14: ArenaRewardScene (blocked by #4, #5, #6)
- #15: ShopScene (blocked by #2, #8)

### Wave 5 (UX & Polish)
- #16: HubScene 6 buttons + register scenes (blocked by #12, #13, #14, #15)
- #17: PlayerStatsScene rarity colors (blocked by #2)
- #18: Bundle dedup task (blocked by #12, #13, #14, #15, #16, #17)

### Wave 6 (Final)
- #19: Conventions + CLAUDE.md update (blocked by ALL)

## Active Coders: 3 (max: 3)

## Known Risks (preliminary, finalized after architect debate)

- **R-A**: Bundle bloat — Phase 2A est +22-27 KB, may exceed 100 KB even with dedup
- **R-B**: SAVE_VERSION migration regression — existing saves must load
- **R-C**: BuffSystem coupling — must NOT affect non-arena fights
- **R-D**: Loot table item ref validity — task #2 must complete before task #7 references items
- **R-E**: Scene init data flag flow — synthesizedDefeat / runJustCompleted / runJustFailed coordination

## Bundle Budget History
- Phase 1A: ~52 KB
- Phase 1B: 73.74 KB (≤80 KB)
- Phase 1C: 87.20 KB / ≤90 KB Round 3 exception
- Phase 2A target: ≤100 KB / Round 4 exception (with dedup task #18)
- Phase 2B target: return to 80 KB (per Round 3 promise)
