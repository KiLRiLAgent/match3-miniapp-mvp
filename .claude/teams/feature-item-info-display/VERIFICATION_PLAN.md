# Verification Plan
## Feature: Item Info Display in PlayerStatsScene

## Build & Types
- [ ] `npm run build` passes (strict TypeScript)
- [ ] No TypeScript errors in `src/v2/ui/itemFormat.ts`
- [ ] No TypeScript errors in `src/v2/ui/ItemCardModal.ts`
- [ ] No TypeScript errors in `src/v2/scenes/PlayerStatsScene.ts`

## Tests
- [ ] No test runner configured for v2 — validation is build + manual smoke (SKIP n/a)

## Browser Checks
- [ ] Page http://localhost:5173/ loads without console errors (clean localStorage = v1 path)
- [ ] After switching to v2 (via settings panel), HubScene loads without errors
- [ ] Clicking "Персонаж" button navigates to PlayerStatsScene without errors
- [ ] Equipment slot row shows: slot label, item name, stats summary, info icon (when occupied)
- [ ] Equipment slot row shows: slot label, "пусто" (when empty — no stats, no icon)
- [ ] Backpack row shows: item name, stats summary, slot label / "надето", info icon
- [ ] Tap on info icon opens modal overlay
- [ ] Modal backdrop is visible (black 0.78 alpha) above scene content
- [ ] Modal panel shows: item name (rarity color), slot label, rarity label, stats rows, description, close button
- [ ] Modal of backpack item shows comparison deltas (+X green, -Y red)
- [ ] Modal of equipped item shows full stats, NO comparison
- [ ] Tap on modal backdrop → modal closes
- [ ] Tap on close button → modal closes
- [ ] Tap on info icon does NOT trigger equip/unequip
- [ ] Drag on modal backdrop does NOT scroll background scene
- [ ] Drag-scroll still works normally after modal close
- [ ] Toast depth layer verification: if a save/content error fires during modal open, Toast renders BELOW modal (per R2B-3)

## Spec Checks
- [ ] File `src/v2/ui/itemFormat.ts` exists
- [ ] File `src/v2/ui/itemFormat.ts` exports `RARITY_COLOR_BY_TIER`, `RARITY_LABEL`, `SLOT_LABELS`, `buildStatsSummary`, `buildStatsRows`, `buildStatsDeltas`
- [ ] File `src/v2/ui/itemFormat.ts` has ZERO Phaser imports (pure module)
- [ ] File `src/v2/ui/itemFormat.ts` has JSDoc sync-note on `buildStatsSummary`
- [ ] File `src/v2/ui/ItemCardModal.ts` exists
- [ ] File `src/v2/ui/ItemCardModal.ts` exports `ItemCardModal` class and `itemCardModal` singleton
- [ ] ItemCardModal sets depth to 2100 (grep for `setDepth(2100)` in ItemCardModal.ts)
- [ ] PlayerStatsScene imports from `../ui/itemFormat` (replaces local RARITY_COLOR_BY_TIER)
- [ ] PlayerStatsScene imports `itemCardModal` from `../ui/ItemCardModal`
- [ ] PlayerStatsScene has `if (itemCardModal.isOpen()) return;` at top of `handleSlotTap` and `handleBackpackTap`
- [ ] PlayerStatsScene `setupScroll()` has the `itemCardModal.isOpen()` bail + unconditional scrollDraggedThisGesture reset
- [ ] PlayerStatsScene has SHUTDOWN handler closing the modal
- [ ] ItemCardModal has SHUTDOWN handler inside `open()` (layered defense)
- [ ] ItemCardModal `isOpen()` has defensive `layer.scene` + `layer.active` checks
- [ ] ItemCardModal `close()` snapshots callback before clearing, invokes in try/catch
- [ ] New gold standard file `.conventions/gold-standards/item-card-modal.ts` exists
- [ ] `.claude/teams/feature-item-info-display/DECISIONS.md` contains R2B-1, R2B-2, R2B-3 entries
- [ ] `src/v2/ui/Toast.ts` docstring lines ~40-45 updated per R2B-3
- [ ] `CLAUDE.md` Depth Layer Map has row for ItemCardModal at depth 2100
- [ ] v2 chunk size ≤ 120 kB (report actual in review), target ≤ 117 kB, soft stop 118 kB
- [ ] `git diff src/v2/scenes/ShopScene.ts` empty (not modified)
- [ ] `git diff src/v2/scenes/ArenaRewardScene.ts` empty (not modified)
- [ ] `git diff src/v2/scenes/PostCombatScene.ts` empty (not modified)
- [ ] `git diff src/v2/scenes/CharacterGalleryScene.ts` empty (not modified)
- [ ] `git diff src/scenes/GameScene.ts` empty (no v2 imports in v1)
- [ ] `git diff src/scenes/BootScene.ts` empty (no v2 imports in v1)

## Human Checks
- [ ] EDIT 11 — Stale singleton navigation test: Open PlayerStatsScene → tap info icon → while modal open, tap "← В Hub" → verify no console errors, modal closes, re-enter scene shows fresh state
  → Steps: npm run dev, clean localStorage, switch to v2 via settings, click Персонаж, click info icon on any equipped item, without closing modal click ← В Hub, open DevTools console to check for errors, click Персонаж again to re-enter
- [ ] EDIT 11 — Drag-tap-tap test: Drag backpack without crossing threshold → tap info icon → modal opens. Drag crossing threshold → tap info icon → first tap suppressed, next tap opens modal
  → Steps: open PlayerStatsScene, drag backpack list slightly (<6px), release, tap info icon on any backpack item; then drag >6px, release, tap info icon, verify first tap suppressed but second works
- [ ] EDIT 11 — Legendary comparison test: Equip common weapon. Acquire legendary weapon (via arena reward or dev cheat). Tap info icon on legendary → verify 4-5 green delta rows
  → Steps: ensure common weapon equipped, get legendary (win arena run or modify save), open PlayerStatsScene, tap info icon on legendary weapon in backpack, count delta rows
- [ ] v1 smoke test: clean localStorage, hard reload, verify game starts in v1 (IntroScene → GameScene) identically to pre-v2 behavior
  → Steps: DevTools → Application → Clear site data → Hard reload → verify BootScene → IntroScene → GameScene flow works
