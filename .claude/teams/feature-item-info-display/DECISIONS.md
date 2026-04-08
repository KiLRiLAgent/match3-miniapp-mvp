# DECISIONS — feature-item-info-display (Phase 2B)

Architectural decision records produced during the feature-item-info-display
team run (Phase 2B, apr 2026). Each R-entry is a locked decision with explicit
rationale, alternatives, and consequences. R2B-1 through R2B-6 are ratified
by team-lead + tech-lead during the review cycle.

---

## R2B-1: Pure helper + Phaser component split in src/v2/ui/

**Decision**: `src/v2/ui/` may contain pure-data helper modules with no Phaser
imports (e.g. `itemFormat.ts`) alongside Phaser Container/component files
(e.g. `ItemCardModal.ts`). The pure-helper pattern enables unit testing and
cross-scene reuse without pulling in the Phaser runtime.

**Context**: Phase 2B commitment is to dedup repeated UI code across v2 scenes
(currently `RARITY_COLORS` duplicated in PlayerStatsScene + ShopScene +
ArenaRewardScene, `buildStatsSummary` duplicated in ShopScene, etc.). The
feature-item-info-display feature introduced the first pair of pure helper +
consumer: `itemFormat.ts` (no Phaser) + `ItemCardModal.ts` (Phaser). This
establishes the canonical split for future dedup sprints.

**Alternatives considered**:

- Pure helpers in `src/v2/systems/` — REJECTED. Systems should own behavior
  (SaveManager, InventorySystem, ProgressionSystem), not just data transforms.
- Pure helpers in `src/v2/content/` — REJECTED. Content is authored data
  (items, characters, dialogues), not logic derived from it.
- Pure helpers inline in each scene — REJECTED. This is the status quo we're
  deduping away from, and duplication is a known maintenance trap.
- Pure helpers in a new `src/v2/ui-lib/` subfolder — REJECTED. Keeping
  everything flat in `src/v2/ui/` aids discoverability; subfolder nesting
  invites premature categorization.

**Consequences**:

- Future dedup work (Phase 2B) should follow this split: if a helper is pure,
  it goes in `src/v2/ui/xyz.ts` with zero Phaser imports. If it's a component,
  it goes alongside in `src/v2/ui/Xyz.ts` and may consume the helper.
- `src/v2/ui/` stays flat — no subfolders, no renames.
- Pure helpers are testable via dead-simple unit tests if a test runner is
  added later (currently v2 has no vitest / no tests/ directory; validation
  is via build + manual smoke).
- The `itemFormat.ts` helpers (`buildStatsSummary`, `buildStatsRows`,
  `buildStatsDeltas`, `buildUnifiedStatView`) are the first canonical example.
  Task #1 reviews confirmed ZERO Phaser imports via grep.

**Owner**: tech-lead, feature-item-info-display session.

---

## R2B-2: Phase 2B UI dedup TODO list

**Decision**: After feature-item-info-display ships with a partial dedup
(itemFormat.ts created but ShopScene + ArenaRewardScene local copies remain),
Phase 2B dedup sprint MUST complete the migration. The TODO list below is the
authoritative source for Phase 2B sprint planning.

**Context**: Brief exclusion list forbade modifying ShopScene, ArenaRewardScene,
PostCombatScene, and CharacterGalleryScene for this feature. Therefore the
dedup migration is PARTIAL — itemFormat.ts is the new canonical source, but
ShopScene.buildStatsSummary, ShopScene.RARITY_COLORS, and
ArenaRewardScene.RARITY_COLORS remain as local duplicates. The JSDoc sync-note
on `itemFormat.ts:buildStatsSummary` calls out the drift risk. Phase 2B dedup
sprint completes the migration.

**TODO items for Phase 2B (tracked for future sprint)**:

1. **Replace `ShopScene.buildStatsSummary`** (`src/v2/scenes/ShopScene.ts`
   lines 347-356) with `import { buildStatsSummary } from "../ui/itemFormat"`.
   Verify character-for-character output match first (tech-lead verified in
   Task #1 review — they are identical). Delete local copy. Estimated
   savings: ~0.2 kB.

2. **Replace `ShopScene.RARITY_COLORS`** (`src/v2/scenes/ShopScene.ts` lines
   50-55) with `import { RARITY_COLOR_BY_TIER } from "../ui/itemFormat"`.
   Verify the same shape (`Record<ItemRarity, string>`) and identical values
   (tech-lead verified — they are identical). Rename the binding at callsite
   or re-export under the old name for minimal callsite churn. Delete local
   copy. Estimated savings: ~0.15 kB.

3. **Replace `ArenaRewardScene.RARITY_COLORS`** with the same import as #2.
   Delete local copy. Estimated savings: ~0.15 kB.

4. **Align CharacterGalleryScene modal depth** (`src/v2/scenes/CharacterGalleryScene.ts`
   line 419) from the legacy `1000` to `2100` to match the new Toast < Modal
   convention (see R2B-3). Visual no-op — no other modals stack with it. This
   removes depth-convention debt and makes Phase 2B dedup consistent.

5. **Extract shared modal primitives into `src/v2/ui/modalChrome.ts`**:
   backdrop factory, panel factory, createCloseButton factory. Currently
   `createCloseButton` is duplicated between `CharacterGalleryScene.ts` and
   `ItemCardModal.ts` (intentional per Task #1 spec to keep ItemCardModal
   self-contained). Phase 2B consolidates both into a shared helper.
   Estimated savings: ~1-1.5 kB across both consumers.

6. **Extract shared scene chrome into `src/v2/ui/SceneChrome.ts`**: back
   button factory, primary/secondary button factories, title text helper.
   Currently duplicated across HubScene, ArenaScene, ShopScene,
   PlayerStatsScene, CharacterGalleryScene, StoryMapScene (~6 scenes with
   near-identical button rendering code). This is the original Phase 2B
   commitment from Round 4.1. Estimated savings: ~6-8 kB.

7. **Extract shared colors/fonts into `src/v2/ui/theme.ts`**: FONT constant,
   dark purple palette (BG_COLOR, ROW_BG, PANEL_COLOR, TITLE_COLOR, etc.),
   rarity color table (already in itemFormat), common text colors. Currently
   duplicated in every scene + ItemCardModal. Estimated savings: ~2-3 kB.

**Verification after completion**: `grep -r "RARITY_COLORS\|buildStatsSummary"
src/v2/scenes/` should return only import statements, not local definitions.
`grep -r "FONT.*Exo" src/v2/scenes/` should return zero hits (all migrated to
theme.ts imports).

**Total estimated Phase 2B dedup savings**: −10 to −13 kB from this TODO list.
Remaining gap to 90 kB revert target: ~20-23 kB — will require additional
analysis (tree-shaking investigation, Phaser feature subsetting, asset inlining
review). See R2B-4 for the current budget ceiling + total gap calculation.

**Owner**: Phase 2B sprint leader (TBD).

---

## R2B-3: Depth convention for v2 overlays

**Decision**: Revise the depth layering convention for v2 overlay elements.
New ordering (back → front):

- **Depth 500**: cutscene overlays (existing, GameScene)
- **Depth 1000**: LEGACY modal depth — CharacterGalleryScene.openModal only.
  To be updated to 2100 in Phase 2B per R2B-2 #4.
- **Depth 2000**: non-blocking notifications (Toast, `src/v2/ui/Toast.ts`).
- **Depth 2100**: blocking modal overlays (ItemCardModal and future modal
  components).

**Rationale**: The previous convention (Toast docstring lines 23-24 + gold
standard `toast-notifications.ts` §3) said "Toast 2000 is ABOVE modals (≤1000)".
This meant Toast would always render on TOP of any modal. For the ItemCardModal
feature, that behavior is WRONG — when a blocking modal is open, any Toast
fired during modal viewing (e.g. `saveError` event from SaveManager) would
render ABOVE the modal backdrop, which is the opposite of correct UX for a
blocking overlay. A blocking modal demands the user's full attention first;
transient notifications should wait their turn.

New convention: **modal overlays are the topmost UI layer**. Non-blocking
notifications (Toast) render under them. If a Toast fires while a modal is
open, the user reads it after closing the modal.

**Required file changes** (completed in Task #3):

1. `src/v2/ui/Toast.ts` docstring updated to reflect new convention (below
   blocking modals 2100+, above legacy modals 1000 + cutscenes 500).
2. `.conventions/gold-standards/toast-notifications.ts` §3 depth section
   updated to match, with cross-reference to R2B-3 + item-card-modal gold
   standard.
3. `.conventions/gold-standards/item-card-modal.ts` new gold standard documents
   the 2100 convention §2 + rationale §7 (stopPropagation close-path).
4. `.conventions/gold-standards/ui-component.ts` §12 anti-pattern note updated:
   "do NOT stop event propagation manually" was wrong for close-path handlers
   — Phase 2B close-path handlers MUST call stopPropagation (see item-card-modal
   §7 for full rationale).
5. `CLAUDE.md` depth layer map appended with rows for 2000 (Toast) and 2100
   (ItemCardModal).
6. `src/v2/scenes/CharacterGalleryScene.ts` **NOT modified** (brief exclusion).
   Its legacy 1000 depth is noted as debt in R2B-2 #4 for Phase 2B cleanup.

**Migration path**:

- **feature-item-info-display** (this feature): ItemCardModal ships at 2100.
  Toast stays at 2000 (docstring updated). CharacterGalleryScene stays at
  1000 (legacy, brief exclusion).
- **Phase 2B dedup sprint**: migrate CharacterGalleryScene.openModal to 2100
  (R2B-2 #4). At that point, there are no more legacy 1000-depth modals.

**Owner**: tech-lead, feature-item-info-display session. Drives R2B-2 #4.

---

## R2B-4: Phase 2B interim budget ceiling raised to 125 kB

**Decision**: Raise the v2 chunk interim hard ceiling from 120 kB (Round 4.1
Phase 2A amendment) to **125 kB**, effective feature-item-info-display
landing. This is a TEMPORARY ceiling scoped to the Phase 2B ramp-up period
until the SceneChrome + theme + modalChrome dedup sprint runs.

**Budget breakdown**:

| Phase | v2 chunk | Delta | Source |
|-------|----------|-------|--------|
| End of Phase 2A (Round 4.1) | 113.18 kB | baseline | 19 Phase 2A tasks |
| Phase 2A+ UX (commit `bce8e55`) | 117.76 kB | **+4.58 kB** | Archero vertical map, pre-roll enemies, buff visibility fix — UNDOCUMENTED drift, backfilled by R2B-5 |
| Task #1 (itemFormat + ItemCardModal) | 117.76 kB | +0.00 kB | true tree-shake — unused until Task #2 integration |
| Task #2 (PlayerStatsScene integration, commit `8238c0a`) | **123.09 kB** | +5.33 kB | modal render pipeline + info icon + inline stats + 3 stopPropagation handlers + `dragStartRecorded` guard + pointerup handler |
| Task #3 (conventions + docs + DECISIONS) | **123.09 kB** | +0.00 kB | docs/docstrings only, no runtime code — verified via identical chunk hash `BxCebcv1` before/after Task #3 changes |
| **Current (post feature-item-info-display)** | **123.09 kB** | — | — |
| **New interim ceiling** | **125 kB** | +1.91 kB headroom | scoped to Phase 2B ramp-up |

**Rationale**: feature-item-info-display mitigates 11 identified risks
(EDIT 1-11 across plan validation + risk analysis + review rounds) and
delivers critical player UX (understanding what items do, comparison deltas
before equipping, lore descriptions finally visible). The 5.33 kB Task #2
cost is dominated by Phaser API overhead in the modal render pipeline
(~440-line ItemCardModal) — not duplication, not dead code. Options C
(delete unused primitives) and D (shuffle chunks between files) yield zero
real savings. Option E (defer integration) wastes the Task #1 primitives
that are already tree-shaken at 0 kB. Shipping Task #2 is the only pound-wise
choice.

**Phase 2B hard revert commitment UNCHANGED at 90 kB**. Delta target is now
**−33.09 kB** (from 123.09), UP from the Round 4.1 target of −23 kB (from
113.18). feature-item-info-display adds an additional −9.91 kB of work to
the Phase 2B dedup sprint — acknowledged as a conscious deferral for
feature delivery. The Phase 2B sprint MUST deliver the full 90 kB revert;
this interim ceiling does NOT relax that commitment.

**Phase 2B dedup artifacts** (estimates — actual savings TBD during sprint):

1. `src/v2/ui/SceneChrome.ts` — back/primary/secondary button helpers +
   title builder. Consolidates ArenaScene + ShopScene + PlayerStatsScene +
   CharacterGalleryScene + HubScene + StoryMapScene button duplication.
   **Estimated savings: ~6-8 kB**.
2. `src/v2/ui/theme.ts` — shared color/font constants across all v2 scenes.
   **Estimated savings: ~2-3 kB**.
3. `src/v2/ui/modalChrome.ts` — shared backdrop/panel/close-button factory.
   Consumers: ItemCardModal + CharacterGalleryScene.
   **Estimated savings: ~1-1.5 kB**.
4. ShopScene + ArenaRewardScene `RARITY_COLORS` → imports from itemFormat.
   **Estimated savings: ~0.3 kB**.
5. ShopScene `buildStatsSummary` → import from itemFormat.
   **Estimated savings: ~0.2 kB**.
6. Additional dead code / tree-shake investigation (TBD).

**Total estimated dedup: −10 to −13 kB from items 1-5.** Remaining gap to
90 kB: ~20-23 kB — requires Phaser feature subsetting + asset inlining
review during the sprint.

**Concurrence**: Option A authorized by team-lead 2026-04-08. tech-lead
authored the decision. quality-reviewer covered Task #2 convention compliance
on the same day (MEDIUM team protocol — no architect-systems broadcast
required; quality-reviewer owns the convention/build/isolation domain that
architect-systems would own in a COMPLEX team).

**Owner**: Phase 2B sprint leader. Tracked in R2B-2.

---

## R2B-5: Retroactive documentation — Phase 2A+ UX commit bce8e55 drift

**Decision**: Retroactively document the +4.58 kB v2 chunk growth from commit
`bce8e55` "Phase 2A+ UX — Archero-map arena + buff visibility fix" (apr 2026).
This commit was discovered as an undocumented budget consumer during
feature-item-info-display Task #2 review budget archaeology.

**Discovery method**: tech-lead ran `git stash; npm run build` during Task #2
review to measure the true baseline before applying Task #1 + #2 changes. The
stashed build reported v2 chunk at 117.76 kB, not the 113.18 kB from CLAUDE.md
line 113 Round 4.1 amendment. The 4.58 kB delta was traced via `git log --oneline
-3 src/v2/` to commit `bce8e55` (most recent commit before Task #1).

**Contributing changes in `bce8e55`** (from the commit message):

- **Archero-style vertical map in ArenaRunScene**: replaces single centered
  enemy portrait with a vertical path of 6 floor nodes. Past floors (34dp
  alpha-0.35 + green checkmark), current floor (72dp pulsing gold glow +
  enemy name), future floors (40dp alpha 0.7 + floor number), boss floor
  (52dp red ring + red label). Path line via gold Graphics stroke. All nodes
  use `CharacterPortrait` Arc + initial fallback.
- **`ArenaRunState.plannedEnemies?: string[]`**: optional SaveData field
  (no SAVE_VERSION bump). Pre-rolled at `startNewRun` via new
  `pickAllEnemiesForRun()` helper. Backward-compat lazy-fill via
  `getPlannedEnemies()` for pre-fix saves.
- **Buff visibility fix** (exact bundle cost not measured individually).

**Process failure**: commit `bce8e55` introduced material budget growth
(+4.58 kB, which is 40% of the then-remaining Round 4.1 headroom of 6.82 kB)
without a corresponding DECISIONS R-entry or CLAUDE.md line 113 amendment.
The Round 4.1 amendment's 120 kB ceiling was still honored in principle (the
post-commit baseline was 117.76 kB, well under 120 kB), but the baseline
**drifted silently** and ate into the Phase 2B dedup target.

**Root cause**: no automated check caught the growth. Human review was
focused on feature correctness, not bundle archaeology. DECISIONS discipline
relies on developer awareness that a >1 kB change warrants an R-entry, and
that awareness failed for this commit.

**Retroactive ratification**: this R2B-5 entry documents the drift AFTER the
fact. No code revert is proposed — the Archero vertical map is a shipped
feature, players see it, it cannot be rolled back without visible regression.
Instead, the cost is absorbed into R2B-4's new 125 kB interim ceiling and
added to Phase 2B's hard revert commitment (−32.95 kB instead of −23 kB).

**Process fix for future**: R2B-6 proposes a CI/pre-commit check that
mechanically enforces the "chunk size change > 1 kB must have a paired
DECISIONS change" rule. Phase 2B sprint leader evaluates implementation.

**Note**: this retroactive record is NOT finger-pointing — the `bce8e55`
commit was a reasonable feature delivery under Phase 2A+ scope, and the
developer who shipped it was following the spirit of Round 4.1 (stay under
120 kB). The documentation drift is a process failure, not an individual
failure. R2B-6 addresses the process gap.

**Owner**: tech-lead, feature-item-info-display session (retroactive record,
not blame).

---

## R2B-6: Phase 2B process improvement — automated budget drift detection

**Decision**: Phase 2B sprint leader MUST evaluate adding a CI/pre-commit check
that fails builds where v2 chunk size grows more than 1 kB without a
corresponding DECISIONS.md R-entry change in the same commit.

**Context**: The Phase 2A+ commit `bce8e55` silently drifted the v2 chunk
baseline by +4.58 kB without any paired DECISIONS amendment (see R2B-5). This
drift was only discovered during the feature-item-info-display Task #2 review
budget archaeology. Process discipline alone is insufficient — automation
would catch this class of drift at commit time and force the author to either
justify the growth via an R-entry or reduce the growth before merging.

**Options for implementation** (Phase 2B sprint leader picks one):

1. **Pre-commit hook** (`.husky/pre-commit` or `lefthook.yml`): runs
   `npm run build` on staged changes and compares `docs/assets/index-*.js`
   sizes against a committed baseline file. If v2 chunk grows > 1 kB and
   no DECISIONS file is staged in the same commit, the hook blocks the
   commit with an instructive error message. Pro: fast feedback at commit
   time. Con: runs full build on every commit (slow).

2. **GitHub Actions check on PRs**: CI job compares chunk size delta vs
   DECISIONS.md diff in the PR. If growth > 1 kB AND no DECISIONS file
   changed, the check fails and blocks merge. Pro: no developer-side setup,
   catches at PR stage. Con: developer discovers the issue AFTER pushing.

3. **Vite plugin / build-time check**: vite.config.ts reads a committed
   `docs/.chunk-sizes.json` baseline and compares on every build. Writes
   warnings to console but does not block. Pro: lightweight, no extra CI.
   Con: advisory only, can be ignored.

**Recommended approach**: combination of (1) pre-commit hook for fast local
feedback + (2) GitHub Actions check as enforcement. The hook warns, CI
blocks. Developers who run `npm run build` locally before committing will
see the warning and can add the R-entry without a PR round-trip.

**Scope**: Phase 2B sprint leader evaluates feasibility and picks
implementation. NOT required for this feature or Phase 2B dedup completion —
orthogonal process improvement. Should be scheduled alongside the
SceneChrome.ts extraction task as a "Phase 2B process hardening" sub-task.

**Acceptance criteria when implemented**:

- A developer attempting to land a >1 kB chunk growth without a DECISIONS
  change sees a clear error pointing at R2B-6 for context.
- False positives (e.g. unrelated files that happen to push chunk size) are
  handled via a bypass mechanism (commit message flag, or a manual override
  file that requires tech-lead review).
- The check runs quickly enough to not disrupt normal workflow (< 30s for
  pre-commit, < 2min for CI).

**Owner**: Phase 2B sprint leader (TBD). Scheduled with R2B-2 dedup tasks.

---

## Review history

- **2026-04-08 (day 1)**: team spawn, tech-lead plan validation (5 edits),
  risk analysis (8 risks identified, 8 more edits applied via team-lead).
- **2026-04-08 (day 1)**: Task #1 first review — NEEDS FIX (BUG-1 stat row
  order broken when "kept" and "lost" stats coexist). Coder-a applied
  `buildUnifiedStatView` single-pass refactor + 5 nits. Re-review: APPROVED.
  Commit `9b4fe39`.
- **2026-04-08 (day 1)**: Task #2 first review — NEEDS FIX (BUG-2 event
  propagation race — scene POINTER_DOWN fires after modal close, bail
  guard does not trigger). Budget overrun escalation: 122.95 kB > 120 kB.
  Tech-lead authored R2B-4/R2B-5 amendments. Team-lead authorized Option A
  (ship as-is, raise interim ceiling to 125 kB, author R2B-6 for automated
  drift detection).
- **2026-04-08 (day 1)**: Task #2 second review — coder-a applied BUG-2 fix
  (stopPropagation on close-path handlers) but introduced regression in
  drag-tap-tap scenario. Coder-a self-caught regression, proposed Option 2
  (rollback info icon stopPropagation only). Tech-lead verified Option 2 +
  found one more edge case (POINTER_MOVE race after backdrop drag-close)
  and requested `dragStartRecorded` closure flag in setupScroll. Coder-a
  applied final fix. Re-review: APPROVED.
- **2026-04-08 (day 1)**: Task #3 — tech-lead self-claimed (full context,
  parallelizable with Task #2 fix cycle). Authored all 6 R-entries, updated
  Toast.ts docstring, updated CLAUDE.md depth map + line 113 budget story,
  created item-card-modal gold standard, cross-referenced ui-component §12
  and toast-notifications §3.

---

## Artifacts

### Conventions files touched

- **NEW**: `.conventions/gold-standards/item-card-modal.ts` — full gold
  standard for the reusable modal pattern.
- **UPDATED**: `.conventions/gold-standards/ui-component.ts` §12 — added
  ItemCardModal as reference implementation, corrected the
  "do NOT stop event propagation" anti-pattern note (was wrong for close-path
  handlers in Phase 2B).
- **UPDATED**: `.conventions/gold-standards/toast-notifications.ts` §3 —
  new depth convention (below blocking modals 2100+, above legacy modals
  1000 + cutscenes 500).

### Runtime files touched

- **NEW**: `src/v2/ui/itemFormat.ts` — pure helper module (Task #1).
- **NEW**: `src/v2/ui/ItemCardModal.ts` — reusable modal component (Task #1).
- **MODIFIED**: `src/v2/scenes/PlayerStatsScene.ts` — info icon + inline
  stats + modal integration + scroll-lock + dragStartRecorded guard (Task #2).
- **MODIFIED**: `src/v2/ui/Toast.ts` — docstring depth convention update
  (Task #3).
- **MODIFIED**: `CLAUDE.md` — depth layer map + v2 chunk budget narrative
  (Task #3).

### Files explicitly NOT touched (brief exclusion)

- `src/v2/scenes/ShopScene.ts`
- `src/v2/scenes/ArenaRewardScene.ts`
- `src/v2/scenes/PostCombatScene.ts`
- `src/v2/scenes/CharacterGalleryScene.ts`
- `src/scenes/GameScene.ts` (v1)
- `src/scenes/BootScene.ts` (v1)
- SaveData / SaveManager / migrations

All documented dedup work targeting these files is deferred to Phase 2B
sprint per R2B-2.

---

**Last updated**: 2026-04-08
**Status**: CLOSED pending final Task #2 APPROVED + commit.
