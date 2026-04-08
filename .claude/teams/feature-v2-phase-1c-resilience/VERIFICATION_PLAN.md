# VERIFICATION_PLAN — feature-v2-phase-1c-resilience

Run after all 14 tasks reach `completed`. Spawn `ci-verifier` + `spec-verifier` in parallel via Task() per team-lead's Phase 3 instructions.

---

## Section A: CI Checks (build, types, bundle)

Owner: ci-verifier

```bash
# 1. Strict TypeScript compile
npx tsc --noEmit
# Expect: 0 errors

# 2. Production build
npm run build
# Expect: success, no warnings, outputs to docs/

# 3. Bundle size measurement
ls -la docs/assets/index-*.js
ls -la docs/assets/v2-*.js  # or whatever the v2 chunk is named
# Expect:
#   index-*.js  ≤ 138240 bytes (135 KB)
#   v2-*.js     ≤ 87040 bytes  (85 KB) — UPDATED PER DECISIONS.md §1

# 4. SAVE_VERSION unchanged
grep "SAVE_VERSION = " src/v2/core/types.ts
# Expect: same line as before Phase 1C (= 1)

# 5. v1↔v2 import boundary
grep -n "from \"\\.\\./v2/" src/scenes/GameScene.ts | grep -v "import type"
# Expect: empty (zero runtime imports from v2)

grep -n "from \"\\.\\./v2" src/scenes/BootScene.ts
# Expect: only the dynamic `await import("../v2")` form, no top-level static imports
```

**FAIL conditions**: any non-zero exit, any size overrun, any boundary violation.

---

## Section B: Spec Checks (file structure, exports)

Owner: spec-verifier

```bash
# 1. New files exist
test -f src/v2/ui/Toast.ts || echo FAIL
test -f src/v2/content/validate.ts || echo FAIL

# 2. Toast singleton export
grep -n "^export const toast" src/v2/ui/Toast.ts
# Expect: 1 line

# 3. validateContent export
grep -n "^export function validateContent" src/v2/content/validate.ts
# Expect: 1 line

# 4. ValidationResult shape
grep -A 5 "interface ValidationResult" src/v2/content/validate.ts
# Expect: ok, errors[], warnings[]

# 5. registerV2Scenes calls validateContent FIRST
head -50 src/v2/index.ts | grep -n "validateContent\|game.scene.add"
# Expect: validateContent line BEFORE any game.scene.add line

# 6. EventBus extended with all three types
grep -n "saveError\|contentError\|assetError" src/v2/core/EventBus.ts
# Expect: ≥3 lines (one per event type, in V2Events interface)

# 7. SaveManager hardening
grep -n "private saveFailed\|isSaveFailed\|dispose" src/v2/core/SaveManager.ts
# Expect: ≥3 lines

# 8. SaveManager.importJson signature
grep -A 3 "importJson(json" src/v2/core/SaveManager.ts
# Expect: returns { ok: true } | { ok: false; error: string }

# 9. validateSaveShape exists
grep -n "validateSaveShape" src/v2/core/SaveManager.ts
# Expect: ≥2 lines (def + usage)

# 10. CombatBridge idempotency guard
grep -n "this.resultApplied" src/v2/scenes/CombatBridgeScene.ts
# Expect: ≥3 lines (init reset + handler check + handler set)

# 11. CombatBridge synthesizedDefeat flag
grep -n "synthesizedDefeat" src/v2/scenes/CombatBridgeScene.ts
# Expect: ≥1 line (passes to PostCombat init data)

grep -n "synthesizedDefeat" src/v2/scenes/PostCombatScene.ts
# Expect: ≥1 line (reads flag, shows toast)

# 12. Single-source-enrichment exception
grep "CombatResult = {" src/v2/
# Expect: ≤2 lines, second preceded by CONTENT_ERROR_FALLBACK comment within 5 lines

grep -B 5 "CombatResult = {" src/v2/scenes/CombatBridgeScene.ts | grep CONTENT_ERROR_FALLBACK
# Expect: ≥1 match (the comment exists)

# 13. InventorySystem.removeItem
grep -n "removeItem" src/v2/systems/InventorySystem.ts
# Expect: 1 method definition

# 14. SLOT_ORDER module-level constant
grep -n "^const SLOT_ORDER\|SLOT_ORDER" src/v2/systems/InventorySystem.ts
# Expect: ≥3 lines (def at module level + 2+ usages)

# 15. RelationshipSystem time-trim
grep -n "DECISION_LOG_MAX_AGE_MS" src/v2/systems/RelationshipSystem.ts
# Expect: ≥2 lines (constant + usage in logDecision)

# 16. DialogueRunner fault-tolerant effects
grep -n "try {" src/v2/systems/DialogueRunner.ts
# Expect: ≥1 line inside applyEffects loop

grep -n "this.graph.id" src/v2/systems/DialogueRunner.ts
# Expect: ≥1 line in error path (not this.dialogueId)

# 17. DialogueScene empty-choices fallback uses setRoot
grep -n "setRoot\|sceneRouter.setRoot" src/v2/scenes/DialogueScene.ts
# Expect: ≥1 line in the empty-choices branch

# 18. HubScene XP bar
grep -n "getLevelEntryXp\|getXpToNextLevel" src/v2/scenes/HubScene.ts
# Expect: ≥1 line

# 19. PlayerStatsScene pagination
grep -n "currentBackpackPage\|ITEMS_PER_PAGE" src/v2/scenes/PlayerStatsScene.ts
# Expect: ≥2 lines

# 20. LocationScene asset fallback
grep -n "renderFallbackBackground\|assetError" src/v2/scenes/LocationScene.ts
# Expect: ≥1 line

# 21. PostCombatScene fallback rendering
grep -n "renderFallback" src/v2/scenes/PostCombatScene.ts
# Expect: ≥1 line

# 22. Toast subscriptions wired
grep -n "eventBus.on" src/v2/index.ts
# Expect: ≥3 lines (saveError, contentError, assetError handlers)

# 23. Toast wiring idempotency
grep -n "toastWired\|let .*= false" src/v2/index.ts
# Expect: ≥1 line (module-level guard)
```

**FAIL conditions**: any of the expected matches missing.

---

## Section C: Convention Checks

Owner: spec-verifier (extends conventions checker)

```bash
# 1. v2-isolation.md compliance
grep -rn "from \"\\.\\./v2/" src/scenes/ | grep -v "import type" | grep -v "BootScene.ts"
# Expect: empty

# 2. Naming: PascalCase for component files
ls src/v2/ui/*.ts | grep -v "^src/v2/ui/[A-Z]"
# Expect: empty (all files start with uppercase)

# 3. Naming: camelCase for utility files
test -f src/v2/content/validate.ts  # camelCase, not PascalCase
# Expect: pass (validate.ts is utility, NOT a component)

# 4. UPPER_SNAKE_CASE constants
grep -n "^const [a-z]" src/v2/systems/InventorySystem.ts | grep -i "slot_order\|max_age"
# Expect: empty (constants must be UPPER_SNAKE)

# 5. Boolean flag naming
grep -n "private [a-z]*Failed\|private [a-z]*Applied" src/v2/scenes/CombatBridgeScene.ts src/v2/core/SaveManager.ts
# Expect: ≥2 lines (resultApplied, saveFailed)
```

---

## Section C-FE: Frontend Verification Checks (FE-V1..FE-V12)

Owner: architect-frontend (UI/UX/scene-side checks added in round 4)

### FE-V1: Toast lifecycle leak
Trigger `eventBus.emit("saveError", ...)` while a `sceneRouter.replace()` is mid-flight. Expect: zero `Cannot read property 'X' of destroyed` console errors. Toast.ts SHUTDOWN listener (R4) MUST clean up tweens before scene destroys.

### FE-V2: Multi-toast stacking
Emit `saveError` and `contentError` simultaneously. Expect: both toasts visible, vertically stacked (offset ~10px DPR), neither overlapping the other. Verify ToastManager queue or WeakMap registers per-scene state.

### FE-V3: HubScene XP bar @ DPR=1, SAFE_AREA={top:0}
Render HubScene at minimum DPR/safe area. Expect: XP bar fits between greeting text (Y=184d) and first primary button (stackCenterY - buttonStep). No vertical overlap.

### FE-V4: HubScene XP bar @ DPR=3, SAFE_AREA={top:60}
Render HubScene at maximum DPR + iOS-like safe area top. Expect: same — no overlap, all elements visible within camera viewport.

### FE-V5: PlayerStatsScene pagination + tap targets
Dev console: add 8 items via `inventorySystem.add(itemDefId)`. Open PlayerStats. Expect:
- 2 pages, page indicator "Стр. 1/2" visible
- Prev/Next buttons functional
- After `inventorySystem.removeItem(id)` from page 2, page index clamps if necessary
- All button heights ≥44*d (Apple HIG)

### FE-V6: LocationScene asset fallback
Console: `game.textures.remove("location_atrium")`, navigate to atrium location. Expect:
- Dark purple gradient background visible (NOT black screen)
- Placeholder text "[atrium]\nфон не загружен" rendered
- Toast "Не удалось загрузить фон локации" appears (warn type, ~3s duration)

### FE-V7: DialogueScene empty fallback
Temporarily comment out all condition-passing branches in a choice node OR add `requires: { flag: "impossible" }` to every choice. Reach the choice. Expect:
- Subtitle "Нет доступных вариантов в этой ветке" visible
- "← Вернуться в Hub" button rendered as DialogueChoiceButton
- Tap button → returns to HubScene with **clean stack** (verify via `sceneRouter.getStack()` in console — should be `[{key:"HubScene"}]`)
- From Hub, "← Назад в v1" button works (no stale Location entries)

### FE-V8: PostCombatScene synthesized defeat path
Sabotage a battle node `encounterId` to "nonexistent_id". Reach the battle node in dialogue. Expect:
- Brief CombatBridge transition
- PostCombatScene renders fallback (NOT crash)
- Toast "Ошибка контента: бой 'nonexistent_id' не найден" visible top-of-screen
- Continue button works → returns to dialogue at `onDefeatNode`
- NO infinite loop (player can leave the broken battle node permanently)

### FE-V9: Bundle size
After all 14 tasks complete: `npm run build`. Expect:
- v2 chunk ≤85 KB (per DECISIONS.md §1)
- v1 main chunk ≤135 KB

### FE-V10: v1 smoke test (CRITICAL)
- DevTools → clear localStorage completely
- Hard reload
- Expect: BootScene → IntroScene → GameScene, no v2 chunk in Network tab
- Play 3 turns, verify identical to pre-Phase-1C v1 baseline

### FE-V11: DPR consistency grep
```bash
grep -rn "fontSize: \"[0-9]\+px\"" src/v2/
# Expect: empty — all fontSize must use template literals with `* d`
grep -rn "setStrokeStyle([0-9]\+," src/v2/
# Expect: empty — all stroke widths must use `* d`
```

### FE-V12: Tap target audit (Apple HIG)
```bash
grep -rn "height.*=.*[0-9]\+ \* d" src/v2/scenes/PlayerStatsScene.ts | grep -i "btn\|button"
# Expect: all interactive button heights ≥ 44*d (44px at DPR=1)
grep -rn "height.*32 \* d" src/v2/scenes/
# Expect: empty (32 too small for tap targets)
```

---

## Section D: Manual Integration Tests (post-build, browser)

Owner: human reviewer (no http server in this project — Telegram WebApp; browser-verifier optional)

### Test 1: Content validation throws on bad ref
1. `git stash` any uncommitted work
2. Edit `src/v2/content/dialogues/lilana-act1.ts` — change a `choice.next` value to `"nonexistent_node"`
3. `npm run build` (should still pass — TS doesn't validate string values)
4. `npm run dev`, visit URL with `?mode=v2`
5. **Expect**: console shows `v2 content validation failed:` + `DialogueGraph 'lilana-act1': choice ... references missing node 'nonexistent_node'`
6. Game does NOT proceed past BootScene
7. Revert the edit, reload, verify game loads normally

### Test 2: Save quota exceeded
1. DevTools → Application → Local Storage → fill `match3_save_v2` with a large junk string until quota is reached
2. `?mode=v2`, play 1 turn
3. **Expect**: toast appears at top: "Не удаётся сохранить — память переполнена"

### Test 3: Empty choice fallback
1. Temporarily edit a `lilana-act1.ts` choice node to add a `requires: { flag: "impossible_flag", flagEquals: true }` to ALL choices
2. Reach that choice node in v2
3. **Expect**: Subtitle "Нет доступных вариантов в этой ветке" + button "← Вернуться в Hub"
4. Tap button → return to HubScene cleanly (no stale stack)
5. Revert the edit

### Test 4: Missing encounter synthetic defeat
1. Edit a `lilana-act4.ts` battle node, change `encounterId` to `"nonexistent_encounter"`
2. Reach the battle node in dialogue
3. **Expect**: Brief CombatBridge transition → PostCombatScene with toast "Ошибка контента: бой 'nonexistent_encounter' не найден"
4. Continue button works → returns to dialogue at `onDefeatNode`
5. Revert the edit

### Test 5: removeItem auto-cleanup
1. Open browser console
2. `import("/src/v2/systems/InventorySystem.js").then(m => window.inv = m.inventorySystem)`
3. `inv.add("silver_dagger")` → returns `ItemInstance`
4. `inv.equip("weapon", instance.id)` → returns true
5. `inv.getEquipped("weapon")` → returns instance
6. `inv.removeItem(instance.id)` → returns true
7. `inv.getEquipped("weapon")` → returns null ✓

### Test 6: PlayerStats pagination
1. Console: `for (let i = 0; i < 8; i++) inv.add("silver_dagger")`
2. Open PlayerStatsScene
3. **Expect**: 4 items visible, "Стр. 1/2" indicator, "Дальше →" button
4. Tap next → page 2, "← Назад" button visible

### Test 7: Decision log time-trim
1. Console: read save, manually inject decision entry with `ts: Date.now() - 31 * 24 * 60 * 60 * 1000`
2. `relationshipSystem.logDecision("lilana", "dialogue", "test", "test", { empathy: 1 })`
3. Verify old entry is gone, new entry present

### Test 8: HubScene XP bar
1. Open HubScene with default save
2. **Expect**: thin bar under greeting "Уровень 1", label "0 / 100 XP до 2 уровня"

### Test 9: LocationScene asset fallback
1. Console: `phaser game.textures.remove("location_atrium")`
2. Navigate to atrium location
3. **Expect**: dark purple bg + "[atrium]\nфон не загружен" text + toast "Не удалось загрузить фон локации"

### Test 10: v1 smoke test (CRITICAL)
1. DevTools → clear ALL localStorage
2. Hard reload
3. **Expect**: BootScene → IntroScene → GameScene (NO v2 chunk in Network tab)
4. Play 3 turns, swap tiles, match works
5. Open settings panel — works
6. **FAIL**: any visual or behavioral difference from pre-Phase-1C v1 baseline

---

## Section E: Conventions Update Verification (#14)

After task #14:

```bash
# New gold standards
test -f .conventions/gold-standards/toast-notifications.ts
test -f .conventions/gold-standards/content-validation.ts

# New anti-patterns
test -f .conventions/anti-patterns/avoid-silent-save-failures.md
test -f .conventions/anti-patterns/avoid-non-atomic-effect-chains.md

# CLAUDE.md updated
grep -n "Phase 1C" /Users/kilril/dev/2_Simple/match3/CLAUDE.md
# Expect: at least the "Текущий статус" section mentions Phase 1C completed

grep -n "85 kB\|≤85" /Users/kilril/dev/2_Simple/match3/CLAUDE.md
# Expect: updated chunk budget reflected
```

---

## Section F: Git workflow check

```bash
# Confirm all changes pushed
git status
# Expect: clean working tree

git log --oneline -20
# Expect: ≥14 commits referencing Phase 1C task numbers
```

---

## Failure Escalation

If any check FAILS:
1. ci-verifier / spec-verifier reports failures with file:line refs to team-lead
2. team-lead creates fix tasks (may reuse existing task IDs)
3. Re-run verification (max 3 iterations per team-lead Phase 3 instructions)
4. If 3 iterations exhausted: escalate to Primary Architect (architect-systems) for triage

## Success criteria

All sections A-F pass without fail. VERIFICATION_REPORT.md is generated by team-lead summarizing pass/fail per check. Then:
- shutdown_request to architects
- TeamDelete
- Present Human Checks to user
