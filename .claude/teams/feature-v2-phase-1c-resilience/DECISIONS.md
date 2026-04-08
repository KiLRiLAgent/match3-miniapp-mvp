# DECISIONS — feature-v2-phase-1c-resilience

**Primary Architect**: architect-systems
**Secondary Architects**: architect-frontend, architect-backend
**Phase**: PLANNING (debate concluded after Round 2)
**Status**: SPEC APPROVED

This document is the authoritative architectural contract for Phase 1C. Coders MUST read this before starting any task. On any conflict between a task description and this document, this document wins — the task descriptions were drafted before debate, this is the post-debate consensus.

---

## 1. Bundle Budgets (UPDATED — temporary Phase 1C exception)

| Chunk | Phase 1B | Phase 1C est | Phase 1C actual | Justification |
|-------|----------|--------------|-----------------|---------------|
| v1 main (`index-*.js`) | ≤135 KB | ≤135 KB | **≤135 KB** | Match-3 mechanic untouched |
| v2 (`v2-*.js`) | ≤80 KB | ≤85 KB | **≤90 KB** (Round 3 amendment) | See Round 3 below |

**Measurement methodology**: compressed (gzipped, post-Vite minify) — same as CLAUDE.md "Текущий статус" reporting.

**Round 3 amendment (post-implementation, 2026-04-08)**:
- Pre-impl estimate (architects Round 2): 73.74 → ~83.6 KB (+9.8 KB)
- Actual measurement at Wave 3 commit: 85.97 KB (+12.2 KB)
- After PlayerStatsScene pagination simplification: 85.97 KB (saved 270 bytes)
- Estimate error ~2.4 KB. Code review confirms genuine implementation weight, NOT bloat
- **Bumped to 90 KB by team-lead** acting on architect-systems's RISK-2 escalation contract
- 4 KB headroom at 90 KB ceiling for #12 / #13 / #14 remaining tasks

**TEMPORARY EXCEPTION** (per backend R2): the 90 KB bump is a Phase 1C-only exception. **Phase 2 (new content) MUST return to 80 KB** through:
- Dedup of repeated string constants (FONT, color hex codes) across scenes
- Gating validator behind `import.meta.env.DEV` so production tree-shakes it out
- Possible Toast minimization (alpha lerp instead of tween config blob)
- Extract shared button/row helpers used across PlayerStatsScene/CharacterGalleryScene

Tech-lead enforces: at the start of Phase 2 planning, the bundle budget reverts to 80 KB and the first task in Phase 2 is a "v2 chunk size pass" task.

---

## 2. EventBus Extension Contract

**Problem**: Tasks #4, #5, #12 all extend `src/v2/core/EventBus.ts` `V2Events` interface. Parallel work → merge conflicts.

**Solution**: First Wave 1 coder to touch `EventBus.ts` adds **all three event types in one commit** with the final shape locked below. Subsequent tasks (#5 if #4 starts first, #12 always) only `eventBus.emit(...)` — they DO NOT modify the interface.

**Locked final shape** (copy-paste verbatim into `EventBus.ts`):

```ts
export interface V2Events {
  // Phase 0 placeholder — kept for future "v2 fully booted" signal
  "v2:ready": void;

  // Phase 1C — Save/data errors
  saveError: {
    reason: "quota" | "unknown";
    error: string;
  };

  // Phase 1C — Content authoring errors (validator, dialogue effects, missing entities)
  contentError: {
    source:
      | "dialogue-effect"
      | "dialogue-empty-choices"
      | "post-combat"
      | "validator"
      | "missing-encounter";
    dialogueId?: string;
    nodeId?: string;
    detail: string;
  };

  // Phase 1C — Asset load failures
  assetError: {
    source: "location-background" | "character-portrait" | "scene-background";
    assetKey: string;
    detail: string;
  };
}
```

**Rules**:
- All payload fields use the exact names above. Do not abbreviate.
- `contentError.dialogueId` and `nodeId` are OPTIONAL — `post-combat` and `validator` sources may not have them.
- `validator` source is reserved for #3 (registerV2Scenes throw path) — direct console.error is fine, EventBus emit optional.
- Owner of EventBus.ts edit: assigned to whichever coder claims #4 or #5 first. Tech-lead enforces.

---

## 3. Wave Plan (FINAL)

**Wave 1** (no dependencies, parallelizable):
- #1 Toast UI component
- #2 Content validator
- #4 SaveManager hardening
- #5 DialogueRunner + DialogueScene fallback
- #7 PostCombatScene resilience  *(moved here from Wave 1 originally — see §11)*
- #8 InventorySystem.removeItem
- #9 RelationshipSystem time-trim
- #10 HubScene XP bar
- #11 PlayerStatsScene scroll/pagination

**Wave 2** (after partial Wave 1):
- #3 Wire validator (after #2)
- #6 CombatBridge resilience (after #1 AND **#7** — see §11)
- #12 LocationScene fallback (after #1)

**Wave 3** (after Wave 2):
- #13 Wire Toast subscriptions (after #1, #4, #5, #12)

**Wave 4** (final):
- #14 Conventions update + CLAUDE.md (after ALL coding tasks)

**Concurrency**: max 3 active coders at once. Tech-lead manages claim queue.

---

## 4. Architectural Rules (compiled — 17 rules)

### R1. applyEffects is fault-tolerant, NOT transactional
**Source**: brief S3 + frontend S1 + systems CR-6
Each effect commits its own `gameState.patch` independently. If effect N throws, effects 1..N-1 are already committed, and effects N+1..M continue. Failed effects:
- log via `console.error("DialogueRunner: effect '${type}' failed in dialogue '${this.graph.id}' node '${this.currentNodeId}': ${msg}")`
- emit `eventBus.emit("contentError", { source: "dialogue-effect", dialogueId: this.graph.id, nodeId: this.currentNodeId, detail })`
- DO NOT throw outward — the loop continues

**Rationale**: Full transactionality would require snapshot+restore of SaveData, which is overkill for Phase 1C. Partial-apply is documented behaviour.

### R2. DialogueScene empty-choices fallback uses setRoot, NOT replace
**Source**: frontend B2 + systems analysis of SceneRouter.ts

`sceneRouter.replace` mutates `stack[length-1]` only — leaves stale entries below in the stack. For broken-content recovery we need to fully reset the stack.

**Approved pattern**:
```ts
// In DialogueScene.handleChoiceNode when getAvailableChoices() === []:
sceneRouter.setRoot("HubScene");
this.scene.start("HubScene");
```

This is identical to what `HubScene.create()` line 99 already does (`sceneRouter.setRoot("HubScene")`), so it's idempotent and safe.

### R3. CombatBridge synthetic defeat — toast on destination, not source
**Source**: frontend G2 + systems analysis + backend R4 errorMessage refinement

CombatBridgeScene calling `toast.show(this, ...)` immediately before `sceneRouter.replace(this, "PostCombatScene")` causes the toast to die when the scene shuts down — player never sees it.

**Approved pattern** — synthetic defeat passes BOTH a type-guard flag AND the explicit error message via init data (backend R4 nit 2):

1. CombatBridgeScene synthetic-defeat path:
   ```ts
   sceneRouter.replace(this, "PostCombatScene", {
     result: { /* synthetic CombatResult — see R6 for full literal */ },
     encounterContext: null,
     onVictoryNode: this.onVictoryNode,
     onDefeatNode: this.onDefeatNode,
     returnToDialogueId: this.returnToDialogueId,
     synthesizedDefeat: true,                                                  // type guard flag
     errorMessage: `Ошибка контента: бой '${this.encounterId}' не найден`,     // explicit text
   });
   ```

2. PostCombatScene init data interface (`PostCombatData` in `PostCombatScene.ts:62`) gets two new optional fields:
   ```ts
   interface PostCombatData {
     // ... existing fields ...
     encounterContext: CombatContext | null;     // now nullable
     synthesizedDefeat?: boolean;                  // R3 — type guard
     errorMessage?: string;                        // R3 — toast text
   }
   ```

3. PostCombatScene.create() checks the flag and uses the message for the toast:
   ```ts
   if (this.sceneData.synthesizedDefeat) {
     this.renderFallback();
     if (this.sceneData.errorMessage) {
       toast.show(this, {
         message: this.sceneData.errorMessage,
         type: "error",
         durationMs: 5000,
       });
     }
   } else {
     this.renderUI(/* normal path */);
   }
   ```

   **Why both fields**: `synthesizedDefeat` is the type guard (sat null `encounterContext` flow), `errorMessage` carries the human-readable text computed at the call site (CombatBridge knows the missing encounter id, PostCombat doesn't need to re-derive it). Decoupling text from flag also allows future synthetic-defeat sources (e.g., character missing) to reuse the same flag with a different message.

4. The `contentError` event emit STILL happens in CombatBridgeScene (for monitoring/logging), but NOT used for toast display. Toast wiring (#13) ignores contentError when active scene is CombatBridge precisely because we route it through PostCombat init data instead.

**No `events.once("create", ...)` wrapper needed** — by the time PostCombatScene.create() runs, the scene is already active. Direct `toast.show(this, ...)` inside create() body works because Toast registers its own SHUTDOWN listener (R4) for cleanup.

**Coordination**: this requires task #6 to add the flag+errorMessage and task #7 to read them. Task #7 must complete BEFORE task #6 — see §11 / RISK-3.

### R4. Toast lifecycle — scene-bound only
**Source**: frontend A1 + backend R3 explicit SHUTDOWN listener requirement

Toast component MUST:
- Use `scene.add.existing(container)` so Phaser scene shutdown auto-destroys the container
- Use `scene.tweens.add(...)` for fade-in/fade-out, NOT `scene.time.delayedCall` for the destroy step (tweens are killed by scene.shutdown automatically; raw setTimeout is not)
- NOT use any global timer (no `window.setTimeout`, no Phaser global TweenManager singleton)
- Set `setDepth(2000)` — reserved layer (see §13 / depth zones)
- **Register explicit SHUTDOWN listener for leak prevention** (frontend A1 + backend R3):
  ```ts
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    // Cleanup any pending tweens, container references, queue state
    // Even though Phaser auto-cleans most objects, explicit hook ensures
    // ToastManager singleton's internal queue / DOM refs are released.
  });
  ```
  This guards against the ToastManager singleton holding stale Container references after scene.shutdown when toasts are still mid-fade.

**Verification**:
- `grep "globalTimer\|window.setTimeout" src/v2/ui/Toast.ts` → must return nothing
- `grep "Phaser.Scenes.Events.SHUTDOWN\|events.once" src/v2/ui/Toast.ts` → must return ≥1 line

### R5. ValidationResult shape (extended from spec)
**Source**: frontend S4 + backend B11

```ts
export interface ValidationResult {
  ok: boolean;
  errors: string[];   // throw on failure (registerV2Scenes)
  warnings: string[]; // console.warn list, NOT throw
}
```

**Errors** (throw blockers):
- `node.next` references missing node
- `choice.next` references missing node
- `node.onVictory` / `node.onDefeat` references missing node (for `battle` nodes)
- `battle.encounterId` not in ENCOUNTERS
- `encounter.characterId` not in CHARACTERS
- `encounter.rewards.loot[].itemDefId` not in ITEMS
- `location.hotspot.dialogues[].dialogueId` not in DIALOGUES
- **`graph.startNode` not in `graph.nodes`** (added by backend B11)
- `item.slot` not in valid set (defensive)

**Warnings** (logged, do not throw):
- **Dialogue node orphans** within a single graph: nodes referenced by NO other node and NOT the `startNode` of that graph
- Duplicate choice ids within a single choice node (REFINEMENT 5 — first wins, but flag it)

**NOT in warnings** (acceptable, do not flag):
- Orphan characters / encounters / locations across registries — content authors stage future content via partial registry entries; flagging would create false positives. Only validate cross-references between registries (e.g., dialogue's `encounterId` exists), not unused entries.

`ok` is `false` IFF `errors.length > 0`. `warnings` does not affect `ok`.

### R6. Single-source-enrichment exception for synthetic defeat
**Source**: backend B8

The gold-standard rule says `grep "CombatResult = {" src/v2/` returns at most 1 line. After Phase 1C, CombatBridgeScene's missing-encounter path adds a SECOND literal — this is an EXPLICIT EXCEPTION:

```ts
// CONTENT_ERROR_FALLBACK — bypasses applyResult intentionally:
//   - synthetic defeat is NOT a real combat result
//   - bypassing applyResult avoids corrupting stats.combatsLost
//   - relationship deltas not applied (no real combat occurred)
const syntheticResult: CombatResult = {
  encounterId: this.encounterId,
  characterId: "",
  victory: false,
  damageDealt: 0,
  damageReceived: 0,
  chainsBroken: 0,
  turnsPlayed: 0,
  appliedDelta: {},
  xpGained: 0,
  goldGained: 0,
};
```

**Acceptance criterion update**: `grep "CombatResult = {" src/v2/` may return up to **2 lines**, and the second one MUST be preceded within 5 lines by a `// CONTENT_ERROR_FALLBACK` comment.

### R7. SLOT_ORDER as module-level constant
**Source**: backend B10

Currently `InventorySystem.ts:100` has `const slots: ItemSlot[] = ["weapon", "armor", "accessory"]` as a local in `computeAggregateStats`. Task #8 must extract it to module-level:

```ts
// At top of src/v2/systems/InventorySystem.ts, after imports:
const SLOT_ORDER: readonly ItemSlot[] = ["weapon", "armor", "accessory"];
```

Then `computeAggregateStats` AND `removeItem` both iterate `SLOT_ORDER` instead of redefining the array.

### R8. importJson signature breaks safely (zero call sites)
**Source**: backend B6 + systems verification

`grep importJson src/` confirmed zero production call sites. Task #4 may freely change signature from `boolean` to `{ ok: true } | { ok: false; error: string }` without backwards-compat shims.

### R9. Schema validation: shallow + version + orphan cleanup + lastSavedAt clamp
**Source**: backend B5 + frontend S3 + systems CR-3 + backend R2 lastSavedAt clamp

`SaveManager.validateSaveShape` is private, returns `{ ok: true } | { ok: false; error: string }`. Checks:
- `data` is non-null object
- `data.version` is number AND `data.version <= SAVE_VERSION` (otherwise migration would fail)
- `data.player.stats` is object, `data.player.level` is number, `data.player.xp` is number, `data.player.xpToNext` is number
- `data.inventory.items` is array, `data.inventory.equipped` is object
- `data.story.flags` is object, `data.story.completedEncounters` is array
- `data.relationships` is object
- `data.settings.audio` is object, `data.settings.haptic` is object
- `data.stats` is object

Does NOT recurse into items[] or stats fields (overkill for Phase 1C — runtime errors at first read are accepted edge case).

After `validateSaveShape` passes, BEFORE `migrate`, `importJson` MUST:

**(a) auto-clean orphan equipped slots:**
```ts
const itemIds = new Set(parsed.inventory.items.map((it: any) => it.id));
for (const slot of SLOT_ORDER) {
  const equippedId = parsed.inventory.equipped[slot];
  if (equippedId && !itemIds.has(equippedId)) {
    delete parsed.inventory.equipped[slot];
    console.warn(`SaveManager.importJson: cleaned orphan equipped[${slot}] -> ${equippedId}`);
  }
}
```

**(b) clamp `lastSavedAt` to now if it's in the future** (corruption defense without rewriting valid history):
```ts
if (typeof parsed.lastSavedAt === "number" && parsed.lastSavedAt > Date.now()) {
  console.warn(`SaveManager.importJson: clamping future lastSavedAt ${parsed.lastSavedAt} → now`);
  parsed.lastSavedAt = Date.now();
}
```

Both transforms are FORGIVING — corrupted save still imports, just loses the orphan slot or has clamped timestamp. Better than rejecting the entire save.

`migrate(parsed)` is wrapped in its OWN try-catch (separate from JSON.parse and shape validation) so any migration error returns `{ ok: false, error }` instead of throwing.

**REMOVED from spec**: `dispose()` method. YAGNI per backend R2 — no current callers, no Phase 2 need yet. Will add when v1↔v2 mode switch teardown actually requires it.

### R10. SAVE_VERSION = 1 unchanged
**Source**: backend B12 + brief exclusion

All Phase 1C tasks are runtime-only (new methods, validation, UI). No SaveData schema changes. Verification: `grep "SAVE_VERSION = " src/v2/core/types.ts` returns the same line as before Phase 1C.

### R11. Validator = runtime, not compile-time plugin
**Source**: backend Q-B3 + systems analysis

Phase 1C uses runtime validation in `registerV2Scenes`. Vite plugin is overkill (~150 lines, new tooling complexity). Tradeoff: validator code (~1.4 KB compressed) ships in the v2 chunk. Acceptable per §1 budget.

Phase 2+ tech-debt: when content registry exceeds ~50 dialogues, gate validation behind `import.meta.env.DEV` so production tree-shakes the validator out. NOT in scope for Phase 1C — add a TODO comment.

### R12. EventBus DI = direct singleton import
**Source**: backend Q-B1 + existing v2 patterns

SaveManager / DialogueRunner / LocationScene use direct `import { eventBus } from "../core/EventBus"`. No setter injection. Matches existing `gameState`, `relationshipSystem`, `progressionSystem`, `inventorySystem` singleton patterns.

### R13. Idempotency reset in init() — FIRST line
**Source**: backend B7 + R2 refinement + systems verification of SceneRouter

`CombatBridgeScene.init()` is called every time `sceneRouter.push(this, "CombatBridgeScene", ...)` runs (SceneRouter uses `scene.scene.start()` which triggers init). The `this.resultApplied = false` reset belongs in `init()`, **as the FIRST line** (before any `data.X` reads). This guards against TypeError edge cases when init is called with empty/undefined data.

```ts
init(data: CombatBridgeData) {
  this.resultApplied = false;       // FIRST line — defensive against undefined data
  this.encounterId = data.encounterId;
  this.onVictoryNode = data.onVictoryNode;
  this.onDefeatNode = data.onDefeatNode;
  this.returnToDialogueId = data.returnToDialogueId;
}
```

**Verification**: `grep -A 1 "init(data: CombatBridgeData)" src/v2/scenes/CombatBridgeScene.ts` shows `this.resultApplied = false;` as the first non-blank line of the body.

### R14. getActiveV2Scene helper is local to src/v2/index.ts
**Source**: frontend Q2

The Toast wiring helper `getActiveV2Scene(game)` lives as a local non-exported function in `src/v2/index.ts`. NOT in SceneRouter (we are not refactoring SceneRouter — out of brief scope).

### R15. Spec bug fix: DialogueRunner uses `this.graph.id`, not `this.dialogueId`
**Source**: backend B2 + systems verification

DialogueRunner does NOT have a `dialogueId` field. It has `private readonly graph: DialogueGraph` (line 47) and `private currentNodeId: string` (line 37). Task #5 spec must replace ALL `this.dialogueId` mentions with `this.graph.id`.

### R16. Spec bug fix: SaveManager `migrate(parsed)`, not `this.migrate(parsed)`
**Source**: backend B1 + systems verification

`migrate()` in `src/v2/core/SaveManager.ts:127` is a module-level function, NOT a class method. Task #4 spec must use `migrate(parsed)` (no `this.`). This is also the form already used in the existing `importJson` (line 245).

### R17. Smoke test v1 after every Phase 1C merge
**Source**: brief Definition of Done + .conventions/checks/v2-isolation.md

Every PR merging into `dev-v2` MUST be preceded by a v1 smoke test:
1. DevTools → clear localStorage
2. Hard reload (Ctrl+Shift+R / Cmd+Shift+R)
3. Verify: BootScene → IntroScene → GameScene (no v2 chunk loaded in Network tab)
4. Play 2-3 turns, open settings panel, verify v1 functionality unchanged

Tech-lead enforces in PR review.

---

## 5. Spec Bug Fixes (apply before coders start)

The task descriptions contain references to APIs that don't exist or details refined during debate. Fix the descriptions before assigning:

| Task | Bug / Refinement | Fix |
|------|------------------|-----|
| #4 | `this.migrate(parsed)` | `migrate(parsed)` (module-level function, not class method) |
| #4 | `dispose()` Part D | **REMOVE** entirely (YAGNI per backend R2) |
| #4 | lastSavedAt clamp | Add: `if (parsed.lastSavedAt > Date.now()) parsed.lastSavedAt = Date.now()` after validateSaveShape |
| #4 | orphan equipped cleanup | Add post-shape `for slot of SLOT_ORDER: delete equipped[slot] if not in items` |
| #5 | `this.dialogueId` | `this.graph.id` (DialogueRunner has no dialogueId field) |
| #5 | nodeId source | `this.currentNodeId` |
| #2 | Missing `startNode` check | Add ERROR-level check `graph.startNode in graph.nodes` |
| #2 | Missing choice id uniqueness | Add WARNING-level check (push to `warnings`, not `errors`) |
| #2 | ValidationResult shape | Add `warnings: string[]` field |
| #6 | Synthetic defeat init data | Add `synthesizedDefeat: true` flag AND `errorMessage: string` (per R3 backend R4 refinement) |
| #6 | init reset order | `this.resultApplied = false;` MUST be the FIRST line of `init()`, before any `data.X` reads |
| #7 | Toast on missing-encounter | Read `synthesizedDefeat` flag + `errorMessage` (both optional in interface), show toast in `create()` body (no `events.once` wrapper needed) |
| #7 | `this.scene.settings.data` | Use existing `init(data)` pattern, store in `this.sceneData` (already exists) |
| #7 | Interface name | `PostCombatData` (existing), not `PostCombatSceneData` |
| #7 | `encounterContext` type | Make it `CombatContext \| null` for synthetic-defeat case |
| #8 | SLOT_ORDER | Extract to module-level const, reuse in computeAggregateStats |
| #9 | undefined log guard | `rel.decisionLog ?? []` defensive |
| #6 | Synthetic CombatResult missing required fields (F-NEW-1) | Add `damageDealt: 0, damageReceived: 0` — TS strict will reject otherwise (build fail). Full literal in R6. |
| #5 | Empty-choices fallback uses `sceneRouter.replace` (F-NEW-3) | Replace with `sceneRouter.setRoot("HubScene"); this.scene.start("HubScene")` per R2 — `replace` only mutates `stack[length-1]`, leaves stale `[Hub, Location, Hub]` entries |
| #5 | Fallback button missing from `this.choiceButtons` (F-NEW-2) | After `new DialogueChoiceButton(...)`, push into `this.choiceButtons` so existing handleTap guard `if (choiceButtons.length > 0) return` activates |
| #11 | Tap target 32px недостаточен (F-NEW-4) | `btnHeight = 44 * d` minimum (Apple HIG ≥44pt). Bundle delta: 0 KB |

Tech-lead applies these via TaskUpdate before assigning to coders.

---

## 6. Verification Checks (compiled from all 3 architects)

### Systems (CI / build / structure)

- `npm run build` passes (strict TS + Vite production)
- `npx tsc --noEmit` returns 0 errors
- v1 main chunk ≤135 KB (measured at gzipped output in `docs/assets/`)
- v2 chunk ≤85 KB (per §1 update)
- `grep "from \"\\.\\./v2/" src/scenes/GameScene.ts` returns only `import type` lines (zero runtime imports from v2)
- `grep "from \"\\.\\./v2" src/scenes/BootScene.ts` shows only the dynamic `await import("../v2")` form
- `grep "SAVE_VERSION = " src/v2/core/types.ts` shows the same version as before Phase 1C
- File `src/v2/ui/Toast.ts` exists, exports `toast` singleton instance
- File `src/v2/content/validate.ts` exists, exports `validateContent(): ValidationResult`
- `src/v2/index.ts` `registerV2Scenes` calls `validateContent()` BEFORE the scene loop
- `src/v2/core/EventBus.ts` `V2Events` interface contains `saveError`, `contentError`, `assetError` keys
- `grep "globalTimer\\|window\\.setTimeout" src/v2/ui/Toast.ts` returns nothing (R4)
- Smoke test v1: clean localStorage → IntroScene → GameScene works (R17)

### Backend (data layer / spec)

- `grep -n "isSaveFailed" src/v2/core/SaveManager.ts` returns ≥1 line
- `grep -n "private saveFailed" src/v2/core/SaveManager.ts` returns 1 line
- `grep -n "dispose" src/v2/core/SaveManager.ts` returns ZERO lines (per R9 round 2 — REMOVED, YAGNI)
- `grep -n "removeItem" src/v2/systems/InventorySystem.ts` returns 1 method definition
- `grep -n "this.resultApplied" src/v2/scenes/CombatBridgeScene.ts` returns ≥2 lines (init reset + handler check)
- `grep "CombatResult = {" src/v2/` returns ≤2 lines, second preceded by `// CONTENT_ERROR_FALLBACK`
- `grep "DECISION_LOG_MAX_AGE_MS" src/v2/systems/RelationshipSystem.ts` returns ≥2 lines (constant + usage)
- `grep "SLOT_ORDER" src/v2/systems/InventorySystem.ts` returns ≥3 lines (def + 2 usages)
- Schema validation manual test: `validateSaveShape(null)` → `{ ok: false }`, `validateSaveShape(createDefaultSaveData())` → `{ ok: true }`
- decisionLog manual test: insert `{ ts: Date.now() - 31*24*60*60*1000, ... }`, call `logDecision`, verify old entry removed
- Idempotency manual test: call `handleCombatComplete` twice with same args → second call no-ops (warn logged)
- Single `gameState.patch` per mutating method (atomicity)

### Frontend (UI / UX / scenes)

- HubScene XP bar visible under greeting, label `{xp} / {span} XP до {N+1} уровня` OR `МАКС`
- HubScene buttons not overlapped by XP bar (visual check at min screen size)
- PlayerStatsScene with 8 items: pagination controls visible, all items navigable
- PlayerStatsScene tap targets ≥44 px (mobile a11y)
- LocationScene with missing background: shows dark purple fallback + "загрузка фона..." text + toast
- DialogueScene empty choices: shows "← Вернуться в Hub" button + subtitle
- PostCombatScene synthetic-defeat path: shows toast "Ошибка контента..." + fallback rewards display + working continue button
- Toast appears at top of screen, fades in/out 200ms, auto-destroys (no leak after scene switch)
- Toast depth = 2000 (above modals, below cutscenes — see §13)
- All new buttons use `pointerdown` (NOT `pointerup`) per existing scene patterns

### Manual integration tests (post-merge)

1. Sabotage `lilana-act1.ts` choice.next → reload → game throws on boot with `validateContent` error → revert
2. Trigger save failure: fill localStorage with junk → play → toast appears
3. Empty choice: gate all choices on impossible flag → tap → "← Вернуться в Hub" appears
4. Missing encounter: rename `encounterId` in dialogue battle node → tap battle → toast in PostCombat + epilogue advances
5. Equip item → call `inventorySystem.removeItem(id)` from console → equipped slot becomes null
6. PlayerStats with 8 items added via console → pagination works
7. Add 51 entries to decisionLog → call `logDecision` → log trimmed to 50
8. Add entry with old `ts` to decisionLog → call `logDecision` → old entry removed
9. v1 smoke test: clean localStorage → game runs as v1, no v2 chunk loaded

---

## 7. Open Risks

### RISK-1: Toast lifecycle leak in HMR (dev only)
Frontend H3 noted that Vite HMR may double-instantiate scenes during hot reload, causing duplicate toast subscriptions. **Mitigation**: idempotency guard in #13 wiring (`let toastWired = false;` module flag). Production unaffected (no HMR).

### RISK-2: Bundle budget overrun
Estimated delta is ~9.8 KB compressed → projected 83.6 KB. Budget headroom: 1.4 KB at 85 KB ceiling. If real build exceeds 85 KB, **escalation path**: tech-lead spawns a `simplify` task on the largest contributor (Toast or PostCombat fallback). DO NOT silently bump the budget further.

### RISK-3: synthesizedDefeat coordination between #6 and #7
Task #7 must complete BEFORE task #6 (#7 in Wave 1, #6 in Wave 2 with `blockedBy: [#1, #7]`). If a coder claims #6 in Wave 1 by mistake, the synthetic-defeat path will hit a PostCombat that doesn't yet handle null encounterContext → runtime crash on the missing-encounter edge case. **Mitigation**: tech-lead verifies wave plan via TaskUpdate addBlockedBy before assigning #6.

### RISK-4: EventBus extension race
Two coders in Wave 1 (#4 and #5) may both touch `EventBus.ts` at the same time. **Mitigation**: §2 contract — first claimer adds all three event types, second claimer rebases. Tech-lead serializes via task assignment if needed.

### RISK-5: Validator catches NEW dangling refs that existed pre-Phase 1C
If the existing Lilana content has any dangling refs (typos that the runner happened to never hit), validator will throw on first boot after #3 wires it. **Mitigation**: in task #3, the coder should run `validateContent()` from console BEFORE wiring it into registerV2Scenes, fix any caught issues in a separate PR (treat as a content bug, not a Phase 1C blocker).

### Known Limitation (accepted): RelationshipSystem clock skew
Per backend CR-6 R2 discussion: the time-trim logic uses raw `Date.now()`. If the player's device clock skips backwards (system clock manually rolled back, NTP drift), recent decisionLog entries become "in the future" relative to the trim cutoff and are silently kept. If the clock skips forward by ≥30 days, all existing entries become "stale" and are removed on the next logDecision. Both edge cases are accepted — defensive sanity checks (`now < DECISION_LOG_MAX_AGE_MS * 2` etc.) had false-positive issues for new players in clean install (their `metAt` is real epoch time, always > 60 days). Document, do not defend against, in Phase 1C.

---

## 8. Out of Scope (reaffirm exclusions)

Per brief, Phase 1C does NOT touch:
- Match-3 mechanic: `Board.ts`, `GameScene.ts`, `src/match3/`, `src/game/`, `src/ui/` (v1 ui), `src/utils/`
- New content: zero new dialogues / characters / locations / items
- ProgressionSystem / InventorySystem / RelationshipSystem rewrites (only point additions)
- Full settings panel
- SceneRouter refactor beyond hot-fix `714466d`
- SAVE_VERSION bump
- External libraries for schema validation
- Unit test framework setup (vitest/jest) — out of scope for Phase 1C

---

## 9. Conventions Update Plan (Task #14)

Per coordinated agreement after 4 rounds debate, task #14 deliverables:

**4 gold standards** (new files):
- `.conventions/gold-standards/toast-notifications.ts` — singleton manager + scene-aware show + EventBus integration + depth zones (500-999 scene, 1000-1499 modals, 1500-1999 reserved, 2000+ toasts) + explicit SHUTDOWN listener
- `.conventions/gold-standards/content-validation.ts` — fail-fast pattern в registerV2Scenes; aggregated errors; ValidationResult shape `{ ok, errors, warnings }`; runtime not Vite plugin (R11)
- `.conventions/gold-standards/resilient-scene-fallback.ts` — empty-state UI pattern (PostCombat synthesizedDefeat fallback, DialogueScene empty choices, LocationScene asset fallback); covers `synthesizedDefeat + errorMessage` init data shape; includes `setRoot+start` instead of `replace` for clean stack reset
- `.conventions/gold-standards/fault-tolerant-effect-chains.ts` — *(replaces proposed `avoid-non-atomic-effect-chains.md` anti-pattern per frontend round 4 nit + Primary tiebreaker)* documents the spectrum: **DialogueRunner.applyEffects is fault-tolerant by design** (per R1 — partial application acceptable, each effect commits independently with try-catch + contentError emit) vs **InventorySystem.removeItem is atomic by design** (single gameState.patch wraps both items[] filter and equipped slot cleanup). The standard documents WHEN each pattern applies and shows both code shapes side-by-side. Replacing the anti-pattern with a positive standard avoids contradicting R1.

**1 anti-pattern** (new file):
- `.conventions/anti-patterns/avoid-silent-save-failures.md` — never catch save errors without user feedback; references R9 (lastSavedAt clamp) and R12 (eventBus emit)

**Updates to existing**:
- `.conventions/checks/v2-isolation.md` — add allowed event types section (saveError, contentError, assetError) so future v2 scenes know they can subscribe
- `CLAUDE.md` "Текущий статус" — mark Phase 1C completed, list features (Toast, validator, removeItem, etc.), update chunk sizes (v1 ~132.x KB, v2 ~83-84 KB)

---

## 10. Primary Architect Sign-off

**4 rounds debate complete**:
- **Round 1**: 3 architects sent CRITIQUE + responses
- **Round 2**: consolidated final positions; backend lastSavedAt clamp + dispose REMOVE; frontend F-NEW-1..4 catches; systems measured-ratio bundle budget 85 KB
- **Round 3**: tiebreaker on dispose (REMOVE wins, frontend abstain), Toast depth (2000 final), bundle 85 KB final consensus 3-0
- **Round 4**: frontend FE-V1..FE-V12 verification checks added; backend 3 nits applied (errorMessage on synthesized defeat, init reset position, orphan scope clarification)

**Spec approved** by:
- ✅ **architect-systems** (Primary, this document author)
- ✅ **architect-frontend** (final convergence after 4 rounds)
- ✅ **architect-backend** (final accept of all Primary tiebreakers in round 3)

**Final consensus reached on**: bundle 85 KB temporary Phase 1C exception, EventBus extension contract via DECISIONS.md §2 (no separate task #4a), dispose() REMOVED, lastSavedAt clamp, synthesizedDefeat + errorMessage flag pattern, DialogueScene fallback setRoot+start, Toast depth 2000 with reserved zones, SLOT_ORDER in InventorySystem.ts (NOT content/types.ts), ValidationResult warnings split, schema validation shallow + version + orphan cleanup, idempotency reset as first line of init(), single-source-enrichment exception with CONTENT_ERROR_FALLBACK comment, fault-tolerant gold standard replaces atomicity anti-pattern.

Phase 1C is GREEN-LIT for execution. Tech-lead applies:
1. Spec bug fixes (§5) via TaskUpdate ✓
2. Update task #6 blockedBy to include #7 (§11/RISK-3) ✓
3. Spawn coders in Wave 1 (max 3 active) ✓
4. Switch architects to REVIEW MODE ✓
