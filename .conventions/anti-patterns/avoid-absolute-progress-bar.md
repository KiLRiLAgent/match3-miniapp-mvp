# Anti-Pattern: Absolute-baseline progress bars for "to next level" UI

A progress bar that displays "X / Y XP до уровня N+1" must measure progress
**within the current level**, not against absolute zero. Computing the fill
ratio as `player.xp / xpToNextLevel` is wrong because `player.xp` is the
*cumulative* XP across all levels — at level 5 the bar will look almost full
even if the player just leveled up.

## Symptom

XP bar shows ~95% full immediately after a level-up because the cumulative
XP from prior levels dominates the ratio. The bar appears "stuck near MAX"
no matter how much fresh XP is earned.

## Wrong

```typescript
// WRONG — measures cumulative XP against the next-level threshold
const xpToNext = progressionSystem.getXpToNextLevel();
const fillRatio = player.xp / (player.xp + xpToNext); // wrong baseline
const label = `${player.xp} / ${player.xp + xpToNext} XP до ${level + 1}`;
```

The numerator is "all XP I've ever earned" but the denominator is "the
threshold for the next level". They are not in the same coordinate space.

## Right

Subtract the level-entry XP (the cumulative threshold the player crossed
to reach the current level) from `player.xp` to get within-level progress,
then divide by the level span:

```typescript
// CORRECT — measures progress *within* the current level
const xpToNext = progressionSystem.getXpToNextLevel();
let fillRatio = 1;
let label = "МАКС";
if (xpToNext > 0) {
  const levelEntryXp = progressionSystem.getLevelEntryXp();
  const levelProgress = Math.max(0, player.xp - levelEntryXp);
  const levelSpan = levelProgress + xpToNext;
  fillRatio = levelSpan > 0
    ? Math.max(0, Math.min(1, levelProgress / levelSpan))
    : 0;
  label = `${levelProgress} / ${levelSpan} XP до ${level + 1} уровня`;
}
```

`progressionSystem.getLevelEntryXp()` returns `XP_TABLE[level - 1]` for any
level above 1 (and 0 for level 1), giving the cumulative threshold the
player needed to enter the current level. The within-level progress is
`player.xp - levelEntryXp`, and the level span is that progress plus the
remaining `xpToNext`.

## Rule of thumb

Any "X / Y to next milestone" bar must use the milestone *entry baseline*,
not absolute zero. This applies to XP bars, sublevel-style currencies,
streak meters, anything where the user mental model is "how far through
this stage am I."

## Reference

- `src/v2/systems/ProgressionSystem.ts` → `getLevelEntryXp()` helper (uses
  `getXpThreshold(level)` which works for any level, not just the static table)
- `src/v2/scenes/PlayerStatsScene.ts` → `renderXpBar()` correct usage
- Phase 1B Task #7 drive-by fix (commit 43ea4e8 — original implementation
  measured against absolute zero, was caught during review)
