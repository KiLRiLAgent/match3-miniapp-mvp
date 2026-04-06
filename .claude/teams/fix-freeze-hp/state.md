# Team State — fix-freeze-hp

## Recovery Instructions
If you lost context after compaction, read this file.
- Check current phase below and follow its instructions
- Update this file after each event

## Phase: VERIFICATION
## Complexity: SIMPLE
## Team Name: fix-freeze-hp

## Commits
- c59c157 — Task #1: busy flag recovery in GameScene async paths
- 5594aff — Task #2: LayeredMeter + Meter fillRadius helper
- 32566ce — Task #3: conventions updates

## Phase 2 Instructions (EXECUTION)
Your role: listen for DONE/STUCK/ESCALATE from team members.
- DO NOT read code, run checks, or notify reviewers — coders do that directly
- Update this file after each event
- When ALL coding tasks show COMPLETED → change Phase to VERIFICATION and follow Phase 3 instructions below

## Phase 3 Instructions (VERIFICATION) — follow step by step when Phase changes

### Step 1: Conventions task
- Task #3 (conventions) is blocked by #1 and #2. Once #1 and #2 are COMPLETED, assign #3 to a coder.
- Wait for it to complete.

### Step 2: Final checks
- Ask unified-reviewer for cross-task consistency check
- Verify .conventions/ updated: Glob(".conventions/**/*") + check modification times

### Step 3: Prepare verification plan
- Read .claude/teams/fix-freeze-hp/VERIFICATION_PLAN.md
- Update with actual line numbers if needed after final commit

### Step 4: Integrated verification (team is still alive!)
- Parse VERIFICATION_PLAN.md sections
- Spawn ci-verifier (Build & Types) + spec-verifier (Spec Checks) in parallel via Task()
- NO browser-verifier (no Browser Checks section in plan)
- Collect results + integrity audit
- If FAIL items → create fix tasks for coder → re-verify (max 3 iterations)
- Compile progressive verification report
- Save to .claude/teams/fix-freeze-hp/VERIFICATION_REPORT.md

### Step 5: Shutdown & report
- Print summary report with verification results
- SendMessage(type="shutdown_request") to unified-reviewer
- TeamDelete
- Present Human Checks to user via AskUserQuestion

## Team Roster
- unified-reviewer: ACTIVE (idle, ready for reviews)
- coder-1: ACTIVE (working on Task #1)

## Tasks
- #1: Fix busy flag recovery in GameScene async paths — PENDING (unassigned)
- #2: Fix LayeredMeter corner artifacts (full & narrow fill) — PENDING (unassigned)
- #3: Update .conventions/ with async error handling + fillRadius patterns — PENDING, blocked by #1 & #2

## Active Coders: 0 (max: 1 — only 1 coder needed for sequential work on 2 files)

## Definition of Done
- Build passes: `npm run build`
- No TypeScript errors
- GameScene.ts: all async paths have try/catch/finally guaranteeing busy reset
- LayeredMeter.ts: fillRadius() helper with adjusted threshold, no masks
- .conventions/ updated with new patterns
- docs/ committed after rebuild (GitHub Pages deploy)
- Gold standard patterns matched
- CLAUDE.md conventions followed
