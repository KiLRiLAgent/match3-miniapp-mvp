# Architectural Decisions — v2 Phase 1A (Lilana Vertical Slice)

This document is the **authoritative source of truth** for the architectural decisions made during the planning phase debate between architect-frontend, architect-backend, and architect-systems. All coders MUST read this document in addition to their task descriptions — it supersedes any conflicting details in the original task descriptions.

---

## ⚠️ FINAL REFINEMENTS (after Lead tiebreaker — supersedes sections #1, #14 below)

The architects went through 4 rounds of debate. Lead applied tiebreaker on callback vs eventBus: **callback wins**. After tiebreaker, three additional refinements were converged on. These take precedence over the original sections numbered below.

### REFINEMENT 1: Callback lives in scene init data, NOT in CombatContext

**Change:** `CombatContext.onComplete?: ...` field is REMOVED. The callback is passed alongside `encounterContext` as a separate field in `GameSceneInitData`.

**Why:** CombatContext is now 100% pure data. `DeepReadonly<CombatContext>` works cleanly without `Omit` workarounds (functions can't be frozen). The closure still captures `this` of CombatBridgeScene through the arrow function — semantics identical to embedding the callback in context.

**Final shape:**

```typescript
// src/v2/content/types.ts
export interface CombatContext {
  encounterId: string;
  characterId: string;
  encounterDef: DeepReadonly<EncounterDef>;
  playerStats: DeepReadonly<PlayerCombatStats>;
  derived: DeepReadonly<{ bossHpMax: number; bossLayerHpArray: readonly number[] }>;
  relationshipSnapshot: DeepReadonly<RelationshipState>;
  // NO onComplete — passed separately via scene init data
}

export interface GameSceneInitData {
  fromIntro?: boolean;
  finalDialogue?: string;
  startHidden?: boolean;
  bgState?: { x: number; y: number; scale: number };
  bossState?: { x: number; y: number; scale: number };
  // v2 additions:
  encounterContext?: CombatContext;
  onCombatComplete?: (raw: RawCombatResult) => void;
}
```

**GameScene fields:**
```typescript
private encounterContext?: CombatContext;
private onCombatComplete?: (raw: RawCombatResult) => void;
```

**GameScene init capture:**
```typescript
init(data?: GameSceneInitData) {
  this.encounterContext = data?.encounterContext;
  this.onCombatComplete = data?.onCombatComplete;
}
```

**CombatBridgeScene wiring:**
```typescript
const baseContext = encounterBuilder.build(encounterDef);
this.encounterContext = baseContext;
this.scene.launch("GameScene", {
  encounterContext: baseContext,  // pure frozen data
  onCombatComplete: (raw) => this.handleCombatComplete(raw, encounterDef),  // closure separately
});
this.scene.sleep();
```

### REFINEMENT 2: RawCombatResult vs CombatResult separation (Option Y)

**Change:** Two distinct types instead of one. GameScene produces RawCombatResult (no enrichment fields). CombatBridgeScene calls `encounterBuilder.applyResult(raw, encounterDef)` which enriches to CombatResult (with `appliedDelta`, `xpGained`, `goldGained`).

**Why:** GameScene is the combat engine — it doesn't know about encounter rewards or relationship system. EncounterBuilder is the SOLE point of combat reward SaveData mutation. PostCombatScene is purely a display — it doesn't mutate state.

**Final types:**

```typescript
// src/v2/content/types.ts
export interface RawCombatResult {
  encounterId: string;
  characterId: string;
  victory: boolean;
  damageDealt: number;
  damageReceived: number;
  chainsBroken: number;
  turnsPlayed: number;
}

export interface CombatResult extends RawCombatResult {
  appliedDelta: RelationshipDelta;
  xpGained: number;
  goldGained: number;
}
```

**GameScene emit:**
```typescript
private emitV2CombatResult(victory: boolean): boolean {
  if (!this.encounterContext || !this.onCombatComplete) return false;
  const raw: RawCombatResult = {
    encounterId: this.encounterContext.encounterId,
    characterId: this.encounterContext.characterId,
    victory,
    damageDealt: this.stats.totalDamageDealt,
    damageReceived: this.stats.totalDamageReceived,
    chainsBroken: this.v2ChainsBroken,
    turnsPlayed: this.stats.turnsPlayed,
  };
  this.onCombatComplete(raw);  // RawCombatResult, NOT CombatResult
  return true;
}
```

**CombatBridgeScene enrichment:**
```typescript
private handleCombatComplete = (raw: RawCombatResult, encounterDef: EncounterDef) => {
  // Apply rewards via EncounterBuilder (single source of truth for SaveData mutation)
  const appliedDelta = encounterBuilder.applyResult(raw, encounterDef);

  // Enrich raw → CombatResult
  const enriched: CombatResult = {
    ...raw,
    appliedDelta,
    xpGained: raw.victory ? encounterDef.rewards.xp : 0,
    goldGained: raw.victory ? encounterDef.rewards.gold : 0,
  };

  this.scene.stop("GameScene");
  this.scene.wake();
  sceneRouter.replace(this, "PostCombatScene", {
    result: enriched,
    encounterContext: this.encounterContext,  // for relationshipSnapshot access
    onVictoryNode: this.onVictoryNode,
    onDefeatNode: this.onDefeatNode,
    returnToDialogueId: this.returnToDialogueId,
  });
};
```

**EncounterBuilder.applyResult signature:**
```typescript
applyResult(raw: RawCombatResult, encounterDef: EncounterDef): RelationshipDelta {
  // Apply XP/gold/relationship/stat counters via gameState.patch
  // Return the applied delta (for CombatBridgeScene enrichment)
}
```

### REFINEMENT 3: ChainOverlay lives in `src/ui/`, NOT `src/v2/ui/`

**Change:** ChainOverlay is in `src/ui/ChainOverlay.ts` — neutral location, NOT v2-specific.

**Why:** GameScene needs to **instantiate** ChainOverlay (`new ChainOverlay(...)`), not just hold a type reference. Type-only imports don't give you the constructor. Putting ChainOverlay in `src/v2/ui/` would force a runtime cross-boundary import (violating v2-isolation), or a dynamic await import (awkward in sync `create()`). Neutral location avoids the dilemma — ChainOverlay is a generic Match-3 UI capability, not v2-specific semantically.

**GameScene import:**
```typescript
import { ChainOverlay } from "../ui/ChainOverlay";  // neutral, full runtime import allowed
```

**Final API (manager class, NOT Container):**
```typescript
export class ChainOverlay {
  constructor(scene: Phaser.Scene, boardOriginX: number, boardOriginY: number, cellSize: number);
  setChains(chains: Chain[]): void;
  animateDamage(damaged: Chain[]): Promise<void>;
  animateBroken(broken: Chain[]): Promise<void>;
  destroy(): void;
}
```

Coordinates use **logical units** (no DPR multiplication) since GameScene uses zoomed camera convention.

### REFINEMENT 4: HotspotDialogueOption.priority field

**Change:** `HotspotDialogueOption` gains optional `priority?: number` field for explicit ordering.

```typescript
export interface HotspotDialogueOption {
  dialogueId: string;
  condition?: ConditionExpr;
  priority?: number;  // higher picked first; if all undefined, array order wins
}
```

**LocationScene resolution:**
```typescript
const matching = hotspot.dialogues.filter(opt =>
  !opt.condition || evaluateCondition(opt.condition, save, hotspot.characterId)
);
matching.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
return matching[0]?.dialogueId ?? null;
```

**Lilana Atrium hotspot:**
```typescript
dialogues: [
  { dialogueId: "lilana-act4", condition: { flag: "lilana:act2:done", flagEquals: true }, priority: 4 },
  { dialogueId: "lilana-act2", condition: { flag: "lilana:act1:done", flagEquals: true }, priority: 2 },
  { dialogueId: "lilana-act1", priority: 1 },
]
```

### REFINEMENT 5: selectChoiceById, NOT selectChoice(originalIndex)

DialogueRunner exposes `selectChoiceById(id: string)`. `DialogueChoice.id` is required. `getAvailableChoices()` returns `DialogueChoice[]` (filtered, no originalIndex wrap). DialogueScene passes `choice.id` from button click handlers.

This is the final API — supersedes any earlier mention of `originalIndex`.

**⚠️ NOTE FOR TASK #3 CODERS**: The Task #3 description still embeds a stale stub using `selectChoice(originalIndex: number)` and `AvailableChoice` wrapper type. **IGNORE THE STALE STUB.** The canonical API is `selectChoiceById(id: string)` per this refinement. The `AvailableChoice` type does NOT exist in `src/v2/content/types.ts` (committed in 130539b) — only `DialogueChoice` exists. Following the stale stub literally would cause TS strict build failure on the missing `AvailableChoice` import. Escalated by coder-1 during REVIEW MODE; resolution: implement per REFINEMENT 5.

### REFINEMENT 6: bossPattern uses BossAbilityType[] (typed strings)

`EncounterDef.bossPattern: BossAbilityType[]` — typed strings like `["attack", "shield", "attack", ...]`.

**⚠️ CONVERSION DETAIL SUPERSEDED BY REFINEMENT 8** — see REFINEMENT 8 below. The code snippets in this section (showing `ABILITY_INDEX_MAP` conversion and `.map(name => INDEX[name])`) are **STALE** and were written before the Round 4 simplification. The canonical approach per REFINEMENT 8 is to pass `BossAbilityType[]` **directly** to `BossAbilityManager` with zero conversion — `BossAbilityManager.pool` is already typed `BossAbilityType[]` internally.

**Canonical form is in REFINEMENT 8 below. Ignore the snippets in this section.**

```typescript
// ⚠️ STALE — do NOT implement this, see REFINEMENT 8 for canonical form
// src/game/config.ts
export const ABILITY_INDEX_MAP: Record<BossAbilityType, number> = {
  attack: 1,
  bombs: 2,
  shield: 3,
  powerStrike: 4,
};
// Also: export const ABILITY_MAP (currently file-private) for v2 use
```

```typescript
// ⚠️ STALE — do NOT implement this, see REFINEMENT 8 for canonical form
// GameScene resetState
const patternOverride = this.encounterContext
  ? this.encounterContext.encounterDef.bossPattern.map(name => ABILITY_INDEX_MAP[name])
  : undefined;
this.bossAbilityManager = new BossAbilityManager(patternOverride);
```

### REFINEMENT 7: `ChainVariant` lives in `src/match3/types.ts`, NOT `src/v2/content/types.ts`

**Added during REVIEW MODE after coder-2 escalation on Task #2.**

**Change:** The `ChainVariant` type is defined in `src/match3/types.ts` alongside `Chain`, `Tile`, `TileKind`, `Position`, `Match`, `BaseTileKind`. It is NOT defined in `src/v2/content/types.ts`.

**Why:** `Chain` is a `Match3Board` concept (per Task #2). `ChainVariant` is an intrinsic attribute of the Chain, not v2-specific metadata. Placing it in `src/v2/content/types.ts` would create an **inverse dependency** (`src/match3/*` importing from `src/v2/*`) that violates the canonical v2-isolation direction ("v2 imports match3 as a library, not vice versa"). Even a type-only import in this direction is architecturally incorrect — it inverts ownership.

Precedent: all other match3 primitive types (`TileKind`, `BaseTileKind`, `Position`, `Tile`, `Match`) live in `src/match3/types.ts`. `ChainVariant` is the same kind of primitive.

**Reusability:** If Phase 2+ ever adds chains to v1 mode (modding, custom encounters), chain types MUST live in match3/. Putting `ChainVariant` in v2/content/ would force a refactor later.

**Also:** Coder dependency unblocked — Task #2 no longer depends on Task #1 merging the types file. Coder-2 can implement #2 immediately without waiting for coder-1 to finish #1.

**Final canonical placement:**

```typescript
// src/match3/types.ts
export type ChainVariant = "iron" | "thorn" | "gold";

export interface Chain {
  pos: Position;
  hp: number;
  variant: ChainVariant;  // required — default applied at placeChains mapping time
}
```

```typescript
// src/v2/content/types.ts (Task #1)
import type { ChainVariant } from "../../match3/types";  // type-only, downward dep — canonical

export interface ChainPlacement {
  x: number;
  y: number;
  hp: number;
  variant?: ChainVariant;  // optional in content, defaults to "iron" at placement time
}
```

Task #1 re-references (not re-exports) `ChainVariant` from the match3 namespace. Task #2 defines the canonical type.

**Retroactive spec corrections:**
- Task #2 spec: `ChainVariant` defined locally in `src/match3/types.ts` (no import from `src/v2/content/types`)
- Task #1 spec: `ChainPlacement.variant?: ChainVariant` where `ChainVariant` is imported type-only from `../../match3/types`

### REFINEMENT 8: `BossAbilityManager` accepts `BossAbilityType[]` directly — NO `ABILITY_INDEX_MAP` conversion

**Added during REVIEW MODE after detecting inconsistency between Sections 4 and 5 of original DECISIONS.md.**

**Change:** `BossAbilityManager` constructor accepts `patternOverride?: BossAbilityType[]` (typed strings) **directly**. No conversion to `number[]` via `ABILITY_INDEX_MAP`. The `ABILITY_INDEX_MAP` constant is NOT added to `config.ts`.

**Why:** After Round 4 debate between architect-systems and architect-backend, we verified that `BossAbilityManager.pool` is internally typed as `BossAbilityType[]` already (`src/game/BossAbility.ts:34`). The existing `getConfigPool()` method (lines 52-65) converts `GAME_PARAMS.bossPattern` (legacy `number[]`) to `BossAbilityType[]` via a **private** file-scoped `ABILITY_MAP`. For v2, we skip this conversion entirely — encounter content authors write typed strings (`["attack", "shield", ...]`), these flow directly into `BossAbilityManager` constructor, zero conversion.

**Result:**
- Zero new exports in `config.ts` (no `ABILITY_MAP` export, no `ABILITY_INDEX_MAP` export)
- Zero conversion code in GameScene `resetState` or EncounterBuilder
- Simpler cross-zone footprint for Task #5 (only `getBossLayerHpArray` / `getBossLayerIndex` optional params remain)

**Final canonical form (CORRECTED during Task #6 review — see note below):**

```typescript
// src/game/BossAbility.ts (Task #6 cross-zone)
export class BossAbilityManager {
  private pool: BossAbilityType[] = [];
  private _currentType: BossAbilityType = "attack";
  private currentCooldown: number;
  // v2: stored pattern override — persists across refillPool calls so that
  // v2 encounters use their own pattern pool across the full fight, not
  // just the initial draw. Without this instance field, the pool would
  // refill from GAME_PARAMS.bossPattern on the 2nd+ refill (v1 bleed).
  private patternOverride?: BossAbilityType[];

  constructor(patternOverride?: BossAbilityType[]) {
    this.patternOverride = patternOverride;
    this.refillPool();
    this.drawNext();
    this.currentCooldown = this.getCurrentAbilityCooldown();
  }

  private refillPool(): void {
    // v2: prefer stored override, fall back to GAME_PARAMS legacy path
    const pool = this.patternOverride ?? this.getConfigPool();
    this.pool = shuffle(pool);
  }
}
```

**⚠️ CORRECTION NOTE (added during Task #6 review)**: my original REFINEMENT 8 spec showed `refillPool(override?: BossAbilityType[])` with the override passed as a parameter only on the initial call from the constructor. This was **incorrect** — BossAbilityManager refills the pool on every exhaustion cycle, so without the instance field, subsequent refills would read `GAME_PARAMS.bossPattern` (v1 bleed-back) instead of the encounter's pattern.

**The correct pattern stores `patternOverride` as an instance field** so `refillPool()` can read it on every call. The first draft of this refinement missed this nuance. `BossAbilityType[]` is still correct (zero conversion from content to BossAbilityManager), and the fix is a minimal two-line change: add the instance field + assign it in constructor.

**Do NOT store `number[]`** — that reintroduces conversion and contradicts REFINEMENT 6's typed-string decision. If you see `number[]` in uncommitted code, it's a violation — fix to `BossAbilityType[]`.

```typescript
// src/scenes/GameScene.ts resetState (Task #6)
// v2: pass typed pattern directly — no conversion needed
const patternOverride = this.encounterContext?.encounterDef.bossPattern;  // BossAbilityType[] directly
this.bossAbilityManager = new BossAbilityManager(patternOverride);
```

**This supersedes Section 4's `ABILITY_INDEX_MAP` conversion example and Section 4's "export const ABILITY_MAP" requirement.** Both were stale after Round 4 simplification.

**Retroactive spec corrections:**
- Section 4 conversion example is STALE. GameScene does NOT convert via `ABILITY_INDEX_MAP`. Pass typed strings directly.
- `config.ts` changes for Task #5 are ONLY: `getBossLayerHpArray` and `getBossLayerIndex` with optional defaults. NO `ABILITY_MAP` export. NO `ABILITY_INDEX_MAP` export.
- Task #6 description inline `ABILITY_TO_INDEX` Record (mentioned in Lead's earlier task update) is also STALE. NO such Record is needed in GameScene.

### REFINEMENT 9: v1 chunk budget raised to 135 kB (from 130 kB)

**Added during REVIEW MODE after Task #6 coder-2 escalated bundle budget concern.**

**Change:** v1 chunk (`docs/assets/index-*.js`) budget raised from ≤130 kB to **≤135 kB** for Phase 1A. This is the verification criterion used by VC-S7 and future bundle regression tests.

**Why:** My original SPEC APPROVED set ≤130 kB as an arbitrary ~5 kB headroom above the pre-Phase-1A v1 chunk (~125 kB per CLAUDE.md). Task #6 adds ChainOverlay as a runtime import (via `src/ui/ChainOverlay.ts` per REFINEMENT 3), which contributes ~2.4 kB to the v1 chunk even though ChainOverlay is only instantiated in v2 mode — tree-shaking cannot elide the static import.

**Options considered during REVIEW MODE**:
- **Option 1 (ACCEPTED)**: Raise budget to 135 kB. Preserves REFINEMENT 3 (neutral src/ui/ location, sync constructor access from GameScene.create()). Net bundle impact: +0.8 kB gzipped = negligible mobile download cost.
- **Option 2 (REJECTED)**: Lazy dynamic `await import("../ui/ChainOverlay")` inside `create()`. Would require `async create()` which is an undocumented Phaser pattern. IntroScene.ts:423 calls `scene.launch("GameScene")` then immediately `await gameScene.triggerFadeIn(...)` — depends on GameScene's create() completing synchronously. Async create introduces null-reference bugs and inconsistent first-encounter UX.
- **Option 3 (REJECTED)**: Inline ChainOverlay into GameScene. Breaks REFINEMENT 3 (neutral location, reusability).

**Decision rationale**:
1. ChainOverlay is a legitimate feature, not bloat — 172 lines of manager class proportional to the capability.
2. Raising the budget to accommodate honest feature cost is healthier than compromising REFINEMENT 3's design.
3. Option 2's async complexity introduces more risk than the 2.4 kB savings justify.
4. The 130 kB number was my arbitrary initial choice, not a hard external constraint.

**Phase 1A measured v1 chunk sizes** (reference for future regression tests):
- Pre-Phase-1A baseline: ~125 kB (per CLAUDE.md)
- After Task #2 Match3Board chains: 127.06 kB (+2.06 kB — Chain methods unused at module load = tree-shaken)
- After Task #5 config.ts refactor: 127.14 kB (+0.08 kB — default params expansion)
- After Task #6 GameScene patch: **132.37 kB** (+5.23 kB — includes ChainOverlay runtime import + ~150 lines of GameScene v2 patches)

**Remaining budget** for Phase 1A tasks: ≤135 kB. Future tasks (#10 DialogueScene, #11 CombatBridgeScene, #12 wire-up) should NOT add to v1 chunk size — they're all v2-only, tree-shaking will keep them in the v2 lazy chunk.

**Action items for Task #13 Conventions update**:
- Update VC-S7 verification criterion: "v1 chunk `index-*.js` ≤ 135 kB" (was 130 kB)
- Document the ChainOverlay runtime import decision in `.conventions/gold-standards/feature-gated-patches.ts`
- Add note: "When adding generic UI capabilities that v2 needs sync access to, prefer src/ui/ neutral location over src/v2/ui/ even with a small v1 chunk growth cost. Async workarounds (`await import(...)`) in Phaser `create()` are NOT acceptable — they break scene lifecycle expectations (see IntroScene.ts:423 precedent)."

### Sections #1 and #14 below are SUPERSEDED by these refinements

Sections #1 (callback in CombatContext) and #14 (ChainOverlay in src/v2/ui/) below are kept for historical reference but are NO LONGER VALID. Use the refinements above as the canonical spec. **Also note: Section 4's ABILITY_INDEX_MAP conversion example is SUPERSEDED by REFINEMENT 8.**

---

## ⚠️⚠️ RISK MITIGATIONS (post-risk-analysis) — supersedes Section #9 below

After 6 risk-testers investigated CRITICAL/MAJOR risks, Primary Architect approved 7 additional mitigations. These supersede any earlier guidance.

### MITIGATION-1: RISK-4 — Use 3 getter methods, NOT snapshot field

**Problem**: Section #9 below proposed `private effective = { playerHpMax, playerManaMax, bossHpMax }` snapshot populated in resetState. Risk-tester confirmed this would regress v1 dev-tester corner case where SettingsPanel.adjustParam mutates GAME_PARAMS live during a fight (close-via-X without restart) — current v1 IS live-reading at all 20 sites.

**Solution**: Replace the `effective` snapshot field with 3 method-based getters that branch on encounterContext:

```typescript
// v2: effective stat helpers — preserve v1 live-read semantics
private getEffectivePlayerHpMax(): number {
  return this.encounterContext?.playerStats.hpMax ?? GAME_PARAMS.player.hpMax;
}
private getEffectivePlayerManaMax(): number {
  return this.encounterContext?.playerStats.manaMax ?? GAME_PARAMS.player.manaMax;
}
private getEffectiveBossHpMax(): number {
  return this.encounterContext?.derived.bossHpMax ?? GAME_PARAMS.boss.hpMax;
}
```

**Replacement rules** for the 20 GAME_PARAMS read sites in GameScene:
- `GAME_PARAMS.player.hpMax` → `this.getEffectivePlayerHpMax()`
- `GAME_PARAMS.player.manaMax` → `this.getEffectivePlayerManaMax()`
- `GAME_PARAMS.boss.hpMax` → `this.getEffectiveBossHpMax()`

**Zero alloc per access** (just function call + optional chain + nullish coalesce). **v1 live-read semantics preserved** — each call re-reads GAME_PARAMS. **v2 stable** — encounterContext never changes during fight.

**CRITICAL pairing**: at line pairs `1265+1266`, `1278+1283`, `1296+1302`, both `clamp(...)` and `setValue(...)` must use the SAME getter. Mixing produces internal/displayed state divergence. Verify line-by-line during coder review.

**Full list of 20 GameScene sites** (risk-tester D's exact line numbers — supersedes architect's 18 estimate which missed 994 and 1266):

| # | Line | Code | Function |
|---|---|---|---|
| 1 | 334 | `this.bossHp = GAME_PARAMS.boss.hpMax;` | resetState — KEEP as-is (initial assignment, not a read) |
| 2 | 335 | `this.playerHp = GAME_PARAMS.player.hpMax;` | resetState — KEEP as-is |
| 3 | 994 | `const hpRatio = this.playerHp / GAME_PARAMS.player.hpMax;` | updateVignette → `getEffectivePlayerHpMax()` |
| 4 | 1241 | `bossHpBar?.setValue(bossHp, GAME_PARAMS.boss.hpMax);` | applyDamageToBoss → `getEffectiveBossHpMax()` |
| 5 | 1265 | `playerHp = clamp(playerHp - damage, 0, GAME_PARAMS.player.hpMax);` | applyDamageToPlayer → `getEffectivePlayerHpMax()` (PAIR with 1266) |
| 6 | 1266 | `playerHpBar?.setValue(playerHp, GAME_PARAMS.player.hpMax);` | applyDamageToPlayer → `getEffectivePlayerHpMax()` (PAIR with 1265) |
| 7 | 1278 | `mana = clamp(mana + manaGain, 0, GAME_PARAMS.player.manaMax);` | applyManaToPlayer → `getEffectivePlayerManaMax()` (PAIR with 1283) |
| 8 | 1283 | `manaBar?.setValue(mana, GAME_PARAMS.player.manaMax);` | applyManaToPlayer → `getEffectivePlayerManaMax()` (PAIR with 1278) |
| 9 | 1296 | `playerHp = clamp(playerHp + healGain, 0, GAME_PARAMS.player.hpMax);` | applyHealToPlayer → `getEffectivePlayerHpMax()` (PAIR with 1302) |
| 10 | 1302 | `playerHpBar?.setValue(playerHp, GAME_PARAMS.player.hpMax);` | applyHealToPlayer → `getEffectivePlayerHpMax()` (PAIR with 1296) |
| 11 | 1313 | `bossHp = clamp(bossHp + healGain, 0, GAME_PARAMS.boss.hpMax);` | applyHealToBoss → `getEffectiveBossHpMax()` |
| 12 | 1667 | `bossHpBar?.setValue(bossHp, GAME_PARAMS.boss.hpMax);` | updateHud → `getEffectiveBossHpMax()` |
| 13 | 1668 | `playerHpBar?.setValue(playerHp, GAME_PARAMS.player.hpMax);` | updateHud → `getEffectivePlayerHpMax()` |
| 14 | 1669 | `manaBar?.setValue(mana, GAME_PARAMS.player.manaMax);` | updateHud → `getEffectivePlayerManaMax()` |
| 15 | 1699 | `const ratio = bossHp / GAME_PARAMS.boss.hpMax;` | updateBossArt → `getEffectiveBossHpMax()` |
| 16 | 1735 | `manaBar?.setValue(mana, GAME_PARAMS.player.manaMax);` | activateSkill → `getEffectivePlayerManaMax()` |
| 17 | 2678 | `bossHpBar?.setValue(bossHp, GAME_PARAMS.boss.hpMax);` | executeAttack (boss) → `getEffectiveBossHpMax()` |
| 18 | 2679 | `playerHpBar?.setValue(playerHp, GAME_PARAMS.player.hpMax);` | executeAttack (boss) → `getEffectivePlayerHpMax()` |
| 19 | 2680 | `manaBar?.setValue(mana, GAME_PARAMS.player.manaMax);` | executeAttack (boss) → `getEffectivePlayerManaMax()` |
| 20 | 2796 | `manaBar?.setValue(mana, GAME_PARAMS.player.manaMax);` | executePowerStrike → `getEffectivePlayerManaMax()` |

**Net replacements: 18** (excluding lines 334, 335 which are the initial assignment, not reads).

Lines 334 and 335 in resetState are KEPT as direct GAME_PARAMS reads since they set the initial bossHp/playerHp values for v1 mode. v2 mode also passes through these lines but the values are immediately overwritten by encounterContext-derived values. Both branches converge through the same code path with the right values.

Verify via grep:
```bash
rg "GAME_PARAMS\.(player|boss)\.(hpMax|manaMax)" src/scenes/GameScene.ts -n
```
Should find exactly 20 hits, of which 18 must be replaced.

### MITIGATION-2: RISK-2 — CombatBridgeScene closure capture pattern + delayedCall + scene.stop ordering

**Problem**: CombatBridgeScene uses scene.launch + sleep + wake. Risk-tester verified Phaser 3.88 source: `wake()` does NOT re-run create()/init() — instance fields and closures are preserved. But there are 6 caveats:
1. Scene z-order is fixed at launch (need bringToTop if visible — N/A for our controller scene)
2. Event listeners persist through sleep (be careful)
3. Queued-op timing: scene.launch/sleep/stop/wake all run on next update tick — must defer router push via `this.time.delayedCall(0, ...)`
4. Closure capture preferred over instance fields for robustness against future refactors
5. MUST `scene.stop("GameScene")` BEFORE `scene.wake()` — otherwise next encounter's launch hits the SceneManager.start() shutdown branch
6. GameScene retry button: not a problem because v2 never invokes showGameEndModal (early-return before it)

**Final CombatBridgeScene.handleCombatComplete pattern**:
```typescript
create() {
  const encounterDef = ENCOUNTERS[this.encounterId];  // captured in closure
  if (!encounterDef) { sceneRouter.pop(this); return; }

  const context = encounterBuilder.build(encounterDef);  // frozen

  this.showTransitionOverlay(() => {
    this.scene.launch("GameScene", {
      encounterContext: context,
      onCombatComplete: (raw: RawCombatResult) => {
        // encounterDef + context + this captured in closure (NOT instance fields)
        this.handleCombatComplete(raw, encounterDef, context);
      },
    } satisfies GameSceneInitData);
    this.scene.sleep();
  });
}

private handleCombatComplete(
  raw: RawCombatResult,
  encounterDef: EncounterDef,
  context: CombatContext,
): void {
  // RISK-2 caveat 5: MUST stop GameScene before wake
  this.scene.stop("GameScene");
  this.scene.wake();

  // RISK-2 caveat 3: defer router push via delayedCall(0) to ensure wake processed
  this.time.delayedCall(0, () => {
    // RISK-9 mitigation: flush pending saves before scene transition
    const appliedDelta = encounterBuilder.applyResult(raw, encounterDef);
    gameState.flush();

    const enriched: CombatResult = {
      ...raw,
      appliedDelta,
      xpGained: raw.victory ? encounterDef.rewards.xp : 0,
      goldGained: raw.victory ? encounterDef.rewards.gold : 0,
    };

    sceneRouter.replace(this, "PostCombatScene", {
      result: enriched,
      encounterContext: context,
      onVictoryNode: this.onVictoryNode,
      onDefeatNode: this.onDefeatNode,
      returnToDialogueId: this.returnToDialogueId,
    });
  });
}
```

`onVictoryNode`, `onDefeatNode`, `returnToDialogueId` ARE safe as instance fields (set in init, never need to survive cross-scene transitions). Only `encounterDef` and `context` use closure capture for robustness.

### MITIGATION-3: RISK-9 — gameState.flush() after applyResult

CombatBridgeScene.handleCombatComplete MUST call `gameState.flush()` immediately after `encounterBuilder.applyResult()` to bypass the 2-second autosave debounce. Reason: `beforeunload` is unreliable on mobile Telegram WebView (iOS WKWebView doesn't fire on swipe-away, Android WebView doesn't fire on activity destroy). Without explicit flush, players who quit Telegram immediately after victory could lose XP/gold/relationship rewards.

Pattern is shown in MITIGATION-2 above.

### MITIGATION-4: RISK-1 — 5 hardening criteria for #6

1. **Placement contract**: `if (this.emitV2CombatResult(true)) return;` MUST be inserted exactly between `hapticVictory()`/`hapticDefeat()` and `showGameEndModal(...)`. No statements between them.
2. **Post-patch invariant**: NO statements added AFTER `showGameEndModal(...)` in either showVictory or showDefeat. These methods must remain "showGameEndModal is the LAST statement" — otherwise v2 early-return would skip trailing statements.
3. **v1 regression test**: clean localStorage smoke verifying confetti, stats panel (7 rows), restart→IntroScene, no console errors, pixel-compare baseline screenshot.
4. **v2 callback contract**: CombatBridgeScene.handleCombatComplete (the consumer) MUST call `this.scene.stop("GameScene")` before any other GameScene interaction. Already in MITIGATION-2 spec.
5. **Pre-modal flag state**: When `emitV2CombatResult` fires, scene state is `gameOver = true` and `busy = true` (set immediately above). v2 callback consumer must tolerate this — do not attempt GameScene interaction beyond `scene.stop`.

**Self-documenting comment guardrail**: add this comment above showGameEndModal in both methods after the patch:
```typescript
// v2: do NOT add statements after showGameEndModal — v2 callback early-returns before this line
this.showGameEndModal("Victory!", "#44ff66", "Restart", true);
```

### MITIGATION-5: RISK-6 — CRIT-1..6 for ChainOverlay (#8)

- **CRIT-1**: `animateDamage(N chains)` MUST be O(1) wall-clock with respect to N. 4-chain duration within ±10% of 1-chain duration.
- **CRIT-2**: `animateBroken(N chains)` same O(1) requirement.
- **CRIT-3**: Pattern A (single tweenPromise with `targets: array`) OR Pattern B (Promise.all on per-item tweens) — serial `for await` is **explicitly forbidden**.
- **CRIT-4**: animateDamage total wall-clock ≤ 200ms (`flashDuration` yoyo'd = 100×2)
- **CRIT-5**: animateBroken total wall-clock ≤ 300ms (`abilityFadeOut`)
- **CRIT-6**: Reuse `ANIMATION_DURATIONS.flashDuration` and `ANIMATION_DURATIONS.abilityFadeOut` from `src/game/animations.ts` — no new magic-number durations.

**Idempotency requirement (ADD-2)**: animateDamage and animateBroken MUST be idempotent — calling them on already-destroyed chain sprites should no-op safely, not throw. Cover the case where a chain is broken in one cascade step and another cascade step still tries to animate it.

**Canonical references for #8 implementer**:
- `flashBoss` (GameScene.ts:1344-1358) — Pattern A: single tweenPromise with target array
- `defuseBombs` (GameScene.ts:2882-2896) — Pattern B: Promise.all on per-item tweens
- `animateBombsAppear` (GameScene.ts:2806-2842) — Pattern B variant

**Reviewer verification**: grep for `for (` / `forEach(` inside animateDamage/animateBroken. If found, verify NO `await` keyword inside the loop body on a `tweenPromise` / `this.tweens.add` call.

**Why these caps exist**: chain damage happens inside `resolveBoard`'s cascade loop. Longer animations stack across cascades (e.g., 3-cascade match × 200ms damage = 600ms dead time). Caps ensure combat pacing stays responsive.

### MITIGATION-6: RISK-8 — Type-only import hardening for #1, #3, #4

- **#1 (content/types.ts)**: MUST use `import type` for every import. NO runtime imports. NO imports from `../systems/*`, `../scenes/*`, `../ui/*`. Only allowed: `../core/types` (type-only) and `../../game/config` (type-only for BossAbilityType).
- **#3 (DialogueRunner.ts)**: MAY runtime-import `relationshipSystem` from `./RelationshipSystem` and `gameState` from `../core/GameState`. MUST use `import type` for content/types.
- **#4 (RelationshipSystem.ts)**: MUST NOT runtime-import from `../content/*`. MUST NOT import from `./DialogueRunner` in any form (type or runtime). Only allowed runtime imports: `../core/GameState`, `../core/EventBus`. Allowed type imports: `../core/types`.

**Verification command** (add to acceptance criteria for #1, #3, #4):
```bash
npx madge@8 --circular --extensions ts src/v2/
# Should print "No circular dependency found!" or only the pre-existing v1 config↔helpers cycle (out of scope)
```

**Optional hardening grep** for v2-isolation.md:
```bash
grep -rn --include="*.ts" -E '^import \{[^}]*\} from "\.\./content' src/v2/systems/
# Must return empty — runtime imports from content into systems are forbidden
```

### MITIGATION-7: RISK-3 — fromGrid factory must explicitly initialize chains

`Match3Board.fromGrid()` (lines 64-74) creates instances via `Object.create(Match3Board.prototype)`, NOT via constructor. **Class field initializers do NOT run on Object.create paths.** Therefore `private chains: Map<string, Chain> = new Map()` will leave `board.chains === undefined` for any board built via `fromGrid`. Calling any chain method on such a board will throw.

**REQUIRED**: explicitly add `board.chains = new Map();` to the `fromGrid` factory body (after existing `board.nextId = ...` and `board.rng = ...` lines).

**Grep verification command** (add to #2 acceptance):
```bash
grep -A 20 "static fromGrid" src/match3/Board.ts | grep "board\.chains = new Map"
# Should return 1 match
```

Already actioned in Task #2 description.

### config.ts refactor — simplified scope

Per Primary Architect: ONLY `getBossLayerHpArray` and `getBossLayerIndex` get refactored to accept optional override params with `GAME_PARAMS.boss.*` defaults (backward-compat for v1). **NO new exports** of `ABILITY_MAP` or `ABILITY_INDEX_MAP`. Conversion of `BossAbilityType[]` → `number[]` (for BossAbilityManager) happens via inline `Record<BossAbilityType, number>` literal in GameScene resetState.

### Tasks with applied mitigations (summary)

| Task | Mitigations |
|---|---|
| #1 | MITIGATION-6 (type-only imports + madge check) |
| #2 | MITIGATION-7 (fromGrid grep) — already actioned |
| #3 | MITIGATION-6 (type-only for content/types) |
| #4 | MITIGATION-6 (no runtime content/* imports) |
| #5 | config.ts simplified, ADD-4 backward-compat acceptance |
| #6 | MITIGATION-1 (3 getter methods, NOT snapshot field), MITIGATION-4 (RISK-1 hardening), MITIGATION-2 caveats (closure preference, retry button), inline ABILITY conversion |
| #8 | MITIGATION-5 (CRIT-1..6 + ADD-2 idempotency) |
| #11 | MITIGATION-2 (closure capture + delayedCall + scene.stop ordering), MITIGATION-3 (gameState.flush) |
| #13 | Stale CLAUDE.md cleanup (BoosterRow/BoosterCol/Ultimate references) |

### REVIEW MODE approval

After all mitigations applied to task descriptions, Primary Architect approves transition to REVIEW MODE and coder spawn.

---

## Summary

After 3 rounds of debate, all 3 architects converged on the following architecture for v2 Phase 1A.

## 1. v1↔v2 boundary: callback closure pattern

**Decision:** ZERO runtime imports from `src/v2/*` in `src/scenes/*`. Only `import type` is allowed (e.g., `import type { CombatContext } from "../v2/content/types"`).

**Cross-scene communication uses callback closures**, NOT typed eventBus:
- `CombatContext.onComplete?: (result: CombatResult) => void`
- The callback is **injected** by `CombatBridgeScene` after `encounterBuilder.build()` returns the base context — `CombatBridgeScene` wraps the frozen context with `{ ...baseContext, onComplete: (r) => this.handleCombatComplete(r) }`.
- `GameScene` calls `this.encounterContext.onComplete?.(result)` in `showVictory`/`showDefeat` — it has no knowledge of `encounterBuilder`, `eventBus`, or any v2 runtime.

**Why this matters:**
- v2-isolation rule preserved at the strictest level (zero runtime coupling).
- No leak of v2 system imports into v1 GameScene.
- No need for cleanup of `game.events` listeners across scene transitions.
- Closure is single-consumer and explicit — easier to reason about.

## 2. EncounterBuilder.applyResult lives in CombatBridgeScene flow

**Decision:** GameScene **never** imports `encounterBuilder`. Reward application (XP, gold, relationship delta) happens in `CombatBridgeScene.handleCombatComplete()`:

```typescript
private handleCombatComplete(result: CombatResult) {
  const enc = ENCOUNTERS[result.encounterId];
  // 1. Apply rewards via EncounterBuilder.applyResult
  const appliedDelta = encounterBuilder.applyResult(result, enc);
  // 2. Enrich result with delta + xp + gold
  const enriched = { ...result, appliedDelta, xpGained: enc.rewards.xp, goldGained: enc.rewards.gold };
  // 3. Stop GameScene + transition to PostCombatScene
  this.scene.stop("GameScene");
  sceneRouter.replace(this, "PostCombatScene", { result: enriched, encounterContext: this.context });
}
```

PostCombatScene **does NOT apply rewards** — it only displays the enriched result.

## 3. Layered HP system: derived field in CombatContext

**Decision:** `EncounterDef.bossStats` does **NOT** contain `hpMax` directly. It contains:
- `layerCount: number`
- `baseHpPerLayer: number`
- `layerMultipliers: number[]`
- `physAttack: number`
- `magAttack?: number`

`EncounterBuilder.build()` computes `derived: { bossHpMax, bossLayerHpArray }` from these inputs:

```typescript
const layerHpArray: number[] = [];
for (let i = 0; i < layerCount; i++) {
  const m = i < layerMultipliers.length ? layerMultipliers[i] : 1.0;
  layerHpArray.push(Math.ceil(baseHpPerLayer * m));
}
const bossHpMax = layerHpArray.reduce((s, hp) => s + hp, 0);
```

**Why:** v1's `getBossLayerHpArray()` and `getBossLayerIndex()` use the same multilayer math. v2 mirrors it via the `derived` field instead of mutating globals or duplicating logic. GameScene reads `this.encounterContext?.derived.bossLayerHpArray ?? getBossLayerHpArray()` in three places (constants 360, 476, 1251 by line number).

## 4. bossPattern: typed strings, not magic indices

**Decision:** `EncounterDef.bossPattern` is `BossAbilityType[]` (typed strings like `"attack" | "shield" | "powerStrike" | "bombs"`), NOT `number[]`.

`config.ts` exports a new constant:
```typescript
export const ABILITY_INDEX_MAP: Record<BossAbilityType, number> = {
  attack: 1,
  bombs: 2,
  shield: 3,
  powerStrike: 4,
};
```

Conversion happens in EncounterBuilder + GameScene's resetState:
```typescript
const patternOverride = this.encounterContext
  ? this.encounterContext.encounterDef.bossPattern.map(name => ABILITY_INDEX_MAP[name])
  : undefined;
this.bossAbilityManager = new BossAbilityManager(patternOverride);
```

`config.ts` also needs to **export** `ABILITY_MAP` (currently file-private const at line 232) for use by GameScene patches.

## 5. BossAbilityManager accepts patternOverride

**Decision:** `src/game/BossAbility.ts` `BossAbilityManager` constructor signature changes:
```typescript
constructor(patternOverride?: BossAbilityType[]) {
  this.refillPool(patternOverride);
}
```
`refillPool` accepts the same optional parameter. Backward compat: if `patternOverride === undefined`, falls back to `GAME_PARAMS.bossPattern` reading via existing path. v1 callers pass nothing → identical behavior.

This is a **cross-zone change** that touches `src/game/BossAbility.ts`. Architect-systems explicitly approved it as the cleanest way to inject v2 patterns without mutating globals. Tagged with `// v2:` comment.

## 6. DialogueRunner delegates to RelationshipSystem (no duplicate logic)

**Decision:** Task #3 (DialogueRunner) is now **blocked by both #1 AND #4** (was: only #1).

DialogueRunner imports `relationshipSystem` from `./RelationshipSystem` and calls `relationshipSystem.applyDelta(characterId, delta)` instead of duplicating clamp/affinity computation. This eliminates two sources of truth.

Inside `DialogueRunner.selectChoiceById(id)`:
```typescript
if (this.graph.characterId) {
  relationshipSystem.applyDelta(this.graph.characterId, choice.delta);
}
```

## 7. selectChoiceById, not selectChoice(index)

**Decision:** `DialogueChoice.id` is **required** (not optional). DialogueRunner exposes `selectChoiceById(id: string)` instead of `selectChoice(index: number)`. This makes content authoring future-proof — choice indices can be reordered without breaking save state.

DialogueScene passes `choice.id` from button click handlers.

## 8. DialogueRunner constructor accepts startNodeId

**Decision:** `new DialogueRunner(graph, startNodeId?)`. If `startNodeId` is provided, runner starts there instead of `graph.startNode`. This enables PostCombatScene → DialogueScene resume on the post-battle node without needing a separate `jumpToNode()` API.

DialogueScene `init(data: { dialogueId, startNodeId? })` passes `startNodeId` through.

## 9. Effective stats snapshot in GameScene (18 sites)

**Decision:** GameScene gets an **effective stats snapshot field**, populated in `resetState`:
```typescript
private effective = {
  playerHpMax: GAME_PARAMS.player.hpMax,
  playerManaMax: GAME_PARAMS.player.manaMax,
  bossHpMax: GAME_PARAMS.boss.hpMax,
};
```

In resetState (gated by `if (this.encounterContext)`):
```typescript
this.effective.playerHpMax = this.encounterContext?.playerStats.hpMax ?? GAME_PARAMS.player.hpMax;
this.effective.playerManaMax = this.encounterContext?.playerStats.manaMax ?? GAME_PARAMS.player.manaMax;
this.effective.bossHpMax = this.encounterContext?.derived.bossHpMax ?? GAME_PARAMS.boss.hpMax;
```

**ALL 18 sites that currently read `GAME_PARAMS.player.hpMax`, `GAME_PARAMS.player.manaMax`, or `GAME_PARAMS.boss.hpMax` for runtime calculations (HUD updates, healing clamps, damage ratios) MUST be replaced with `this.effective.*`.** This is a significant scope expansion vs the original task #6 description.

Approximate line numbers (subject to drift): 994, 1241, 1265, 1278, 1283, 1296, 1302, 1313, 1667-1669, 1699, 1735, 2678-2680, 2796.

Each replacement gets its own `// v2: effective stats snapshot — see resetState` comment.

## 10. effectiveBossLayer* getters for layered HP queries

**Decision:** GameScene also gets:
```typescript
private effectiveBossLayerCount(): number
private effectiveBossLayerHpArray(): readonly number[]
private effectiveBossLayerIndex(currentHp: number): number  // computes locally based on encounterContext.derived
```

These replace direct reads of `getBossLayerCount()`, `getBossLayerHpArray()`, `getBossLayerIndex(hp)` at lines 360, 476, 1251.

## 11. PerkManager interaction with v2 encounters

**Decision:** Phase 1A uses `effectiveBossLayerIndex()` (which respects encounterContext) so PerkManager's existing `getBossLayerIndex(bossHp)` calls naturally route to the v2-aware version. Perks still trigger on v2 layer transitions, and that's intentional — we want the player to be able to choose perks in v2 fights.

(Phase 1B may add a flag to disable perks for specific encounters if narratively needed.)

## 12. TUTORIAL_BOARD branching in resetState

**Decision:** v2 encounters use **random board** (`new Match3Board(BOARD_WIDTH, BOARD_HEIGHT)`), v1 uses tutorial board (`Match3Board.fromGrid(BOARD_WIDTH, BOARD_HEIGHT, TUTORIAL_BOARD)`):

```typescript
// v2: random board for v2 encounters (NOT TUTORIAL_BOARD), tutorial for v1
if (this.encounterContext) {
  this.board = new Match3Board(BOARD_WIDTH, BOARD_HEIGHT);
} else {
  this.board = Match3Board.fromGrid(BOARD_WIDTH, BOARD_HEIGHT, TUTORIAL_BOARD);
}

// v2: skip tutorial flow when launched from CombatBridgeScene
this.tutorialActive = !this.encounterContext;
```

## 13. Match3Board chain methods: snapshots, not references

**Decision:** `getDamagedChains()` returns **snapshots** (cloned objects), NOT references to the live Map entries:
```typescript
getDamagedChains(clearedPositions: Position[]): Chain[] {
  // ...
  damaged.push({ ...chain });  // clone
  // ...
}
```

`damageChains(snapshots)` uses the snapshot positions to look up the **real** chain in the map and mutate it:
```typescript
damageChains(snapshots: Chain[]): { broken: Chain[]; remaining: Chain[] } {
  const broken: Chain[] = [];
  const remaining: Chain[] = [];
  for (const snap of snapshots) {
    const real = this.chains.get(this.chainKey(snap.pos));
    if (!real) continue;
    real.hp -= 1;
    if (real.hp <= 0) {
      this.chains.delete(this.chainKey(snap.pos));
      broken.push({ ...real });
    } else {
      remaining.push({ ...real });
    }
  }
  return { broken, remaining };
}
```

**Why:** GameScene has an `await chainOverlay.animateDamage(damaged)` call between `getDamagedChains` and `damageChains`. If we returned references, the snapshots could be mutated mid-animation by other game logic. Snapshots are safe.

`Chain.variant` is **required** in board state (default applied at placement time). `ChainPlacement.variant` remains optional in content; the default `"iron"` is applied in GameScene's `placeChains` mapping step.

## 14. ChainOverlay: manager class with direct method calls

**Decision:** `ChainOverlay` is **NOT** a Container that subscribes to events. It's a **manager class** that holds a collection of scene-direct rectangles + texts. GameScene owns a `private chainOverlay?: ChainOverlay` reference and calls methods directly:

```typescript
this.chainOverlay = new ChainOverlay(this, boardOriginX, boardOriginY, cellSize);
this.chainOverlay.setChains(this.board.getAllChains());

// Later in resolveBoard:
await this.chainOverlay.animateDamage(damaged);
const result = this.board.damageChains(damaged);
await this.chainOverlay.animateBroken(result.broken);
```

**Methods:**
- `setChains(chains: Chain[]): void` — initial render
- `animateDamage(damaged: Chain[]): Promise<void>` — flash damaged chains
- `animateBroken(broken: Chain[]): Promise<void>` — particles + fade out broken chains
- `clear(): void`

No event subscriptions. No game.events. Purely direct calls.

**This requires the GameScene patch (task #6) to type-only-import `ChainOverlay` from `../v2/ui/ChainOverlay`.** GameScene has `private chainOverlay?: ChainOverlay` field but only instantiates it when `this.encounterContext` is set. This is technically a v2 type leak into v1, but it's TYPE-ONLY (`import type`), so still respects the strict-isolation rule.

## 15. LocationScene uses declarative dialogue selection

**Decision:** `LocationHotspot.dialogues: HotspotDialogueOption[]` is a **declarative array** (NOT a `dialogueResolver` callback function). LocationScene picks the first matching option:

```typescript
interface HotspotDialogueOption {
  dialogueId: string;
  condition?: ConditionExpr;  // ConditionExpr from #1
}

// LocationScene:
const matchingDialogue = hotspot.dialogues.find(opt =>
  !opt.condition || conditionEval(opt.condition, save, characterId)
);
if (matchingDialogue) sceneRouter.push(this, "DialogueScene", { dialogueId: matchingDialogue.dialogueId });
```

For Lilana in Atrium:
```typescript
dialogues: [
  { dialogueId: "lilana-act4", condition: { flag: "lilana:act2:done", flagEquals: true } },
  { dialogueId: "lilana-act2", condition: { flag: "lilana:act1:done", flagEquals: true } },
  { dialogueId: "lilana-act1" },  // default fallback
]
```

**Why declarative:** future Phase 3 AI integration can serialize hotspot dialogue options to JSON without losing the gating logic (closures don't serialize).

**conditionEval helper:** extracted to `src/v2/systems/conditionEval.ts` (pure function). Both `DialogueRunner.evaluateCondition()` and `LocationScene` call into the same helper.

## 16. EffectExpr.type does NOT include "unlockAct"

**Decision:** Removed `unlockAct` from EffectExpr — use `setFlag` directly:
```typescript
{ type: "setFlag", key: "lilana:act1:done", value: true }
```

This simplifies the effect schema and removes a custom semantic that nothing else relied on.

## 17. relationshipThresholds.hostileViaCynicism (positive number)

**Decision:** Renamed `hostile: -20` (negative, semantically unclear) to `hostileViaCynicism: 60` (positive number, threshold for cynicism axis to flip relationship to hostile). All three thresholds are now positive:
```typescript
relationshipThresholds: {
  friendly: 30,        // empathy + dominance >= 30
  romance: 60,         // empathy + dominance >= 60 AND cynicism < some cap
  hostileViaCynicism: 60,  // cynicism >= 60 → hostile relationship
}
```

## 18. SaveData rename: PlayerSave.stats.hp → hpMax (mental note)

The existing `SaveData.player.stats` field uses `hp` and `mp`, not `hpMax`/`manaMax`. EncounterBuilder reads them with the old names but exposes them in `PlayerCombatStats` with the explicit `hpMax`/`manaMax` names:
```typescript
const playerStats: PlayerCombatStats = {
  hpMax: save.player.stats.hp,        // rename: hp → hpMax in context
  manaMax: save.player.stats.mp,      // rename: mp → manaMax in context
  physAttack: save.player.stats.physAttack,
  magAttack: save.player.stats.magAttack,
  crit: save.player.stats.crit,
};
```

**No SaveData schema change.** The rename is purely at the CombatContext API level for clarity.

## 19. Validation in EncounterBuilder.build()

**Decision:** EncounterBuilder.build() throws on invalid encounter definitions:
- `layerCount > 0`
- `baseHpPerLayer > 0`
- `chainBlockedHpRatio ∈ [0, 1]`

This catches bad content data at encounter start, not deep in GameScene update loops.

## 20. Risk Analysis (next step for Lead)

After applying TaskUpdates and designating a Primary Architect, Lead should run risk analysis with the Primary Architect to identify:
- v1 regression risks (especially around showGameEndModal flow change)
- Phaser scene `init` vs `create` data flow on lazy-registered scenes
- BossAbilityManager backward compat with no-arg construction
- ChainOverlay performance with 8+ chains and damage animation
- Save data write race conditions during PostCombatScene rewards application

## Dependency Updates

- **Task #3 (DialogueRunner)** is now `blockedBy: ["1", "4"]` (was `["1"]`). DialogueRunner imports relationshipSystem.

All other dependencies remain as previously defined in TaskUpdate calls.

## Verification Checks Owned by Each Architect

(See Phase 3 verification plan — these will be merged into VERIFICATION_PLAN.md)

**architect-systems:**
- CI: `npm run build` exit 0, strict TS, docs/ rebuilt
- Spec: `// v2:` count ≥10 in GameScene
- Spec: zero runtime v2 imports in src/scenes/*
- Spec: Match3Board git diff shows only additions
- v1 smoke test (manual)

**architect-backend:**
- Spec: all 25 v2 files exist
- Spec: lilana CharacterDef shape correct
- Spec: 3 dialogues each have 5-10 nodes, 2+ choice points, all references resolve
- Spec: lilana-act4 encounter has 8 chains, layered bossStats, typed bossPattern
- Spec: SaveData schema unchanged (version=1)

**architect-frontend:**
- Browser: full v2 happy path (HubScene → ... → PostCombat → return)
- Browser: chains visible and animate correctly in battle
- Browser: relationship meter shows delta in PostCombat
- Browser: tap-to-advance in dialogues respects busy state
- Browser: 18-stat HUD updates correct in v2 mode

---

**This document is the agreement between architect-frontend, architect-backend, and architect-systems after 3 rounds of debate. Coders MUST follow it. Any deviation requires escalation to Primary Architect (designated by Lead in next step).**
