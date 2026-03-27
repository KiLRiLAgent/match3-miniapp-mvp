# Verification Plan
## Feature: Visual Polish v2

## Build & Types
- [ ] `npm run build` passes

## Spec Checks
- [ ] Meter.ts uses fillRect (not fillRoundedRect) for drawFill and drawDelta
- [ ] Meter.ts has geometry mask setup in constructor
- [ ] animations.ts FLYING_TILE.startScale >= 1.4
- [ ] animations.ts FLYING_TILE.endScale >= 0.9
- [ ] SkillButton.ts contains mana tile image reference (not "МР" text)
- [ ] GameScene.ts player HP bar has trailingDelta: true
- [ ] GameScene.ts has restoreBossArtFromDamage call after skill use
- [ ] src/ui/LayeredMeter.ts exists
- [ ] config.ts contains BOSS_LAYER_COUNT and BOSS_HP_PER_LAYER
- [ ] .conventions/ updated

## Human Checks
- [ ] Match-4/5 glow noticeably brighter
- [ ] Flying tiles visibly larger
- [ ] Bar fill has straight right edge (not rounded)
- [ ] Boss damage art restores after powerStrike skill
- [ ] Player HP bar shows trailing delta on damage
- [ ] Flash covers entire colored portion of bar
- [ ] Mana icon visible on skill buttons instead of "МР"
- [ ] Slash appears at board center on boss attacks
- [ ] Multi-layer HP bar: 10 layers, red/yellow, counter visible
- [ ] Layer transitions smooth when current layer depletes
