# Team State — feature-v2-progression

## Recovery Instructions
If you lost context after compaction, read this file.
- Check current phase below and follow its instructions
- Update this file after each event

## Phase: PLANNING (architect debate in progress)
## Complexity: COMPLEX
## Team Name: feature-v2-progression

## Brief
- File: `.briefs/v2-phase-1b-progression-gallery.md`
- Feature: v2 Phase 1B — bug fixes (hammer, dialogue flags) + ProgressionSystem + InventorySystem + PlayerStatsScene + CharacterGalleryScene + HubScene reorganize
- 13 tasks total

## Phase 2 Instructions (EXECUTION) — when architects converge and coders are spawned
Your role: listen for DONE/STUCK/ESCALATE from team members.
- DO NOT read code, run checks, or notify reviewers — coders do that directly
- Update this file after each event
- When ALL coding tasks show COMPLETED → change Phase to VERIFICATION and follow Phase 3 instructions below

## Phase 3 Instructions (VERIFICATION) — follow step by step when Phase changes

### Step 1: Conventions task
- Task #13 (conventions) is blocked by ALL coding tasks. When #1-12 COMPLETED → unblock #13 → assign to coder
- Wait for it to complete

### Step 2: Final checks
- Ask Primary Architect (likely architect-systems) for cross-task consistency check
- Verify .conventions/ exists and has new gold standards: Glob(".conventions/**/*")

### Step 3: Prepare verification plan
- Read .claude/teams/feature-v2-progression/VERIFICATION_PLAN.md
- Update with actual file paths and exports from completed tasks

### Step 4: Integrated verification (team is still alive!)
- Parse VERIFICATION_PLAN.md sections
- Spawn ci-verifier + spec-verifier in parallel via Task() (browser-verifier optional — Telegram WebView verification is mostly Human Checks)
- Collect results + integrity audit
- If FAIL items → create fix tasks for coders → re-verify (max 3 iterations)
- Compile progressive verification report
- Save to .claude/teams/feature-v2-progression/VERIFICATION_REPORT.md

### Step 5: Shutdown & report
- Print summary report with verification results
- SendMessage(type="shutdown_request") to architect-frontend, architect-backend, architect-systems
- Wait for all 3 to acknowledge shutdown
- TeamDelete
- Present Human Checks to user via AskUserQuestion (manual gameplay verification)

## Team Roster
- architect-frontend: ACTIVE (DEBATE MODE — domain: #1, #9, #10, #11, #12)
- architect-backend: ACTIVE (DEBATE MODE — domain: #2, #3, #4, #5, #6, #7, #8)
- architect-systems: ACTIVE (DEBATE MODE — domain: #13, cross-cutting + bundle budget) — likely PRIMARY
- (no coders spawned yet — await SPEC APPROVED from all 3)

## Active Coders: 0 (max: 3)

## Tasks (13 total)
- #1 Hammer turn-end fix — PENDING (no deps)
- #2 SaveData type extensions — PENDING (no deps)
- #3 Lilana acts setFlag effects + lilana-postarc — PENDING (no deps)
- #4 ItemDatabase content — PENDING (blocked by #2)
- #5 ProgressionSystem module — PENDING (blocked by #2, #6 — task ordering only, no real cycle)
- #6 InventorySystem module — PENDING (blocked by #2, #4)
- #7 EncounterBuilder XP + loot integration — PENDING (blocked by #5, #6)
- #8 GameScene effective stats integration — PENDING (blocked by #5, #6)
- #9 PlayerStatsScene UI — PENDING (blocked by #5, #6)
- #10 CharacterGalleryScene UI — PENDING (blocked by #2)
- #11 PostCombatScene level-up + loot notifications — PENDING (blocked by #7)
- #12 HubScene 4 buttons + scene registration — PENDING (blocked by #9, #10)
- #13 Conventions update + plan status — PENDING (blocked by ALL coding tasks)

## Critical path
#2 → #4 → #6 → #5 → (#7, #8, #9) → #11/#12 → #13
Parallel branches: #1 (hammer), #3 (dialogue flags), #10 (gallery — only blocked by #2)

## Decisions log
- Lead split `computeEffectiveStats` out of ProgressionSystem to avoid cyclic dependency with InventorySystem. Each system stays pure; consumers (EncounterBuilder.build, PlayerStatsScene) merge base + equipment themselves.
- v2 chunk budget proposed REFINEMENT 10: raise from 60 kB → 80 kB to accommodate Phase 1B (will be confirmed by architect-systems during debate)
- Phase 1A precedent for hammer fix: this is a v1 fix but ships in this Phase 1B branch since the bug was discovered during v2 testing

## Risk analysis status
- Not yet — Phase 4b runs after architect convergence
- Anticipated risks: bundle bloat, save migration safety, equip/unequip scene lifecycle, dialogue flag race conditions, hammer fix v1 regression
