# Feature Brief: Arena HP Carry-Over + Unlimited Player Levels

## Intent
Два изменения для улучшения прогрессии:
1. **Arena HP/mana carry-over**: В забеге на арене HP и мана должны сохраняться между боями. Первый бой начинается с полным здоровьем и маной, далее остаток переносится в следующий бой. Сейчас HP сбрасывается до максимума перед каждым боем.
2. **Unlimited player levels**: Убрать лимит MAX_LEVEL = 11. Игрок должен бесконечно получать уровни и stat points.

## Audience
Все игроки v2 (арена + прогрессия)

## Success Criteria
1. В арене после победы в бою 1 с 50% HP, бой 2 начинается с 50% HP (а не 100%)
2. Мана аналогично сохраняется между боями
3. Первый бой забега всегда начинается с полным HP и маной
4. ArenaRunScene показывает текущее HP/mana (чтобы игрок видел свой остаток)
5. Игрок может прокачаться выше 11 уровня
6. XP продолжает начисляться и уровни повышаются после 11
7. Каждый уровень выше 11 даёт 1 stat point (как и раньше)

## Exclusions
- Не трогать v1 механики (GameScene v1 flow)
- Не менять баланс базовых статов или формулу XP для уровней 1-11
- Не добавлять новый контент (предметы, враги, способности)

## Additional Context
- HP carry-over нужно хранить в `ArenaRunState` (SaveData.arena.activeRun)
- Для unlimited levels: `XP_TABLE` имеет 11 записей, нужна формула для уровней >11
- `STAT_PER_POINT` остаётся неизменным: hp +5, mp +4, physAttack +2, magAttack +2

## Project Context
- **Stack**: Phaser 3 + TypeScript, Vite build, localStorage persistence
- **Arena flow**: ArenaRunScene → CombatBridgeScene → GameScene → PostCombatScene → ArenaRewardScene → loop
- **HP init**: `GameScene.resetState()` sets `playerHp = encounterContext.playerStats.hpMax` (always max)
- **Mana init**: starts at 0 + passive bonuses
- **Player stats built in**: `EncounterBuilder.build()` — computes hpMax from base + buffs + perks
- **Level cap**: `MAX_LEVEL = 11` in `src/v2/systems/ProgressionSystem.ts:46`
- **XP table**: 11 entries in `XP_TABLE` array, `src/v2/systems/ProgressionSystem.ts:42-44`
- **Key files**:
  - `src/v2/systems/ArenaSystem.ts` — run state (startNewRun, advanceFloor, completeRun)
  - `src/v2/systems/EncounterBuilder.ts` — build CombatContext with playerStats
  - `src/v2/systems/ProgressionSystem.ts` — XP, levels, stat allocation
  - `src/v2/core/types.ts` — ArenaRunState, SaveData schema
  - `src/v2/scenes/ArenaRunScene.ts` — pre-fight UI
  - `src/v2/scenes/CombatBridgeScene.ts` — bridge to GameScene
  - `src/scenes/GameScene.ts` — resetState() lines ~386-423

---

## Review Checklist (for code reviewers)

- [ ] Arena fight 2+ starts with HP remaining from previous fight
- [ ] Arena fight 2+ starts with mana remaining from previous fight
- [ ] First fight of a new run starts with full HP and mana
- [ ] ArenaRunScene displays current HP/mana between fights
- [ ] Player can level beyond 11
- [ ] XP continues to accumulate and trigger level-ups after 11
- [ ] Each level above 11 grants 1 stat point
- [ ] XP formula for levels >11 is reasonable progression curve
- [ ] SaveData migration handles new fields (carriedHp, carriedMana in ArenaRunState)
- [ ] v1 flow unaffected
