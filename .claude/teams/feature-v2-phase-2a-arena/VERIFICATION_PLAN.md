# Verification Plan
## Feature: v2 Phase 2A — Arena (Archero-mode) + Items expansion + Shop

Compiled from DECISIONS.md §5 + brief Review Checklist.

## Build & Types
- [ ] `npm run build` passes (tsc strict + vite production)
- [ ] `npx tsc --noEmit` returns 0 errors
- [ ] v1 main chunk ≤ 135 KB (raw, in `docs/assets/`)
- [ ] v2 chunk ≤ 100 KB (Round 4 amendment, raw)

## Spec Checks

### File existence + exports
- [ ] `src/v2/systems/ArenaSystem.ts` exists, exports `arenaSystem` singleton
- [ ] `src/v2/systems/BuffSystem.ts` exists, exports `buffSystem` singleton
- [ ] `src/v2/systems/ArenaEncounterGenerator.ts` exists, exports `arenaEncounterGenerator` singleton
- [ ] `src/v2/systems/ShopSystem.ts` exists, exports `shopSystem` singleton
- [ ] `src/v2/scenes/ArenaScene.ts` exists
- [ ] `src/v2/scenes/ArenaRunScene.ts` exists
- [ ] `src/v2/scenes/ArenaRewardScene.ts` exists
- [ ] `src/v2/scenes/ShopScene.ts` exists
- [ ] `src/v2/content/buffs/index.ts` exists, exports `BUFFS` with ≥ 10 entries
- [ ] `src/v2/content/characters/arena-enemies.ts` exists, exports `ARENA_ENEMIES` with 5 entries
- [ ] `src/v2/ui/theme.ts` exists (after task #18)
- [ ] `src/v2/ui/SceneChrome.ts` exists (after task #18)

### Schema + types
- [ ] `grep "SAVE_VERSION = " src/v2/core/types.ts` shows `2`
- [ ] `grep -n "ArenaSave" src/v2/core/types.ts` returns interface definition
- [ ] `grep -n "ArenaRunState" src/v2/core/types.ts` returns interface definition
- [ ] `grep "ItemRarity" src/v2/content/types.ts` shows union including `"legendary"`
- [ ] `grep -n "BuffEffectType" src/v2/content/types.ts` returns union type
- [ ] `grep "migrateV1ToV2" src/v2/core/SaveManager.ts` returns function

### ITEMS / CHARACTERS counts
- [ ] ITEMS registry contains exactly 24 items (8 weapon + 8 armor + 8 accessory)
- [ ] All 4 rarity tiers present: 6 common + 6 rare + 6 epic + 6 legendary
- [ ] All legendary items contain `crit` field in baseStats
- [ ] CHARACTERS registry contains 5 arena enemies (arena_bandit, arena_dark_mage, arena_warden, arena_apostate, arena_demon)

### Wiring
- [ ] `src/v2/index.ts` registers 4 new scenes: ArenaScene, ArenaRunScene, ArenaRewardScene, ShopScene (12 total)
- [ ] `src/v2/scenes/HubScene.ts` has 5 primary buttons in 2 rows
- [ ] `src/v2/scenes/CombatBridgeScene.ts` has `arenaEncounterGenerator.generate()` fallback in create()
- [ ] `src/v2/scenes/PostCombatScene.ts` has `arenaEncounterGenerator.isArenaEncounter()` branch in handleContinue()
- [ ] `src/v2/systems/EncounterBuilder.ts` has `buffSystem.applyToStats()` call in build()
- [ ] `src/v2/scenes/PlayerStatsScene.ts` uses RARITY_COLOR_BY_TIER for equipment + backpack rendering

### Convention Checks
- [ ] `grep "from \"../v2/" src/scenes/GameScene.ts` returns ONLY type imports
- [ ] `grep "from \"../v2" src/scenes/BootScene.ts` shows only dynamic `await import("../v2")`
- [ ] No `any` types in new files
- [ ] BuffEffectType switch in BuffSystem.applySingleBuff is exhaustive

## Human Checks

### v1 regression
- [ ] **v1 smoke test (R15)**: clean localStorage → hard reload → game runs as v1, BootScene → IntroScene → GameScene, no v2 chunk loaded in Network tab
- [ ] Match-3 boss fight against v1 boss plays identical to pre-Phase 2A (no broken animations, no missing assets)

### SAVE_VERSION migration
- [ ] Load existing Phase 1B/1C save (version 1) → arena state initialized to defaults, no crash
- [ ] After migration, save.arena.bestScore === 0, activeRun === null
- [ ] Existing inventory/relationships/story/stats unchanged

### Arena flow
- [ ] HubScene → tap "⚔️ Арена" → ArenaScene opens
- [ ] ArenaScene → "Начать новый run" → ArenaRunScene with floor 1
- [ ] Tap "В бой" → CombatBridge → GameScene (real combat with procedural enemy)
- [ ] Win → PostCombat (arena fallback render) → Continue → ArenaRewardScene
- [ ] Pick a buff card → ArenaRunScene with floor 2 + active buff visible
- [ ] Repeat through floors 2-5
- [ ] Floor 6 boss: harder fight, more chains, visible "ФИНАЛЬНЫЙ БОСС" label
- [ ] Win boss → ArenaScene with "Победа!" toast, bestScore = 6
- [ ] Run complete: persistent XP/gold/items applied to player
- [ ] activeRun === null after complete

### Permadeath
- [ ] Lose any arena fight → Run aborted → ArenaScene with "Поражение" toast
- [ ] Persistent rewards from cleared floors still applied (XP, gold, items)
- [ ] activeRun === null after defeat

### Buff system
- [ ] Pick "Сила: +10 phys attack" → next fight shows boosted damage in DamageNumber
- [ ] Pick "Здоровье: +50 HP" → next fight player has more max HP
- [ ] Multiple buffs stack additively
- [ ] Buffs disappear after run ends (success or failure)
- [ ] Story fight (Lilana act 4) does NOT receive arena buffs

### Shop
- [ ] HubScene → tap "🛒 Магазин" → ShopScene opens
- [ ] Shows 6 items with prices in gold
- [ ] Tap item with enough gold → toast "Куплено: {name}" → gold deducted → item in backpack
- [ ] Tap item without enough gold → toast "Недостаточно золота"
- [ ] Tap item with full backpack → toast "Рюкзак переполнен"
- [ ] Legendary items hidden until level 5+, epic until level 3+

### Rarity colors
- [ ] PlayerStatsScene equipment row: equipped legendary item shows in gold
- [ ] Equipped epic item shows in purple
- [ ] Equipped rare item shows in blue
- [ ] Equipped common item shows in tan/gray
- [ ] Empty slot shows in EMPTY_SLOT_COLOR
- [ ] Backpack rows match equipment row coloring

### HubScene
- [ ] HubScene shows 5 primary buttons in 2 rows
- [ ] All 5 buttons are tappable
- [ ] Layout doesn't overflow on min screen height (640dp)
- [ ] XP-bar (Phase 1C) still visible under greeting
- [ ] "← Назад в v1" still works

### Bundle budget
- [ ] After full Phase 2A: v2 chunk size ≤ 100 KB raw (verified via build output + ls -la docs/assets/)
- [ ] If chunk > 100 KB: dedup task #18 produced insufficient savings — escalate to architect-systems

### Conventions
- [ ] `.conventions/gold-standards/arena-encounter-generation.ts` exists
- [ ] `.conventions/gold-standards/buff-system.ts` exists
- [ ] `.conventions/gold-standards/scene-chrome-extraction.ts` exists
- [ ] `.conventions/anti-patterns/avoid-buff-system-coupling.md` exists
- [ ] `CLAUDE.md` "Текущий статус" mentions Phase 2A completion + chunk sizes
- [ ] `DECISIONS.md` Round 4 amendment documented
