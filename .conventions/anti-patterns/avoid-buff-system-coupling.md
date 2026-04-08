# Anti-pattern: BuffSystem coupling to non-arena code paths

**Severity**: CRITICAL — silently changes game balance for story fights

## What's wrong

Phase 2A's BuffSystem applies run-only buffs to player stats during arena combat. The system MUST early-return when there is no active arena run, so story fights (Lilana act 4 etc.) see ZERO behavior change.

If BuffSystem starts applying "default buffs" from settings, "permanent buffs" from progression, or any other source independent of `save.arena.activeRun`, story fights will silently see different stats than they did before — breaking the contract that Phase 2A only adds new optional content without touching existing flows.

## WRONG

```ts
// src/v2/systems/BuffSystem.ts — DO NOT WRITE THIS
class BuffSystem {
  applyToStats(base: PlayerStats): PlayerStats {
    const save = gameState.get();
    let result = { ...base };

    // ❌ "Permanent buffs" applied to ALL fights, not just arena
    for (const buff of save.permanentBuffs ?? []) {
      result = this.applyOne(buff, result);
    }

    // ❌ Or: progression-derived passive bonuses
    const passive = progressionSystem.getPassiveBuffs?.();
    if (passive) result = this.applyOne(passive, result);

    if (save.arena.activeRun) {
      for (const buff of save.arena.activeRun.activeBuffs) {
        result = this.applyOne(buff, result);
      }
    }
    return result;
  }
}
```

This breaks decoupling because:

- Story fights now depend on BuffSystem state
- Adding a new "permanent buff" later changes Lilana fight balance silently
- Story fight regression tests would need to mock BuffSystem
- Phase 1A/1B/1C behavior is no longer reproducible without simulating the full progression chain

## RIGHT

```ts
// src/v2/systems/BuffSystem.ts
class BuffSystem {
  applyToStats(base: PlayerStats): PlayerStats {
    const save = gameState.get();
    if (!save.arena.activeRun) return base;  // ← THE rule

    const result: PlayerStats = { ...base };
    for (const activeBuff of save.arena.activeRun.activeBuffs) {
      const def = BUFFS[activeBuff.buffDefId];
      if (!def) continue;
      this.applySingleBuff(def.effectType, def.value, result, activeBuff.sourceFightFloor);
    }
    return result;
  }
}
```

The early return on `activeRun === null` is the SINGLE guarantee that protects all non-arena fights. It is easy to reason about, easy to test, and impossible to break without removing the line.

## How to verify

After any change to BuffSystem or EncounterBuilder buff hook:

1. **Manual smoke test**: play Lilana act 4 with no active arena run. Boss HP, damage numbers, ability cooldowns, and player HP/MP must be IDENTICAL to pre-Phase-2A baseline.
2. **Code grep**: `grep "save.arena.activeRun" src/v2/systems/BuffSystem.ts` must return at least one early-return guard at the top of every method that returns stat data.
3. **Static check**: BuffSystem must NEVER read from `save.permanentBuffs`, `save.progression.passive`, or any field outside `save.arena.activeRun`.

## Why this rule exists

Phase 2A introduces buffs as a NEW system layered ON TOP of existing combat. The brief explicitly says "Phase 2A excludes special item effects, set bonuses, AI chat, etc." — meaning Phase 2A must be PURELY ADDITIVE to existing systems. Story fights existed before BuffSystem and must keep working unchanged.

If a future phase wants permanent buffs from progression, that's a SEPARATE system (e.g., ProgressionSystem.computeEffectiveStats already adds equipment bonuses). Mixing run-only and permanent buffs in one system invites silent behavior drift.

## Reference

- `src/v2/systems/BuffSystem.ts` — the canonical implementation
- `src/v2/systems/EncounterBuilder.ts` — the single hook line
- `.conventions/gold-standards/buff-system.ts` — full pattern documentation
- `.claude/teams/feature-v2-phase-2a-arena/DECISIONS.md` R2
