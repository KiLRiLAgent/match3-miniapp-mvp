# Team State — feature-v2-phase-1c-resilience

## Recovery Instructions
If you lost context after compaction, read this file.
- Check current phase below and follow its instructions
- Update this file after each event

## Phase: VERIFICATION
## Complexity: COMPLEX (5/6 MEDIUM triggers fired → COMPLEX by accumulation)
## Team Name: feature-v2-phase-1c-resilience

## Feature Definition of Done

- `npm run build` passes (tsc strict + vite production)
- v1 main chunk ≤135 kB (currently 132.77)
- v2 chunk ≤80 kB (currently 73.74)
- All Phase 1C acceptance criteria from `.briefs/v2-phase-1c-resilience-ux.md` met
- v2-isolation rules preserved (no v1 imports `src/v2/*`)
- No new SAVE_VERSION (additive runtime-only changes)
- All review approvals: 3 architects (frontend/backend/systems) APPROVED per task
- `.conventions/` updated with new Phase 1C patterns
- No regressions: smoke test v1 (clean localStorage → IntroScene → GameScene works)
- Match-3 mechanic untouched (Board.ts, GameScene.ts, src/match3/, src/game/, src/ui/ excluded except for integration touchpoints approved by architects)

## Phase 1 Instructions (PLANNING)
1. Spawn 3 architects (frontend, backend, systems) ✅ via Task() in parallel
2. Send DEBATE PLAN message
3. Wait for SPEC APPROVED from all 3
4. Designate Primary Architect based on feature axis (this feature is mostly Systems → architect-systems is Primary)
5. Compile VERIFICATION_PLAN.md from architects' verification checks
6. Risk analysis (Step 4b): Tech Lead/Primary Architect identifies risks → spawn risk-testers → apply mitigations
7. Switch architects to REVIEW MODE
8. Spawn coders → change Phase to EXECUTION

## Phase 2 Instructions (EXECUTION)
Your role: listen for DONE/STUCK/ESCALATE from team members.
- DO NOT read code, run checks, or notify reviewers — coders do that directly
- Update this file after each event
- When ALL coding tasks show COMPLETED → change Phase to VERIFICATION

## Phase 3 Instructions (VERIFICATION) — follow step by step
### Step 1: Conventions task (#14)
- Assign #14 to a coder if not yet assigned
- Wait for it to complete

### Step 2: Final checks
- Ask Primary Architect (architect-systems) for cross-task consistency check
- Verify .conventions/ exists and was updated

### Step 3: Prepare verification plan
- Read .claude/teams/feature-v2-phase-1c-resilience/VERIFICATION_PLAN.md
- Update with actual file paths from completed tasks

### Step 4: Integrated verification (team is still alive!)
- Parse VERIFICATION_PLAN.md sections
- Spawn ci-verifier + spec-verifier in parallel via Task()
- Browser-verifier optional (no http server in this project — Telegram WebApp)
- Collect results + integrity audit
- If FAIL items → create fix tasks → re-verify (max 3 iterations)
- Save report to VERIFICATION_REPORT.md

### Step 5: Shutdown & report
- Print summary report
- SendMessage(type="shutdown_request") to all 3 architects
- TeamDelete
- Present Human Checks to user

## Team Roster
- architect-frontend: ACTIVE (REVIEW MODE)
- architect-backend: ACTIVE (REVIEW MODE)
- architect-systems: ACTIVE (REVIEW MODE — PRIMARY)
- coder-1: ACTIVE (Wave 1, claiming task)
- coder-2: ACTIVE (Wave 1, claiming task)
- coder-3: ACTIVE (Wave 1, claiming task)

## Tasks
- #1: Toast UI component — UNASSIGNED (Wave 1)
- #2: Content validator — UNASSIGNED (Wave 1)
- #3: Wire validator — UNASSIGNED (blocked by #2)
- #4: SaveManager hardening — UNASSIGNED (Wave 1)
- #5: DialogueRunner + DialogueScene — UNASSIGNED (Wave 1)
- #6: CombatBridgeScene resilience — UNASSIGNED (blocked by #1)
- #7: PostCombatScene resilience — UNASSIGNED (Wave 1)
- #8: InventorySystem.removeItem — UNASSIGNED (Wave 1)
- #9: RelationshipSystem trim — UNASSIGNED (Wave 1)
- #10: HubScene XP bar — UNASSIGNED (Wave 1)
- #11: PlayerStatsScene scroll — UNASSIGNED (Wave 1)
- #12: LocationScene asset fallback — UNASSIGNED (blocked by #1)
- #13: Wire Toast subscriptions — UNASSIGNED (blocked by #1, #4, #5, #12)
- #14: Conventions update — UNASSIGNED (blocked by ALL)

## Active Coders: 3 (max: 3)

## Wave Plan (preliminary, finalized after architect debate)
- **Wave 1** (no deps): #1, #2, #4, #5, #7, #8, #9, #10, #11
- **Wave 2** (after Wave 1 partials): #3 (after #2), #6 (after #1), #12 (after #1)
- **Wave 3** (after Wave 2): #13 (after #1+#4+#5+#12)
- **Wave 4** (after all coding): #14 (conventions)
