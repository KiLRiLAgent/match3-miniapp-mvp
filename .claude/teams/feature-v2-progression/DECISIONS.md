# Phase 1B — Architectural Decisions

Living log of approved deviations and patterns established during the
"Progression, Gallery, Bug Fixes" feature. Tech lead maintains this file;
coders read it before starting a task in the same area.

---

## DECISION-1: ProgressionSystem ↔ InventorySystem coupling via setter injection

**Date:** 2026-04-08
**Tasks affected:** #4, #5, #6
**Author:** tech-lead
**Status:** Approved (in commit `3d4b8a4`)

### Context

`ProgressionSystem.computeEffectiveStats()` needs equipment-derived stat
bonuses from `InventorySystem.computeAggregateStats()`. The two systems are
authored in parallel (Wave 2: tasks #4 and #5) — at the moment task #4 lands,
`src/v2/systems/InventorySystem.ts` does not yet exist on `dev-v2`.

### Decision

ProgressionSystem accepts an optional `InventoryStatsProvider` callback via a
public `setInventoryProvider(provider)` setter, instead of statically importing
`inventorySystem`. The provider is wired exactly once at boot time:

```ts
// src/v2/index.ts (registerV2Scenes, after both modules are loaded)
import { progressionSystem } from "./systems/ProgressionSystem";
import { inventorySystem } from "./systems/InventorySystem";

progressionSystem.setInventoryProvider(() => inventorySystem.computeAggregateStats());
```

When no provider is registered (tests, Phase 1B before #6 integration),
`computeEffectiveStats()` falls back to `?? {}` and returns base stats only.

### Rationale

1. **Parallel-task safety.** Direct import would have made #4 unbuildable on
   the branch until #5 lands. Setter-injection lets each task ship
   independently.
2. **Dependency direction stays one-way.** ProgressionSystem and
   InventorySystem are siblings — neither owns the other. A static edge in
   either direction risks circular imports during future refactors.
3. **Test ergonomics.** Stubbing `setInventoryProvider(() => stubStats)` is
   simpler than mocking a singleton import.

### Wiring location for task #6

The provider MUST be wired in `src/v2/index.ts` inside (or adjacent to)
`registerV2Scenes()`. This is the single boot point for v2 — runs exactly once
when BootScene lazy-loads `../v2`, before any scene calls
`computeEffectiveStats()`. Wiring inside `EncounterBuilder.applyResult()` is
also acceptable as a fallback, but the boot location is preferred because it
avoids re-registering on every encounter.

### Verification

- `grep -r "from.*InventorySystem" src/v2/systems/ProgressionSystem.ts` → empty
- After #6: `progressionSystem.setInventoryProvider(...)` called exactly once
  in `src/v2/index.ts`

---

## DECISION-2: PlayerStats field naming — keep `hp`/`mp`, NOT `hpMax`/`manaMax`

**Date:** 2026-04-08
**Tasks affected:** #3, #4
**Status:** Approved (consistent with Phase 1A DECISIONS section 18)

### Context

Phase 1B task specs (from team-lead's brief) referenced `hpMax` / `manaMax`
field names on `SaveData.PlayerStats`. The actual codebase uses the legacy
short names `hp` / `mp` per Phase 1A DECISIONS section 18.

### Decision

Do NOT rename `PlayerStats.hp`/`PlayerStats.mp`. The split is intentional:

- `SaveData.PlayerStats` (in `src/v2/core/types.ts`) uses **`hp`/`mp`** —
  legacy short names, persisted in localStorage. Renaming would require a
  migration and would break existing v2 saves.
- `CombatContext.PlayerCombatStats` (in `src/v2/content/types.ts`) uses
  **`hpMax`/`manaMax`** — unambiguous projection used at the v2↔GameScene
  combat bridge.

`EncounterBuilder.build()` performs the rename at projection time:
```ts
playerStats: {
  hpMax: save.player.stats.hp,
  manaMax: save.player.stats.mp,
  ...
}
```

`EffectivePlayerStats` (returned by `progressionSystem.computeEffectiveStats`)
also uses `hp`/`mp` to match base PlayerStats — it's a UI-side projection, not
a combat-side projection.

### Verification

- `grep "hpMax\|manaMax" src/v2/core/types.ts` → no matches
- `grep "hp:\|mp:" src/v2/content/types.ts` (in EffectivePlayerStats) → matches

---

## DECISION-3: `EncounterBuilder.build()` must NOT call `computeEffectiveStats()`

**Date:** 2026-04-08
**Tasks affected:** #6
**Status:** Approved (RISK-3 mitigation)

### Context

Task #6 integrates ProgressionSystem and InventorySystem into the combat
pipeline. There's a temptation to "improve" `EncounterBuilder.build()` by
replacing the direct `save.player.stats` read with
`progressionSystem.computeEffectiveStats()`.

### Decision

`EncounterBuilder.build()` MUST continue to read `save.player.stats` directly
when projecting `playerStats: PlayerCombatStats`. Do not introduce a runtime
dependency from EncounterBuilder to ProgressionSystem or InventorySystem.

Equipment bonuses ARE applied — but through a different path: when the player
opens PlayerStatsScene or HubScene, those scenes call
`progressionSystem.computeEffectiveStats()` for display. The combat side reads
the live SaveData stats which already include level-up growth from the prior
fight's `applyXpGain` call.

### Rationale

1. **Avoids circular dependency risk.** EncounterBuilder is already imported by
   CombatBridgeScene. Adding edges to ProgressionSystem/InventorySystem widens
   the graph unnecessarily.
2. **Single source of truth for combat input.** Combat reads SaveData. UI
   reads computed projections. Mixing them creates two paths for "what stats
   does the player have right now" and inevitable divergence bugs.
3. **Equipment bonuses are NOT yet folded into SaveData.player.stats.** They
   live as item instances in `inventory.equipped`. If `build()` started
   calling `computeEffectiveStats()`, the projection would pick up bonuses
   that are NOT reflected in the persisted base — and any subsequent
   `applyLevelUpStats` call would compound on top of already-bonused values.

For Phase 2, if equipment bonuses need to affect combat directly, the correct
fix is to pre-compute the effective stats once at combat start and pass them
in via `CombatContext` — NOT to mutate the persisted base stats.

### Verification

- After #6: `EncounterBuilder.build()` still has `save.player.stats.hp` (etc.)
- `grep "computeEffectiveStats\|inventoryProvider" src/v2/systems/EncounterBuilder.ts` → no matches

---

## DECISION-4: XP application must flow through `progressionSystem.applyXpGain` (no double-credit)

**Date:** 2026-04-08
**Tasks affected:** #6
**Status:** Approved (RISK-2 mitigation, CRITICAL)

### Context

The current `EncounterBuilder.applyResult()` does
`save.player.xp += encounterDef.rewards.xp` directly. Task #6 introduces
`progressionSystem.applyXpGain()`, which ALSO mutates `save.player.xp`. If both
paths run on the same victory, the player gets double XP.

### Decision

When task #6 lands, the direct `save.player.xp +=` line in
`EncounterBuilder.applyResult()` MUST be deleted. `applyXpGain` becomes the
SOLE writer of `save.player.xp`.

### Verification

After #6 commit:
```
grep "save.player.xp\s*+=" src/v2/systems/EncounterBuilder.ts
# must return zero matches
```
