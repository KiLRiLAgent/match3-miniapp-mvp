# Team State — feature-visual-polish

## Recovery Instructions
If you lost context after compaction, read this file.
- Check current phase below and follow its instructions
- Update this file after each event

## Phase: EXECUTION
## Complexity: MEDIUM
## Team Name: feature-visual-polish

## Phase 2 Instructions (EXECUTION)
Your role: listen for DONE/STUCK/ESCALATE from team members.
- DO NOT read code, run checks, or notify reviewers — coders do that directly
- Update this file after each event
- When ALL coding tasks show COMPLETED → change Phase to VERIFICATION and follow Phase 3 instructions below

## Phase 3 Instructions (VERIFICATION) — follow step by step when Phase changes
When you change Phase to VERIFICATION, execute these steps IN ORDER:

### Step 1: Conventions task
- Check TaskList for task #6 (conventions) — assign to a coder if not yet assigned
- Wait for it to complete

### Step 2: Final checks
- Ask Tech Lead for cross-task consistency check
- Verify .conventions/ exists: Glob(".conventions/**/*")

### Step 3: Prepare verification plan
- Read .claude/teams/feature-visual-polish/VERIFICATION_PLAN.md
- Update with actual file paths and endpoints from completed tasks

### Step 4: Integrated verification
- Spawn ci-verifier + spec-verifier in parallel
- Browser checks → Human Checks (no automated browser testing)
- If FAIL items → create fix tasks for coders → re-verify (max 3 iterations)
- Save to .claude/teams/feature-visual-polish/VERIFICATION_REPORT.md

### Step 5: Shutdown & report
- Print summary report with verification results
- SendMessage(type="shutdown_request") to all permanent teammates
- TeamDelete
- Present Human Checks to user

## Feature Definition of Done
- Build passes: npm run build
- No TypeScript errors
- All animation constants in animations.ts (no magic numbers)
- Asset keys in ASSET_KEYS (no hardcoded strings)
- Depth layering follows CLAUDE.md depth map
- Async/await pattern for all animation sequences

## Team Roster
- tech-lead: ACTIVE
- security-reviewer: ACTIVE
- logic-reviewer: ACTIVE
- quality-reviewer: ACTIVE

## Tasks
- #1: Config + Glow + Assets + Flying tile perspective — PENDING
- #2: Meter improvements — PENDING
- #3: Boss art: cutscene fade + damage persistence — PENDING
- #4: Tutorial rework — PENDING (blocked by #3)
- #5: GameScene integration — PENDING (blocked by #1, #2, #4)
- #6: Update .conventions/ — PENDING (blocked by #1-#5)

## Active Coders: 0 (max: 3)

## GOLD STANDARD BLOCK
```
--- PROJECT ARCHITECTURE ---
- Phaser 3.88.2 + TypeScript + Vite
- GameScene.ts (~2600 lines) — main gameplay controller
- All animations return Promise<void>, use async/await chains
- Centralized animation config in animations.ts (durations, easing, effects)
- Asset keys centralized in assets.ts (ASSET_KEYS object)
- Depth layers: tiles=1, glows=0.99, hints=1.5, cutscene=500-502, game-end=998-1000
- Outcome-based rendering: board returns descriptive objects before modifying state
- createTween() helper for all tweens
- wait(this, ms) for Promise-based delays
- createPulseController() for guarded pulse animations

--- CODING PATTERNS ---
- All visual params go to animations.ts constants, not inline magic numbers
- Use ASSET_KEYS from assets.ts, never hardcode texture strings
- New methods follow existing naming: camelCase, async where Promise needed
- UI components (Meter, SkillButton) use Phaser.GameObjects.Container
- Meter uses Graphics-based rendering (no sprites for bars)
- FlyingTile: standalone class, creates own Graphics, manages lifecycle
- Tile sprites tracked via tileSprites Map<id, Image> and tilePositions Map<id, Position>

--- KEY CONFIG VALUES ---
- CELL_SIZE = 46
- BOARD_WIDTH = 8, BOARD_HEIGHT = 7
- Tile scale: CELL_SIZE * 1.1 → 1.15 (this feature)
- Boss 3-layer system: bossImageGlow(-0.1), bossGlowBrightness(-0.05 ADD), bossImage(0)
- Cutscene depths: overlay(500), back(500.5), main(501), text(502)
```
