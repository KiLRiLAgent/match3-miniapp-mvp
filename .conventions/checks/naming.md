# Convention: Naming Rules

## Methods and Functions

- **camelCase** for all methods and functions
- Async methods that animate: `animate*` prefix (animateSwap, animateClear, animateCollapse)
- Private draw methods: `draw*` prefix (drawFill, drawDelta, drawHighlight)
- Event handlers: `handle*` prefix (handleTap, handleSwap, handleCombatComplete)
- Boolean getters: `is*` or `can*` or `has*` prefix (canPlayerAct, isChained, hasActiveChains)
- Builder methods: `build*` prefix (buildHud, buildBoard, buildSkills)
- Effective stat getters (v2 feature gates): `getEffective*` prefix (getEffectivePlayerHpMax, getEffectiveBossHpMax)
- v2 callback emitters in v1 modules: `emit*` prefix (emitV2CombatResult)
- Setter/applier methods on systems: `apply*` prefix (applyDelta, applyResult, applyDamageToPlayer)

## v2 Event/callback naming

- v2 callbacks that travel via scene init data: `on*` prefix and `Complete` suffix when terminal
  (`onCombatComplete: (raw: RawCombatResult) => void`, `onVictoryNode: string`, `onDefeatNode: string`)
- Singular event names: `combat:complete`, `dialogue:choice`, `relationship:changed`
  (colon-separated namespace:event, lowercase, no plurals)
- v2 SaveData mutation entry points are SOLE-source — name with `applyResult` not `handleResult`

## Constants

- **UPPER_SNAKE_CASE** for module-level constants and config objects
- Examples: `ANIMATION_DURATIONS`, `VISUAL_EFFECTS`, `FLYING_TILE`, `CELL_SIZE`, `TILE_DISPLAY_SCALE`
- Component-local timing constants also UPPER_SNAKE: `FLASH_DURATION`, `DELTA_DRAIN_DURATION`

## Types and Interfaces

- **PascalCase** for types, interfaces, enums, and classes
- Examples: `TileKind`, `BaseTileKind`, `MeterOptions`, `FlyTarget`, `BossAbilityType`
- Suffix with purpose: `*Options` for config interfaces, `*State` for state types

## Properties

- **camelCase** for instance properties
- Private properties: no underscore prefix (TypeScript `private` keyword is sufficient)
- Boolean properties: descriptive names (flashing, deltaDraining, gameOver, busy)

## Files

- **PascalCase** for scene and component files: `GameScene.ts`, `BootScene.ts`, `Meter.ts`, `FlyingTile.ts`
- **camelCase** for config and utility files: `config.ts`, `animations.ts`, `assets.ts`, `helpers.ts`
- **camelCase** for type definition files: `types.ts`

## Enums

- **PascalCase** for enum name, **PascalCase** for members:

```typescript
enum TileKind {
  Sword = "sword",
  Star = "star",
  Mana = "mana",
  Heal = "heal",
  Bomb = "bomb",
}
```
