# Verification Plan
## Feature: v2 Phase 1A — Lilana Vertical Slice

## Build & Types
- [ ] `npm run build` passes (TypeScript strict + Vite prod build, emits to `docs/`)
- [ ] No new TypeScript errors
- [ ] v1 chunk ≤ 135 kB (REFINEMENT 9 raised budget)
- [ ] Phaser chunk separated via manualChunks

## Spec Checks — Core infrastructure (Task #1, #2, #4)
- [ ] File `src/v2/content/types.ts` exists and exports `CombatContext`, `GameSceneInitData`, `RawCombatResult`, `CombatResult`, `EncounterDef`, `CharacterDef`, `DialogueGraph`, `LocationDef`
- [ ] File `src/match3/types.ts` exports `Chain` and `ChainVariant`
- [ ] File `src/match3/Board.ts` has methods: `placeChains`, `isChained`, `getChainAt`, `getAllChains`, `getDamagedChains`, `damageChains`, `hasActiveChains`, `clearChains`
- [ ] File `src/v2/systems/RelationshipSystem.ts` exports `relationshipSystem` (singleton)
- [ ] File `src/v2/systems/StoryFlags.ts` exports `storyFlags` (singleton)

## Spec Checks — Systems (Task #3, #5)
- [ ] File `src/v2/systems/DialogueRunner.ts` exports `DialogueRunner` class with `selectChoiceById` method (REFINEMENT 5)
- [ ] File `src/v2/systems/EncounterBuilder.ts` exports `encounterBuilder` singleton with `build()` returning `CombatContext`
- [ ] File `src/v2/systems/conditionEval.ts` exists (shared condition helper per DECISIONS §15)

## Spec Checks — Content (Task #7)
- [ ] File `src/v2/content/characters/lilana.ts` exists and exports `LILANA` character profile
- [ ] Files `src/v2/content/dialogues/lilana-act1.ts`, `lilana-act2.ts`, `lilana-act4.ts` all exist
- [ ] File `src/v2/content/encounters/lilana-trial.ts` exists with 8 chains definition
- [ ] File `src/v2/content/locations/atrium.ts` exists with Lilana hotspot
- [ ] Index files `src/v2/content/characters/index.ts`, `dialogues/index.ts`, `encounters/index.ts`, `locations/index.ts` all export their registries

## Spec Checks — UI Components (Task #8)
- [ ] File `src/ui/ChainOverlay.ts` exists (REFINEMENT 3 — src/ui not src/v2/ui)
- [ ] Files `src/v2/ui/DialogueChoiceButton.ts`, `CharacterPortrait.ts`, `RelationshipMeter.ts` all exist

## Spec Checks — Scenes (Task #9, #10, #11)
- [ ] File `src/v2/scenes/HubScene.ts` (rewrite from Phase 0 stub)
- [ ] File `src/v2/scenes/StoryMapScene.ts` exists
- [ ] File `src/v2/scenes/LocationScene.ts` exists
- [ ] File `src/v2/scenes/DialogueScene.ts` exists
- [ ] File `src/v2/scenes/CombatBridgeScene.ts` exists
- [ ] File `src/v2/scenes/PostCombatScene.ts` exists

## Spec Checks — GameScene patch (Task #6)
- [ ] File `src/scenes/GameScene.ts` has ≥15 `// v2:` comments (spec minimum; actual: ~35)
- [ ] File `src/scenes/GameScene.ts` has `encounterContext` field (type-only import)
- [ ] File `src/scenes/GameScene.ts` has `getEffectivePlayerHpMax()`, `getEffectivePlayerAttack()`, `getEffectiveBossHpMax()` or equivalent getters
- [ ] File `src/scenes/GameScene.ts` has `emitV2CombatResult` helper
- [ ] File `src/game/BossAbility.ts` has `patternOverride?: BossAbilityType[]` instance field (REFINEMENT 8)

## Spec Checks — Wire-up (Task #12)
- [ ] File `src/v2/index.ts` registers all 6 Phase 1A scenes: HubScene, StoryMapScene, LocationScene, DialogueScene, CombatBridgeScene, PostCombatScene

## Spec Checks — v2-Isolation enforcement
- [ ] `src/scenes/GameScene.ts` has NO runtime imports from `src/v2/*` (type-only imports allowed)
- [ ] `src/scenes/IntroScene.ts` has ZERO references to `src/v2/*`
- [ ] `src/scenes/BootScene.ts` only imports from `src/v2/*` via dynamic `await import("../v2")`

## Spec Checks — Conventions (Task #13)
- [ ] File `.conventions/checks/v2-isolation.md` exists
- [ ] File `.conventions/gold-standards/feature-gated-patches.ts` exists (per REFINEMENT 9 precedent)
- [ ] File `.conventions/gold-standards/dialogue-system.ts` exists
- [ ] File `.conventions/gold-standards/scene-coordinates.md` exists
- [ ] CLAUDE.md has updated v2 Architecture section reflecting Phase 1A completion

## Human Checks

- [ ] **Zero-disruption v1 smoke test**: Clean localStorage → open game → BootScene → IntroScene → GameScene. Play 3-5 moves. Everything must be identical to baseline (no visual changes, no new UI elements, no perf difference).
  → If ANY visible change appears = FAIL

- [ ] **v2 toggle in SettingsPanel**: Open settings, scroll to top, see "🔮 Режим игры" section. Toggle to v2 → reload → HubScene loads with lazy chunk visible in Network tab.

- [ ] **Full Lilana arc playthrough**: HubScene → StoryMap → Atrium → tap Lilana → Act 1 dialogue with 3 choices → return to map → repeat Act 2 → Act 4 → battle transition.

- [ ] **Lilana battle with chains**: 8 chains visible on the match3 board (ChainOverlay rendering). Threshold guard prevents HP dropping below ratio while chains alive. Breaking chains animates cleanly (animate-before-mutate). Defeating Lilana triggers CombatBridgeScene callback.

- [ ] **PostCombatScene**: RelationshipMeter animates from old → new value. XP/gold shown. "Продолжить" button returns to DialogueScene at victory_epilogue / defeat_epilogue node (startNodeId resume).

- [ ] **Relationship persistence**: Make choices affecting empathy/dominance/cynicism → save → reload → relationship state persisted.

- [ ] **Back to v1**: From HubScene, "← Вернуться в v1" button → reload → IntroScene again.

- [ ] **No regressions v1**: Tutorial flow, IntroScene cutscene, boss abilities, perk selection, hammer mode, victory/defeat screens — all work as before.
