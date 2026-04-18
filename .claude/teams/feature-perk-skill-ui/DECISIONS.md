# DECISIONS — feature-perk-skill-ui

Architectural decision records produced during the feature-perk-skill-ui team
run (apr 2026). Each R-entry is a locked decision with explicit rationale,
alternatives, and consequences. RPSU-1 through RPSU-6 ratified by team-lead +
tech-lead during the review cycle.

---

## RPSU-1: v1 chunk budget temporary raise to 150 kB

**Decision**: v1 index chunk budget temporarily raised from 135 kB to 150 kB
for the duration of feature-perk-skill-ui. Phase 2C must revert to 90 kB
(existing Phase 2B hard revert commitment still stands).

**Context**: Feature adds ~12.75 kB to v1 chunk (from 135.46 kB baseline to
147.75 kB measured) across 4 tasks:
- Task #1 (PerkCard visual rework + flyPerkSelectVfx): ~7-8 kB (larger card
  with enhanced branches, splitDescriptionArrows, VFX trail body, SkillButton
  getIconWorldPosition + flashIconPulse).
- Task #3 (SkillApplyOverlay): ~3-5 kB (new modal component + GameScene
  integration: activateSkill split, openSkillHighlights/closeSkillHighlights).
- Task #4 (IntroScene skip): ~0.5 kB (awaitOrTap helper + skipResolvers).
- Nits commit (8134806): ~1-2 kB (TileKind import, named multipliers).

Previous precedent: Phase 2A raised from 90 kB to 120 kB, Phase 2B raised to
125 kB — both with Phase 2C revert commitment documented in CLAUDE.md.

**Alternatives considered**:
- (a) Temporary raise to 150 kB with Phase 2C revert — SELECTED as option (c)
  by team-lead (accept as Phase 2C-blocked).
- (b) Force micro-optimize before push — REJECTED. Estimated savings from
  dedup/extraction ~3-5 kB max, still exceeds 135 kB. Not worth blocking
  feature delivery for marginal gain.
- (c) Revert features to fit budget — REJECTED. All 7 brief requirements are
  implemented and review-approved; reverting loses user-visible improvements.

**Phase 2C revert plan** (committed):
- Extract SkillApplyOverlay shared chrome into `SceneChrome.ts` / `theme.ts` /
  `modalChrome.ts` (per Phase 2B revert commitment in CLAUDE.md).
- Dedup repeating Phaser.GameObjects.Text style configs across PerkCard +
  SkillApplyOverlay into shared const block.
- Russian string dedup ("Применить!", "Уровень повышен", "Выбери новую
  способность!", "ход"/"хода"/"ходов" → const block).
- VFX trail helper extraction into shared particle utility.

**Owner**: team-lead, feature-perk-skill-ui session.

---

## RPSU-2: Task #2 merged into Task #1

**Decision**: Task #2 (VFX animation when perk selected) closed as
merged-into-#1, no separate commit or code. Implementation exists in Task #1
commit `4e3688a`.

**Context**: coder-1 implemented flyPerkSelectVfx, getIconWorldPosition, and
flashIconPulse as part of Task #1 (perk screen visual rework) since the VFX
source-coords depend on the same showPerkSelection restructuring. Splitting
into a separate commit would require artificial decomposition with no benefit.

**Consequences**: Task #5 (conventions) unblocked earlier. No duplicate work.

**Owner**: tech-lead, feature-perk-skill-ui session.

---

## RPSU-3: SkillApplyOverlay v1-only gate

**Decision**: SkillApplyOverlay opens only in v1 boss fight mode. v2 arena
fights bypass the overlay and call executeSkill directly.

**Gate**: `if (this.encounterContext) { this.executeSkill(id); return; }` at
the top of GameScene.activateSkill, before overlay setup.

**Context**: Brief explicitly says "v1 only". Arena pacing is fast — players
expect tap-skill-instant-activate. Adding a confirmation modal to arena would
be feature creep and degrade the experience. If overlay is wanted for arena
later, it should be a separate feature with its own brief and acceptance
criteria.

**Owner**: team-lead, feature-perk-skill-ui session (RISK-6 decision).

---

## RPSU-4: Scene-side highlight via onOpen/onClose callbacks

**Decision**: HP bar and skill button highlighting during SkillApplyOverlay is
managed by GameScene (scene-side), not by the overlay component. The overlay
exposes `onOpen?: () => void` and `onClose?: () => void` optional callbacks in
SkillApplyOverlayOptions.

**Context**: Three patterns were evaluated:
- (a) Overlay reaches into scene state directly — REJECTED. Breaks
  encapsulation, overlay shouldn't know about GameScene internals.
- (b) Callbacks in options — SELECTED. Clean separation: overlay notifies,
  scene acts. Overlay has zero knowledge of HP bars or skill buttons.
- (c) Scene observes overlay lifecycle — REJECTED. No clear event boundary
  without adding EventBus coupling.

**Consequences**:
- onOpen fires after scene.add.existing (constructor end) — scene can safely
  create tweens.
- onClose fires in close() BEFORE main callback (onConfirm/onCancel) and
  AFTER destroy — scene cleans up highlights before skill execution starts.
- All highlight tweens stored in `skillHighlightTweens: Tween[]`, cleanup is
  idempotent via closeSkillHighlights().
- resetState also clears the array for retry edge case.

**Owner**: tech-lead, feature-perk-skill-ui session (RISK-5 decision).

---

## RPSU-5: PerkCard backward-compat via opt-in enhancedVisuals

**Decision**: PerkCard visual enhancements (larger fonts, mana sprite drop,
green arrows) are opt-in via `enhancedVisuals?: boolean` in PerkCardOptions
(default false). Existing and future call sites get unchanged behavior unless
they explicitly opt in.

**Context**: v2 ArenaPerkModal uses a different `PerkCard` type (union in
ArenaPerkSystem.ts, not the v1 class). No shared component risk exists today.
But opt-in preserves clean API for any future reuse of v1 PerkCard — the
interface only grows additively.

**Consequences**: GameScene.showPerkSelection passes
`{ width, height, enhancedVisuals: true }`. Any other caller gets default false.
No v2 regression possible.

**Owner**: tech-lead, feature-perk-skill-ui session (RISK-6a context).

---

## RPSU-6: IntroScene awaitOrTap blocker tracking (RISK-9)

**Decision**: IntroScene replaces unmanaged `waitOrTap()` (from helpers.ts)
with a local `awaitOrTap()` method that tracks blocker rectangles + timers in
`private blockers: Array<{ rect, timer }>`. requestSkip() destroys all tracked
blockers and removes their timers.

**Context**: `waitOrTap()` creates a fullscreen interactive rectangle + timer
internally. On skip, `tweens.killAll()` does not destroy these objects — they
become orphan input receivers that can "eat" taps intended for GameScene during
the brief transition window between IntroScene.launch("GameScene") and
IntroScene.stop().

**Anti-pattern**: Using `waitOrTap()` in any scene that supports abortable
sequences. The helper lacks a cancel API. Prefer local tracking + cleanup.

**Consequences**: 3 awaitOrTap calls in IntroScene (lines 222, 282, 332)
replace waitOrTap. `waitOrTap` import can be removed from IntroScene.ts
(currently unused import, lint will catch). Helper remains in helpers.ts for
any non-abortable usage elsewhere (GameScene dialogs, etc.).

**Owner**: team-lead + tech-lead, feature-perk-skill-ui session (RISK-9
decision).
