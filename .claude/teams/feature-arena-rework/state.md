# Team State — feature-arena-rework

## Recovery Instructions
If you lost context after compaction, read this file.
- Check current phase below and follow its instructions
- Update this file after each event

## Phase: EXECUTION (coders active, architects in review mode)
## Complexity: COMPLEX
## Team Name: feature-arena-rework

## Phase 1c Instructions (ARCHITECT DEBATE)
Your role: wait for all 3 architects to send SPEC APPROVED.
- DO NOT intervene in debate unless they disagree after 3 rounds
- When convergence achieved: designate Primary Architect (most-relevant: architect-systems given bundle budget criticality), compile VERIFICATION_PLAN.md from their checks, run risk analysis, switch architects to review mode, spawn coders
- If 3 rounds pass without convergence: Lead reads final positions, makes decision, documents in DECISIONS.md

## Phase 2 Instructions (EXECUTION) — after architect debate + risk analysis
Your role: listen for DONE/STUCK/ESCALATE from team members.
- DO NOT read code, run checks, or notify reviewers — coders do that directly
- Update this file after each event
- When ALL coding tasks show COMPLETED → change Phase to VERIFICATION and follow Phase 3 instructions

## Phase 3 Instructions (VERIFICATION) — follow step by step when Phase changes
### Step 1: Conventions task
- Check TaskList for the conventions task (#14) — assign to a coder if not yet assigned
- Wait for it to complete

### Step 2: Final checks
- Ask Primary Architect (architect-systems) for cross-task consistency check
- Verify .conventions/ exists: Glob(".conventions/**/*")

### Step 3: Prepare verification plan
- Read .claude/teams/feature-arena-rework/VERIFICATION_PLAN.md
- Update with actual file paths and endpoints from completed tasks

### Step 4: Integrated verification (team is still alive!)
- Parse VERIFICATION_PLAN.md sections, pre-flight check (curl dev server if needed)
- Spawn ci-verifier + browser-verifier + spec-verifier in parallel via Task()
- Collect results + integrity audit
- If FAIL items → create fix tasks for coders → re-verify (max 3 iterations)
- Compile progressive verification report
- Save to .claude/teams/feature-arena-rework/VERIFICATION_REPORT.md

### Step 5: Shutdown & report
- Print summary report with verification results
- SendMessage(type="shutdown_request") to all permanent teammates (architect-frontend, architect-backend, architect-systems, any coders still alive)
- TeamDelete
- Present Human Checks to user via AskUserQuestion

## Team Roster
- architect-frontend: ACTIVE (debate mode)
- architect-backend: ACTIVE (debate mode)
- architect-systems: ACTIVE (debate mode, likely PRIMARY after convergence — owns bundle budget)
- Coders: NONE SPAWNED YET (will spawn after architect debate + risk analysis)

## Tasks (14 total)
- #1:  Pre-dedup sprint — SceneChrome + theme — PENDING
- #2:  SaveData migration v2 → v3 — COMPLETED (coder-2, commit 563d8ed, 123.12 kB)
- #3:  Rework ArenaEncounterGenerator — PENDING (blocked by #2)
- #4:  Rework buff timing — PENDING (blocked by #3)
- #5:  ArenaScene UI — PENDING (blocked by #2)
- #6:  Perk data modules — PENDING
- #7:  ArenaPerkSystem — PENDING (blocked by #2, #6)
- #8:  Passive perk effects — PENDING (blocked by #6, #7)
- #9:  Stat perk effects — PENDING (blocked by #6, #7)
- #10: GameScene feature gate — PENDING (blocked by #7, #8, #9)
- #11: Inter-boss transition animation — PENDING (blocked by #4)
- #12: Greeting phrases — PENDING (blocked by #11)
- #13: Sell items — PENDING
- #14: Conventions update — PENDING (blocked by all 1-13)

## Active Coders: 0 (max: 3)

## Notes
- Brief: .briefs/v2-phase-2b-arena-rework.md
- v2 chunk starting at 123.09 kB, R2B-4 interim ceiling 125 kB, headroom 1.91 kB
- Brief explicitly warns budget will likely be exceeded by 6-11 kB
- Task #1 pre-dedup sprint targets -5 to -8 kB
- architect-systems owns the budget decision — Lead defers to them
- 14 tasks, chain of 5+ dependent tasks (#6→#7→#8→#10, plus #2→#3→#4→#11→#12)
- SaveData migration v2→v3 is critical path (Task #2 unblocks many)
- COMPLEX because 6/6 medium triggers fired (mandatory escalation per team-feature protocol)
