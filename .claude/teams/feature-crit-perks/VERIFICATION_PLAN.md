# Verification Plan
## Feature: CRIT system, Perks, Visual Polish v3

## Build & Types
- [ ] `npm run build` passes

## Spec Checks
- [ ] Board.ts computeClearOutcome returns multiplier field
- [ ] Board.ts does NOT create BoosterRow/BoosterCol/Ultimate tiles
- [ ] animations.ts FLYING_TILE.startScale >= 1.5
- [ ] Meter.ts uses per-corner radius for partial fills
- [ ] LayeredMeter.ts counterText positioned inside bar (not outside)
- [ ] src/ui/PerkCard.ts exists
- [ ] src/game/PerkManager.ts exists
- [ ] config.ts contains CRIT_MULTIPLIERS
- [ ] config.ts contains PERK_MAX_LEVEL
- [ ] SettingsPanel.ts contains HP per layer setting

## Human Checks
- [ ] Match 4 shows "CRIT! x2" text and doubles effects
- [ ] Match 5+ shows "MEGA CRIT! x3" text and triples effects
- [ ] No boosters created on match 4/5
- [ ] Flying tiles visibly larger
- [ ] Player HP/Mana bars have straight right edges
- [ ] Boss HP counter "x6" visible inside bar
- [ ] Layer transition triggers perk selection
- [ ] 3 perk cards shown with stars and descriptions
- [ ] Selecting perk upgrades the skill
- [ ] Red vignette appears at low HP, disappears on heal
- [ ] Settings panel scrolls and has layer config
