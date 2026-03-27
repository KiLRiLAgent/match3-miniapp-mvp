# Team State — feature-polish-v2

## Recovery Instructions
If you lost context after compaction, read this file.

## Phase: EXECUTION
## Complexity: MEDIUM
## Team Name: feature-polish-v2

## Phase 2 Instructions (EXECUTION)
Listen for DONE/STUCK/ESCALATE from team members. Update this file after each event.
When ALL coding tasks (1-6) show COMPLETED → change Phase to VERIFICATION.

## Phase 3 Instructions (VERIFICATION)
### Step 1: Assign task #7 (conventions) to a coder
### Step 2: Ask Tech Lead for cross-task consistency check
### Step 3: Spawn ci-verifier + spec-verifier
### Step 4: Compile report, shutdown team

## Team Roster
- tech-lead: ACTIVE
- security-reviewer: ACTIVE
- logic-reviewer: ACTIVE
- quality-reviewer: ACTIVE

## Tasks
- #1: Meter: straight edges + flash — PENDING (Coder A)
- #2: Glow brighter + flying tiles bigger — PENDING (Coder A)
- #3: SkillButton: MP → mana icon — PENDING (Coder A)
- #4: GameScene: damage art fix + player delta — PENDING (Coder B)
- #5: GameScene: slash at board center — PENDING (blocked by #4)
- #6: Multi-layer boss HP — PENDING (blocked by #1, #5)
- #7: Update conventions — PENDING (blocked by all)

## Active Coders: 0 (max: 3)

## GOLD STANDARD BLOCK
- Phaser 3.88.2 + TypeScript + Vite
- All animations return Promise<void>, async/await chains
- tweenPromise() for wrapping tweens
- All durations in ANIMATION_DURATIONS, easing in ANIMATION_EASING, visual params in VISUAL_EFFECTS
- UI components extend Container, use Graphics rendering
- ASSET_KEYS for all texture references
- Meter: fillRect + geometry mask for straight edges within rounded border
- Trailing delta: step-based tween, clamp to bounds, cancel on new damage
- CELL_SIZE = 46, TILE_DISPLAY_SCALE = 1.20
