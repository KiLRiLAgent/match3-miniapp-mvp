# Team State — feature-skill-overlay-rework

## Recovery Instructions
If you lost context after compaction, read this file.
- Check current phase below and follow its instructions
- Update this file after each event

## Phase: VERIFICATION
## Complexity: MEDIUM
## Team Name: feature-skill-overlay-rework

## Phase 2 Instructions (EXECUTION)
Your role: listen for DONE/STUCK/ESCALATE from team members.
- DO NOT read code, run checks, or notify reviewers — coders do that directly
- Update this file after each event
- When ALL coding tasks (1,2,3) show COMPLETED → assign task #4 (conventions) to a coder
- When task #4 COMPLETED → change Phase to VERIFICATION and follow Phase 3 Instructions

## Phase 3 Instructions (VERIFICATION) — follow step by step when Phase changes
### Step 1: Conventions task — should be completed before reaching here
### Step 2: Final checks — ask Tech Lead for cross-task consistency check
### Step 3: Verify .conventions/ exists: Glob(".conventions/**/*")
### Step 4: Read VERIFICATION_PLAN.md, spawn ci-verifier + spec-verifier
### Step 5: If FAIL items → create fix tasks → re-verify (max 3 iterations)
### Step 6: Compile verification report, shutdown team, present human checks

## Feature Definition of Done
- Build passes: npm run build
- Type check passes: npx tsc --noEmit
- SkillApplyOverlay is compact horizontal card (NOT fullscreen modal)
- HP bars show delta preview for pending skill effects
- Backdrop-only close (no X button)
- Game field visible through lighter overlay
- All existing callbacks preserved (onConfirm, onCancel, onOpen, onClose)
- .conventions/ updated with new patterns
- CLAUDE.md conventions followed

## Team Roster
- tech-lead: ACTIVE
- security-reviewer: ACTIVE
- logic-reviewer: ACTIVE
- quality-reviewer: ACTIVE

## Tasks
- #1: Add delta preview API to Meter — COMPLETED (coder-1, commits 0548728 + 5d88394)
- #2: Rewrite SkillApplyOverlay as compact card — COMPLETED (coder-2)
- #3: Wire HP preview + enhanced highlights in GameScene — COMPLETED (coder-1, commits eab02ff + 049dff0)
- #4: Update .conventions/ — COMPLETED (coder-1, commit 1425e21)

## Active Coders: 2 (max: 2)
