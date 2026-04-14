# Feature Brief: Arena Rework v2 — 10 Bosses, Perk Progression, Sell Items

## Intent
Глубокая переработка арены + продажа предметов в окне персонажа:
- **10 боссов** за забег вместо 6 (9 normal + 1 final)
- Финальный босс #10: **15 HP-слоёв, ~3000 HP общего**
- **Скилы прокачиваются через v1 PerkManager** reused в v2 арене: один perk-выбор за каждую снятую полоску HP, перки копятся сквозь забег, сбрасываются между забегами (run-only)
- **Расширенный пул перков** (Variant B — passive pool): скилы + 12 one-time пассивных перков + unlimited stat-перки (safety net)
- **Бафы** (текущий выбор из 3) предлагаются только **после боссов 3, 6, 9**
- **+15% HP и урона боссов каждый завершённый забег** (compounding)
- **Inter-boss переход**: слайд влево с блюром, новый босс с приветственной фразой (per-character)
- **Продажа предметов в PlayerStatsScene**: 💰 кнопка в backpack row, цена = 50% shop

## Audience
Игроки v2, кто играет в арену и собирает билды через перки + бафы + предметы.

## Success Criteria

### Arena structure
1. Забег состоит из **10 фаз**: 9 normal + 1 final boss.
2. Финальный босс (#10) = `arena_demon`, ровно **15 HP-слоёв, общая HP ≈ 3000** (±5%).
3. Боссы 1-9 используют 5 существующих arena enemies (bandit/dark_mage/warden/apostate/demon), procedurally assigned.
4. Прогрессивная кривая HP/layers per boss (proposed table below, реализатор может тюнить):

| Boss | Layers | HP/layer | Total HP | Special |
|------|--------|----------|----------|---------|
| 1    | 2      | 100      | 200      | warmup |
| 2    | 2      | 150      | 300      | |
| 3    | 3      | 150      | 450      | → buff pick after |
| 4    | 3      | 175      | 525      | |
| 5    | 4      | 175      | 700      | |
| 6    | 4      | 200      | 800      | → buff pick after |
| 7    | 5      | 200      | 1000     | |
| 8    | 5      | 225      | 1125     | |
| 9    | 6      | 225      | 1350     | → buff pick after (last) |
| 10 (final) | 15 | 200 | 3000 | **final** |
| **Total** | **49 layers** | — | **9450 HP** | — |

### Buff integration
5. После победы над боссами **3, 6, 9** → ArenaRewardScene с выбором 3 бафов (текущая механика).
6. После победы над боссами **1, 2, 4, 5, 7, 8** → inter-boss transition animation → следующий бой без buff reward.
7. После победы над боссом #9 → ArenaRewardScene (последний баф-пик) → бой с финальным боссом #10.
8. После победы над финальным #10 → run complete, `totalRunsCompleted` инкремент, `activeRun` сброс, persistent XP/gold/items сохранены.
9. Существующий каталог 10 бафов неизменён.

### Perk system (v1 PerkManager reused)

10. **Triggering**: каждый раз, когда игрок снимает одну HP-полоску с любого арена-босса, открывается perk-модал с 3 карточками на выбор. Игрок обязан выбрать 1 карту — бой продолжается после выбора.
11. **State persistence**: perk-levels хранятся в `SaveData.arena.activeRun.perkLevels: Record<SkillId, number>` и `SaveData.arena.activeRun.takenPassives: string[]`. Переносятся из боя в бой внутри забега. Сбрасываются при `startNewRun()`.
12. **Scope**: perk-модал открывается ТОЛЬКО в арена-боях (feature-gate `encounterContext.arenaPerksEnabled`). Сюжетные бои v2 и v1 boss fight не затронуты.
13. **UI**: re-use v1 `PerkManager` + `PerkCard.ts` компонент. Визуально те же карточки, но источник данных — из v2 SaveData.

### Perk pool (Variant B — passive pool + stat safety net)

**Категория 1: Skill перки (4 скила × 4 апгрейда = 16 пиков макс)**
- Используем существующий `SKILL_LEVEL_TABLE` из v1 `PerkManager.ts`
- 4 скила: `powerStrike`, `stun`, `heal`, `hammer`
- Каждый скил: levels 0 → 4 (4 апгрейда)
- Эффекты per level см. `SKILL_LEVEL_TABLE`

**Категория 2: Passive перки (12 штук, one-time pick, run-only)**

Каждый passive perk можно взять **ровно один раз за забег**. После взятия удаляется из пула.

| # | id | Название | Эффект |
|---|----|----|--------|
| 1 | `vampire` | Вампиризм | 5% лайфстил от урона всех скилов |
| 2 | `mana_surge` | Мана-сёрдж | +20 к стартовой мане в начале каждого боя |
| 3 | `bomb_master` | Бомбомастер | Бомбы игрока наносят +10 урона |
| 4 | `crit_mastery` | Крит-мастер | +10% к шансу крита на всё |
| 5 | `defuser` | Дефьюзер | Когда ломаешь полоску босса, все бомбы на доске обезвреживаются |
| 6 | `mana_efficiency` | Эффективность маны | Все скилы стоят на 5 меньше маны |
| 7 | `shield_breaker` | Пробитие щита | 15% шанс проигнорировать щит босса при ударе |
| 8 | `reflect` | Отражение | 20% урона от босса возвращается ему обратно |
| 9 | `rage` | Ярость | +15% урона всех скилов когда HP < 50% |
| 10 | `regeneration` | Регенерация | +3 HP в начале каждого своего хода |
| 11 | `explosive_magic` | Взрывная магия | Магические матчи 5+ создают 1 бомбу с кд 3 хода |
| 12 | `quick_draw` | Быстрое чтение | Все cooldowns скилов -1 на первом ходу каждого боя |

**Категория 3: Stat перки (unlimited, safety net)**

Можно брать бесконечно. Значения небольшие, чтобы не сломать баланс.

| # | id | Название | Эффект |
|---|----|----|--------|
| S1 | `stat_hp` | Крепость | +5 максимального HP |
| S2 | `stat_phys` | Сила | +1 физическая атака |
| S3 | `stat_mag` | Мудрость | +1 магическая атака |
| S4 | `stat_mp` | Мана-кап | +3 к максимуму MP |
| S5 | `stat_crit` | Точность | +2% к шансу крита |
| S6 | `stat_start_mp` | Энергия | +5 к стартовой мане за бой |

### Perk card generation algorithm
14. При открытии perk-модала генерируется **3 карточки**:
    ```ts
    function generatePerkCards(): PerkCardData[] {
      const cards: PerkCardData[] = [];
      const availableSkills = getUnmaxedSkills();      // skill IDs that can level up
      const availablePassives = getRemainingPassives(); // pool minus already-taken
      const statPool = STAT_PERKS;                       // always available, no exclusion

      // Slot 1: try skill perk (if any unmaxed)
      if (availableSkills.length > 0) {
        cards.push(makeSkillCard(randomFrom(availableSkills)));
      }
      // Slot 2: try passive perk (if any remain in pool)
      if (availablePassives.length > 0) {
        cards.push(makePassiveCard(randomFrom(availablePassives)));
      }
      // Slots 3 (+ whatever's missing): fill with UNIQUE stat perks
      const usedStatIds = new Set<string>();
      while (cards.length < 3) {
        const stat = randomFrom(statPool.filter(s => !usedStatIds.has(s.id)));
        usedStatIds.add(stat.id);
        cards.push(makeStatCard(stat));
      }
      return cards;
    }
    ```
15. **Игра никогда не видит пустой модал** — stat перки гарантируют 3 карточки всегда.
16. **Ранняя игра**: 1 skill + 1 passive + 1 stat (максимальное разнообразие).
17. **Середина забега** (после 16 skill пиков): 1 passive + 2 unique stats.
18. **Позднее** (все 12 passives взяты): 3 unique stats.
19. Если игрок уже взял все 6 stat-типов в ОДНОМ модале (маловероятно, всего 6 типов) — повтор разрешён.

### Per-run difficulty scaling
20. `SaveData.arena.totalRunsCompleted: number` (новое поле) — инкрементируется в `completeRun()` после победы над финальным боссом. Начальное значение 0.
21. Scaling multiplier: `difficultyMultiplier = Math.pow(1.15, totalRunsCompleted)`.
    - Run 1: 1.00× (baseline)
    - Run 2: 1.15×
    - Run 3: ≈ 1.32×
    - Run 4: ≈ 1.52×
    - Run 5: ≈ 1.75×
22. Multiplier применяется к **HP всех боссов** и **phys + mag attack всех боссов** в `ArenaEncounterGenerator`. НЕ применяется к layer count (всегда 2-15 по кривой).
23. В ArenaScene (entry menu) отображается: «Забег #{totalRunsCompleted + 1} — сложность ×{mult.toFixed(2)}».

### Inter-boss transition animation
24. Анимация играется **только** при переходе от боя к следующему бою БЕЗ промежуточного ArenaRewardScene, то есть после боссов 1, 2, 4, 5, 7, 8.
25. После боссов 3, 6, 9 → переход через ArenaRewardScene (уже есть), без отдельной inter-boss анимации.
26. Перед первым боссом забега (start of run) анимации нет — первый бой начинается сразу.
27. Перед финальным боссом (#10, после буф-пика #9) → ArenaRewardScene → sceneRouter.replace на следующий fight. Inter-boss анимация не нужна.
28. **Длительность**: ~1.2-1.5 секунды.
29. **Визуал**:
    - Текущая GameScene (уже уничтоженная победой) → CombatBridgeScene берёт управление
    - Spawn `BossTransitionOverlay` контейнер поверх всего (depth 2200)
    - Рендер portrait-snapshot текущего босса слева от центра
    - Tween: portrait улетает влево с `preFX.addBlur()` на 500ms
    - Spawn нового босса справа от экрана
    - Tween: новый босс влетает в центр за 600ms, blur ослабевает
    - SpeechBubble с greeting фразой появляется над новым боссом на 1000ms
    - После SpeechBubble dismiss → CombatBridgeScene launches GameScene с новым encounterContext
30. **Greeting phrases**: каждый arena CharacterDef получает поле `greetings?: string[]` (опциональное, backward-compat). Случайная фраза из массива выбирается при transition. Если массив пуст или undefined, фраза не показывается.
31. **Authored phrases** (per enemy, 3 phrase pool each):
    - **arena_bandit** (Бандит): «Здорова, падший!», «Твоё золото моё», «Сначала молитва, потом казнь»
    - **arena_dark_mage** (Тёмный маг): «Чувствую твой страх», «Тьма поглотит тебя», «Твоя магия слаба»
    - **arena_warden** (Страж): «Ты не пройдёшь», «Долг превыше всего», «Покайся или умри»
    - **arena_apostate** (Отступник): «Я видел истину», «Боги тебя забыли», «Падший к падшему»
    - **arena_demon** (Демон, финальный): «Наконец, достойный противник», «Твоя душа будет моей», «Ты зашёл слишком далеко»

### Sell items in PlayerStatsScene
32. В каждой **backpack row** PlayerStatsScene (НЕ в equipment slot rows) появляется иконка **💰** справа от иконки ℹ info.
33. Иконка 💰: circle ~20 × DPR, текст "💰" или иконка монеты, bg `#2a1845`, border gold `#e6c068`.
34. Separate hit-area, рядом с ℹ info — оба иконки не перекрываются.
35. Тап на 💰 (с `scrollDraggedThisGesture` guard) открывает **confirmation modal** (новый компонент `SellConfirmModal` или расширение существующего ItemCardModal с опцией `mode: "sell-confirm"`).
36. Модал показывает:
    - Заголовок: «Продать предмет?»
    - Имя предмета (в цвете rarity)
    - Слот: weapon/armor/accessory
    - **Цена продажи**: `+{sellPrice} золота` (зелёным)
    - Две кнопки: **«Продать»** (золотой фон) и **«Отмена»** (нейтральный)
    - Backdrop depth 2100 (как ItemCardModal)
37. **Цена продажи**:
    ```ts
    const sellPrice = Math.floor(PRICE_BY_RARITY[item.rarity] / 2);
    // common: 50 → 25
    // rare: 150 → 75
    // epic: 400 → 200
    // legendary: 1000 → 500
    ```
38. **Атомарная операция** в `InventorySystem`:
    ```ts
    removeItemAndRefund(instanceId: string): { ok: true; gold: number } | { ok: false; reason: string }
    ```
    Внутри: один `gameState.patch` который:
    - Удаляет item из backpack
    - Чистит equipped slot если совпадает (существующая логика `removeItem`)
    - Прибавляет `sellPrice` к `inventory.gold`
    - Возвращает новое значение gold
39. После продажи:
    - Закрыть confirm modal
    - Toast: «Продано: {name} (+{sellPrice}g)» (тип "info", duration 3000ms)
    - `this.refresh()` в PlayerStatsScene — backpack обновляется, gold counter в HUB обновляется через gameState event
40. Если player пытается продать item, которого уже нет (race с другой операцией) — Toast «Предмет не найден», модал закрывается.

## Exclusions
- **НЕ менять v1 PerkManager реализацию** — только ре-юзать как библиотеку (import + hook в арена flow).
- **НЕ добавлять новых arena enemies** — 5 существующих (bandit/dark_mage/warden/apostate/demon) покрывают 9 normal слотов + 1 final (demon).
- **НЕ делать новые скилы** сверх тех 4, что уже есть (powerStrike/stun/heal/hammer) — Вариант B не требует новых скилов.
- **НЕ добавлять новые бафы** к существующим 10 — каталог бафов не меняется.
- **НЕ менять формат SaveData кардинально** — только добавляем новые поля с SAVE_VERSION bump и миграцией:
  - `arena.totalRunsCompleted: number` (default 0 при миграции)
  - `arena.activeRun.perkLevels: Record<SkillId, number>` (default {} при старте забега)
  - `arena.activeRun.takenPassives: string[]` (default [] при старте забега)
- **НЕ трогать ShopScene** — продажа живёт в PlayerStatsScene.
- **НЕ менять PRICE_BY_RARITY** — цены магазина неизменны, продажа использует их для вычисления половины.
- **НЕ трогать v1 GameScene** напрямую кроме как через существующий feature gate `encounterContext`. Хук на perk trigger идёт через `if (this.encounterContext?.arenaPerksEnabled)`.
- **НЕ делать анимацию перехода перед первым боссом забега** (нет предыдущего) и перед финальным боссом #10 (там ArenaRewardScene → CombatBridgeScene напрямую).
- **НЕ делать перки permanent** между забегами — всё run-only, сбрасывается на `startNewRun()`.

## Additional Context

### Bundle budget warning ⚠️
v2 chunk сейчас **123.09 kB**, R2B-4 interim ceiling **125 kB**, headroom только **1.91 kB**. Эта фича добавляет значительный объём:
- PerkManager v2 wiring + perk модал integration: ~3-4 kB
- 12 passive perks + 6 stat perks data + effect logic: ~2-3 kB
- Transition animation + SpeechBubble integration: ~2-3 kB
- SellConfirmModal (или расширение ItemCardModal): ~1-2 kB
- 💰 button в PlayerStatsScene + sell logic: ~0.5-1 kB
- **Ожидаемый рост: 8-13 kB → итоговый v2 chunk ≈ 131-136 kB**

**Это ОЧЕНЬ вероятно превысит R2B-4 ceiling 125 kB.** Tech-lead должен принять одно из решений:
1. **Raise ceiling снова** (R2B-7: 125 → 140 kB interim) с обоснованием Phase 2B content expansion
2. **Pre-dedup sprint**: ускорить работу по R2B-2 (SceneChrome + theme + modalChrome extraction) ДО этой фичи как отдельная задача, чтобы освободить 5-8 kB headroom перед добавлением контента
3. **Split feature** на несколько подфич (например, сначала sell items + arena structure, потом perks, потом transitions) с промежуточными коммитами
4. **Drop некоторых частей** — например, отказаться от transition animation (−3 kB)

Рекомендация: **Pre-dedup sprint** (вариант 2) как первая задача внутри этой фичи — extract SceneChrome.ts + theme.ts перед добавлением нового контента. Это согласуется с Phase 2B commitment в R2B-2.

### Key existing systems to reuse
- `src/game/PerkManager.ts` — v1 perk logic, SKILL_LEVEL_TABLE, 4 skills × 5 levels
- `src/ui/PerkCard.ts` — visual card component
- `src/v2/systems/ArenaSystem.ts` — run state mutations
- `src/v2/systems/ArenaEncounterGenerator.ts` — HP/damage scaling formulas
- `src/v2/scenes/ArenaRunScene.ts` / `ArenaRewardScene.ts` — run UI
- `src/v2/scenes/CombatBridgeScene.ts` — inter-scene launch point for GameScene
- `src/v2/systems/InventorySystem.ts` — `removeItem(id)` atomic, gold balance
- `src/v2/ui/ItemCardModal.ts` — reusable modal pattern (gold standard #12 from Phase 2B)
- `src/v2/ui/itemFormat.ts` — shared RARITY_COLOR_BY_TIER + price helpers
- `src/ui/SpeechBubble.ts` — existing bubble for boss phrases
- `src/v2/core/types.ts` — SaveData structure
- `src/v2/core/SaveManager.ts` — MIGRATIONS map

### PerkManager integration approach
v1 PerkManager is currently wired to GameScene directly via `perkManager.maybeOfferPerk(...)` after a boss layer defeat. For v2 arena:
1. New instance of PerkManager created at `CombatBridgeScene.launchArenaFight()` start with current perk levels from `SaveData.arena.activeRun.perkLevels`
2. Pass through `GameSceneInitData.perkManager?: PerkManager` (new optional field)
3. GameScene reads `initData.perkManager` and stores as `this.arenaPerkManager`
4. After layer break (existing code path), check `if (this.encounterContext?.arenaPerksEnabled && this.arenaPerkManager) → offer perk`
5. On perk applied: call new method `arenaPerkManager.onPerkApplied(skillId)` which updates its internal state AND emits eventBus event
6. CombatBridgeScene listens for the event and writes updated levels back to SaveData when fight ends
7. On victory `CombatBridgeScene` reads final perk state from its tracked manager and persists via `gameState.patch`

### Transition animation implementation
Simplest path: new helper class `src/v2/ui/BossTransition.ts`:
```ts
export async function playBossTransition(
  scene: Phaser.Scene,
  outgoingBossSnapshot: string | null,  // texture key
  incomingBossSnapshot: string,
  greetingPhrase: string | null,
): Promise<void>;
```
Called from `CombatBridgeScene` between victory and next fight launch. Blocks until animation complete. Uses Phaser tweens + preFX blur.

## Project Context
Match-3 Telegram Mini App на Phaser 3 + TypeScript. v2 — «Университет Падших» Archero-style progression. Phase 2B in progress — первая фича (feature-item-info-display) завершена как commit `4338d14`. Текущий v2 chunk 123.09 kB, R2B-4 interim ceiling 125 kB, Phase 2B hard revert commitment 90 kB.

**Relevant DECISIONS R-entries** (from feature-item-info-display):
- R2B-1: Pure helper + Phaser component split in src/v2/ui/
- R2B-2: Phase 2B UI dedup TODO list (SceneChrome, theme, modalChrome extraction)
- R2B-3: Depth convention — blocking modals 2100+, Toast 2000, legacy 1000
- R2B-4: Interim ceiling 125 kB
- R2B-6: CI budget drift detection TODO

---

## Review Checklist

### Arena structure
- [ ] Run has exactly 10 encounters (9 normal + 1 final boss)
- [ ] Final boss (#10) = `arena_demon` with 15 HP layers and ~3000 HP total (±5%)
- [ ] Bosses 1-9 follow progressive HP/layer curve (proposed table or close variant)
- [ ] Bosses 1-9 procedurally assigned from existing 5 arena enemies
- [ ] Total run HP ≈ 9450 (matches ~49 layer opportunities)

### Per-run scaling
- [ ] `SaveData.arena.totalRunsCompleted` field added with SAVE_VERSION bump + migration
- [ ] `difficultyMultiplier = 1.15^totalRunsCompleted` applied to all boss HP and phys/mag attack
- [ ] Layer count NOT affected by multiplier
- [ ] ArenaScene entry menu shows «Забег #{N+1} — сложность ×{mult.toFixed(2)}»

### Perk system (v1 reuse + Variant B pool)
- [ ] v1 `PerkManager` is imported and reused (NOT a new perk system)
- [ ] Perk modal opens after each HP layer break in arena fights only (feature-gated)
- [ ] Perk modal NEVER opens in v1 story flow or v2 story combat (non-arena)
- [ ] Skill perk levels persist across arena fights within a run
- [ ] Skill perk levels reset to 0 at start of new run
- [ ] 12 passive perks exist with unique IDs, each pickable once per run
- [ ] 6 stat perks exist as unlimited safety net
- [ ] Perk card generation follows the algorithm in §14: skill → passive → stat priority
- [ ] Modal always has 3 cards, never empty
- [ ] Late-game (all skills maxed, all passives taken) → 3 unique stat perks
- [ ] `SaveData.arena.activeRun.perkLevels` stores skill levels
- [ ] `SaveData.arena.activeRun.takenPassives` stores picked passive IDs

### Passive perk effects
- [ ] All 12 passive perks are implemented with their effects (vampire, mana_surge, bomb_master, crit_mastery, defuser, mana_efficiency, shield_breaker, reflect, rage, regeneration, explosive_magic, quick_draw)
- [ ] Effects apply only during arena fights (feature-gated)
- [ ] Stat perks (S1-S6) apply their +stat values correctly
- [ ] Stat perks stack additively (3× +5 HP = +15 HP max)

### Buffs (unchanged except timing)
- [ ] Buff reward (ArenaRewardScene) appears ONLY after bosses 3, 6, 9
- [ ] No buff reward after bosses 1, 2, 4, 5, 7, 8
- [ ] No buff reward after final boss #10
- [ ] Existing 10 buffs catalog unchanged

### Inter-boss transition
- [ ] Animation plays after victory on bosses 1, 2, 4, 5, 7, 8 (non-buff normal wins)
- [ ] NO animation before first boss of a run
- [ ] NO animation before final boss #10 (comes after ArenaRewardScene)
- [ ] Current scene slides left with blur effect (~500ms)
- [ ] New boss slides in from right (~600ms)
- [ ] SpeechBubble shows random greeting phrase from new boss's `greetings[]`
- [ ] Total animation ~1.2-1.5 seconds
- [ ] Each of 5 arena enemies has 3 authored greeting phrases

### Sell items in PlayerStatsScene
- [ ] 💰 icon visible in every backpack row (NOT in equipment slot rows)
- [ ] 💰 icon has its own hit-area, separate from ℹ info icon
- [ ] `scrollDraggedThisGesture` guard applied to 💰 tap handler
- [ ] Tap on 💰 opens SellConfirmModal with name, rarity, slot, sell price, Продать/Отмена
- [ ] Sell price = floor(shopPrice / 2) by rarity: 25/75/200/500
- [ ] `inventorySystem.removeItemAndRefund(instanceId)` new atomic method
- [ ] After sell: modal closes, Toast «Продано: {name} (+{N}g)», scene.refresh()
- [ ] Cannot sell equipped items (💰 only in backpack rows)

### SaveData migration
- [ ] SAVE_VERSION incremented (2 → 3)
- [ ] MIGRATIONS entry added for v2 → v3
- [ ] Existing v2 saves load cleanly, new fields defaulted correctly
- [ ] `arena.totalRunsCompleted` defaults to 0 on migration
- [ ] `arena.activeRun.perkLevels` defaults to `{}` on migration
- [ ] `arena.activeRun.takenPassives` defaults to `[]` on migration

### Bundle budget
- [ ] v2 chunk size reported before + after in review request
- [ ] If ≤ 125 kB (R2B-4 ceiling): pass
- [ ] If > 125 kB: tech-lead escalation required (new R2B-7 amendment or pre-dedup sprint)
- [ ] If pre-dedup sprint chosen: SceneChrome.ts + theme.ts extraction done BEFORE content additions

### Project integrity
- [ ] ShopScene not modified
- [ ] PRICE_BY_RARITY not modified
- [ ] v1 GameScene only touched through existing `encounterContext` feature gate + new `arenaPerksEnabled` subfield
- [ ] v1 PerkManager.ts source file not modified (only imported and instantiated)
- [ ] `.conventions/checks/v2-isolation.md` respected
- [ ] v1 smoke test: clean localStorage → identical behavior
- [ ] `npm run build` passes strict TS
- [ ] All 12 passive perk effects tested (manual smoke in arena)
- [ ] Transition animation tested (manual smoke: win boss 1, see transition to boss 2)
- [ ] Sell flow tested (manual smoke: buy item in shop, sell in PlayerStats, gold increased by half price)
