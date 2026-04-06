# Team State — feature-v2-lilana

## Recovery Instructions
If you lost context after compaction, read this file.
- Check current phase below and follow its instructions
- Update this file after each event

## Phase: VERIFICATION COMPLETE — ready for user Human Checks + team shutdown
## Complexity: COMPLEX
## Team Name: feature-v2-lilana

## Phase 2 Instructions (EXECUTION)
Your role: listen for DONE/STUCK/ESCALATE from team members.
- DO NOT read code, run checks, or notify reviewers — coders do that directly
- Update this file after each event
- When ALL coding tasks show COMPLETED → change Phase to VERIFICATION and follow Phase 3 instructions below

## Phase 3 Instructions (VERIFICATION) — follow step by step when Phase changes

### Step 1: Conventions task
- Task #13 (conventions) is blocked by all coding tasks. Once #1-12 are COMPLETED, assign #13 to a coder.
- Wait for it to complete.

### Step 2: Final checks
- Ask Primary Architect for cross-task consistency check
- Verify .conventions/ exists: Glob(".conventions/**/*")

### Step 3: Prepare verification plan
- Read .claude/teams/feature-v2-lilana/VERIFICATION_PLAN.md
- Update with actual file paths and exports from completed tasks

### Step 4: Integrated verification (team is still alive!)
- Parse VERIFICATION_PLAN.md sections
- Spawn ci-verifier + browser-verifier + spec-verifier in parallel via Task()
- Collect results + integrity audit
- If FAIL items → create fix tasks for coders → re-verify (max 3 iterations)
- Compile progressive verification report
- Save to .claude/teams/feature-v2-lilana/VERIFICATION_REPORT.md

### Step 5: Shutdown & report
- Print summary report with verification results
- SendMessage(type="shutdown_request") to architect-frontend, architect-backend, architect-systems
- TeamDelete
- Present Human Checks to user via AskUserQuestion

## Team Roster
- architect-frontend: ACTIVE (REVIEW MODE — domain: #8, #9, #10, #11)
- architect-backend: ACTIVE (REVIEW MODE — domain: #1, #3, #4, #5, #7)
- architect-systems: ACTIVE (REVIEW MODE — domain: #2, #6, #12, #13) — **PRIMARY ARCHITECT**
- coder-1: ACTIVE (✅ #1 done in 130539b → working on #4)
- coder-2: ACTIVE (✅ #2 done in 023c2be → working on #8)
- coder-3: ACTIVE (working on #7 — Lilana content)

## Active Coders: 3 (max: 3) — FULL PARALLELISM
## Risk Analysis: COMPLETE — 6 testers, all mitigations applied to task descriptions + DECISIONS.md

## Coder Escalations Resolved
- **#2 ChainVariant dependency** (coder-2 → architect-systems) → REFINEMENT 7: ChainVariant defined in `src/match3/types.ts` (not v2/content). Both #1 and #2 unblocked. DECISIONS.md updated.

## TIEBREAKER (Lead decision)

Backend's amendment proposed eventBus instead of callback, contradicting systems' explicit SPEC APPROVED. Convergence thread:
- 10:54:39 frontend reverted to callback
- 10:54:56 systems "all 5 closed"
- 10:56:54 frontend "ACK callback"
- 10:58:25 backend SPEC APPROVED #1 (callback)
- 11:01:49 systems SPEC APPROVED (explicit callback DI, no event bus)
- backend AMENDMENT (eventBus) — misread the thread

Lead decision: **callback approach is final**. Reasons:
1. Strict v2-isolation > marginal serializability benefit (eventBus would require runtime exception in v2-isolation.md)
2. Closures don't need JSON serialization — CombatContext lives in memory only
3. DeepReadonly works via Omit<CombatContext, "onComplete"> for immutable parts
4. Single-consumer pattern is cleaner

DECISIONS.md is already aligned with callback approach (written based on backend's first SPEC APPROVED).

Tasks #1, #2, #3, #6 have full descriptions updated with round 3 architectural changes.
Tasks #4, #5, #7-13 rely on DECISIONS.md as authoritative spec — coder spawn prompts will require reading it as step 1.

## DECISIONS.md
Written at .claude/teams/feature-v2-lilana/DECISIONS.md — 20 architectural decisions from 4-round debate + FINAL REFINEMENTS section at top reflecting Lead tiebreaker.

## Architect convergence (final)
- ✅ All 3 architects converged on callback approach
- ✅ Refinement 1: Callback in scene init data (NOT in CombatContext)
- ✅ Refinement 2: RawCombatResult / CombatResult split (Option Y)
- ✅ Refinement 3: ChainOverlay in src/ui/ (NOT src/v2/ui/) — neutral location
- ✅ Refinement 4: HotspotDialogueOption.priority field
- ✅ Refinement 5: selectChoiceById (NOT originalIndex)
- ✅ Refinement 6: bossPattern as BossAbilityType[] (typed strings)
- ✅ architect-systems is Primary Architect
- ✅ Tasks #1, #2, #3, #6 refined; #4, #5, #7-13 rely on DECISIONS.md as authoritative
Key decisions:
1. CombatContext.onComplete callback (zero v2 runtime imports in v1)
2. Layered HP via derived field in CombatContext
3. bossPattern: BossAbilityType[] (typed strings via ABILITY_INDEX_MAP)
4. DialogueRunner delegates to RelationshipSystem (#3 now blocked by #4)
5. selectChoiceById not selectChoice(index)
6. Effective stats snapshot in 18 GameScene sites
7. ChainOverlay direct method calls (no events)
8. Match3Board chains: snapshots not references
9. LocationHotspot.dialogues declarative (no closures)
10. EffectExpr removes unlockAct (use setFlag)
+ 10 more — see DECISIONS.md

## Tasks (13 coding + 1 conventions)
- #1: Content types — TypeScript schema — PENDING (no deps)
- #2: Match3Board chains backwards-compat patch — PENDING (no deps)
- #3: DialogueRunner system — PENDING (blocked by #1)
- #4: RelationshipSystem + StoryFlags — PENDING (blocked by #1)
- #5: EncounterBuilder — PENDING (blocked by #1, #4)
- #6: GameScene encounterContext patch — PENDING (blocked by #1, #2)
- #7: Lilana content (character + dialogues + encounter + location) — PENDING (blocked by #1)
- #8: v2 UI components (ChainOverlay, DialogueChoiceButton, CharacterPortrait, RelationshipMeter) — PENDING (blocked by #1, #2)
- #9: Hub + StoryMap + Location scenes — PENDING (blocked by #1, #4, #7)
- #10: DialogueScene — PENDING (blocked by #1, #3, #7, #8)
- #11: CombatBridgeScene + PostCombatScene — PENDING (blocked by #1, #4, #5, #6, #8)
- #12: v2/index.ts wire-up — PENDING (blocked by #9, #10, #11)
- #13: Conventions update + plan status — PENDING (blocked by ALL coding tasks)

## Active Coders: 0 (max: 3)

## Definition of Done
- Build passes: `npm run build` (TypeScript strict + Vite)
- No new TypeScript errors
- Zero-disruption v1: empty localStorage → BootScene → IntroScene → GameScene identical to baseline
- v2 enabled flow: Hub → StoryMap → Atrium → Lilana dialogue (3 acts) → battle with chains → PostCombat → return cycle works
- Match3 chains: 8 chains in Lilana battle, threshold blocks HP, broken chains animate cleanly
- All conventions pass (.conventions/checks/* + anti-patterns/* enforced)
- docs/ rebuilt and committed
- DialogueRunner is pure logic (no Phaser imports)
- All v2 code in src/v2/, no v1 file modifications outside feature-gated patches
