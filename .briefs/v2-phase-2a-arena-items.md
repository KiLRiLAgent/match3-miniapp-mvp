# Feature Brief: v2 Phase 2A — Арена (Archero-mode) + расширение предметов

## Intent

После Phase 1C v2 имеет полную инфраструктуру (прогрессия / инвентарь / реляции / резилиентность), но контента почти нет: 1 персонаж, 1 локация, 1 бой, 6 предметов. Игроку нечего делать после прохождения 4 актов Лиланы — нет процедурного combat loop, нет применения для системы предметов, нет долгосрочной retention.

**Цель Phase 2A**: добавить **процедурную "Арену"** в стиле Archero (run-based roguelike с permadeath на run, persistent meta) + расширить **систему предметов** с 6 до 24 (включая legendary тир) + **магазин в Hub** для траты накопленного золота. Без новых story-диалогов / персонажей / локаций — только combat loop поверх существующего движка.

## Audience

- **Игроки**, прошедшие 4 акта Лиланы и оставшиеся без занятия — теперь есть бесконечный процедурный режим
- **Игроки, которые любят progression-loop'ы** Archero / Hades / Vampire Survivors — Арена даёт привычный roguelike опыт
- **Все игроки**, которые равнодушны к dating-sim части — арена даёт чистый combat content
- **Future Phase 2B** — расширение предметов закладывает фундамент для special effects, set bonuses, crafting

## Success Criteria

### Arena Mode (roguelike Archero-style)

- ✅ В HubScene появляется кнопка **«⚔️ Арена»**, открывающая ArenaScene
- ✅ ArenaScene показывает: текущий best score (highest floor reached), кнопки «Начать новый run» и «Продолжить» (если есть активный run)
- ✅ **Run структура**: 5 обычных боёв + 1 финальный босс = 6 encounters, ~10-15 минут на run
- ✅ Между боями игрок попадает в **ArenaRewardScene**: выбор 1 из 3 случайных бафов на текущий run (lifesteal disabled, только stat-boosts: «+10 phys», «+50 hp», «+10% crit», «+1 mp/turn», и т.д.)
- ✅ Каждый бой использует **процедурно сгенерированный EncounterDef** через `ArenaEncounterGenerator`. Сложность скейлится по `floorNumber`
- ✅ В пуле **3-5 синтетических врагов** (новые `CharacterDef` в `src/v2/content/characters/arena-enemies.ts`): минимум Бандит / Тёмный Маг / Страж / Отступник / Демон. Каждый с уникальным `bossPattern` (комбинация «attack» / «bombs» / «shield» / «powerStrike»)
- ✅ **Permadeath на run**: проигрыш в любом бою → run завершён, ВСЕ run-only бафы сбрасываются. Persistent XP, gold, items сохраняются (накоплено за весь run)
- ✅ **Победа над финальным боссом**: лучший лут (legendary шанс), bonus gold, score сохраняется в `bestScore`
- ✅ Run state хранится в `SaveData.arena` — можно выйти из ArenaRunScene в Hub и вернуться, бой не теряется
- ✅ **PostCombatScene** в арена-режиме показывает результат + кнопку «Дальше» которая ведёт обратно в ArenaRunScene (НЕ в DialogueScene)

### Item Expansion (24 items, 4 rarities)

- ✅ `ItemRarity` тип расширен: добавлен `"legendary"` в union (`common | rare | epic | legendary`)
- ✅ `src/v2/content/items/index.ts` содержит **24 предмета**: 8 weapon + 8 armor + 8 accessory
- ✅ Распределение по rarity: 2 common + 2 rare + 2 epic + 2 legendary в каждом slot (8 предметов на slot)
- ✅ Stat-only предметы (без special effects). Скейлинг по rarity:
  - common: 1 stat field, базовое значение
  - rare: 1-2 stat fields, +50% к common
  - epic: 2 stat fields, +120% к common
  - legendary: 2-3 stat fields, +250% к common, всегда содержит crit
- ✅ **PlayerStatsScene** отображает rarity цвета: common серый (#9f8a7a), rare синий (#5b8fe6), epic фиолетовый (#a070d8), legendary золотой (#e6c068). Применяется к equipment slot value text + backpack row name
- ✅ **Магазин** (`ShopScene`, новая сцена) — открывается из HubScene по кнопке «🛒 Магазин»:
  - Список ~6-8 предметов на продажу (rotating, by player level)
  - Цена в gold (common ~50, rare ~150, epic ~400, legendary ~1000)
  - Кнопка «Купить» — проверяет gold и место в backpack, добавляет предмет, списывает gold, показывает toast «Предмет получен»
  - Если gold недостаточно — toast «Недостаточно золота»
  - Если backpack полный — toast «Рюкзак переполнен»

### Buff System (run-only)

- ✅ `BuffSystem` (singleton, новая `src/v2/systems/BuffSystem.ts`) — управляет активными бафами
- ✅ `BuffDef` registry в `src/v2/content/buffs/index.ts` — минимум **10 буфов**:
  - «Сила: +10 phys attack»
  - «Магия: +10 mag attack»
  - «Здоровье: +50 max HP (и текущий)»
  - «Мана: +30 max MP (и текущая)»
  - «Крит: +10% crit chance»
  - «Скорость: +1 mp regen per turn»
  - «Защита: +20% damage reduction»
  - «Месть: +5 phys per fight survived»
  - «Удача: +1 reroll в reward choice»
  - «Феникс: восстановить 50% HP при поражении (1 раз)»
- ✅ Бафы применяются через **hook в EncounterBuilder.build()** — модифицируют `playerStats` перед заморозкой `CombatContext`. НЕ изменяют SaveData (только run state).
- ✅ Бафы **сбрасываются** при завершении run (победа или поражение)
- ✅ ArenaRunScene показывает список активных бафов вверху экрана

### HubScene (новые кнопки)

- ✅ HubScene содержит **6 кнопок** (2 ряда):
  - Ряд 1 (primary): «🗺 Карта» / «👤 Персонаж» / «📖 Галерея»
  - Ряд 2 (primary): «⚔️ Арена» / «🛒 Магазин» / («← Назад в v1» как secondary внизу)
- ✅ Layout не ломается на минимальном размере экрана (640dp height)
- ✅ XP-bar (Phase 1C) остаётся под greeting

### SaveData migration

- ✅ `SAVE_VERSION` повышается с **1 → 2**
- ✅ Migration функция в `SaveManager.MIGRATIONS` инициализирует `arena: ArenaSave` defaults для существующих Phase 1B/1C сохранений
- ✅ `ArenaSave` shape:
  ```ts
  {
    activeRun: ArenaRunState | null;  // null когда run не активен
    bestScore: number;                  // highest floor cleared
    totalRunsCompleted: number;
    totalRunsFailed: number;
  }
  ```
- ✅ `ArenaRunState`:
  ```ts
  {
    floor: number;                      // 1..6
    enemyType: string;                  // characterId следующего врага
    activeBuffs: ActiveBuff[];          // {buffDefId, sourceFightFloor}
    accumulatedRewards: {               // не применяется до конца run
      xp: number;
      gold: number;
      items: string[];                  // itemDefIds
    };
    startedAt: number;                  // ts
  }
  ```

## Exclusions

- **НЕ добавлять** новые story-диалоги, акты, локации, story-персонажей
- **НЕ добавлять** AI chat для арена-врагов (Phase 3)
- **НЕ менять** Match-3 механику (`Board.ts`, `GameScene.ts`, `src/match3/`, `src/game/`, `src/ui/` v1) — кроме хуков для buff application через encounterContext, согласовать с tech-lead
- **НЕ внедрять** special effects на предметах (lifesteal, thorns, on-equip triggers) — Phase 2B
- **НЕ внедрять** set bonuses, item upgrades, crafting, реролл — Phase 2C+
- **НЕ внедрять** item icons (placeholder text-only OK)
- **НЕ менять** существующие 6 предметов из Phase 1B (только дополнить новыми 18)
- **НЕ ломать** Phase 1C resilience: содержимое валидатора расширяется, но архитектура не меняется
- **НЕ внедрять** leaderboard, multiplayer, social features — Telegram WebApp single-player
- **НЕ менять** SceneRouter архитектуру (используется как есть с `setRoot`/`push`/`replace`/`pop`)
- **НЕ внедрять** unit test framework (vitest/jest) — out of scope Phase 2A
- **НЕ внедрять** daily quests / достижения — Phase 2C

## Additional Context

### Бюджет v2 chunk

Phase 1C: 87.20 KB / ≤90 KB (Round 3 exception). Phase 2A неизбежно превысит 90 KB из-за объёма (4 новых сцены, 4 новых системы, 24 предмета, 5 врагов, 10 буфов, migration code).

**Реалистичная оценка Phase 2A**: +22-27 KB → 109-114 KB raw.

**С обязательным dedup task**: extract `src/v2/ui/SceneChrome.ts` (back button, primary button, header), `src/v2/ui/theme.ts` (colors, fonts, spacings), `src/v2/ui/PaginatedList.ts` (pagination helper). Целевой final: **≤100 KB raw / ≤32 KB gzip**.

**Phase 2A bundle budget**: Round 4 amendment в DECISIONS.md — bump до **100 KB raw** как Phase 2A-only exception. Phase 2B обязана вернуться к 80 KB.

### Procedural EncounterDef integration

CombatBridgeScene при `ENCOUNTERS[encounterId]` miss должен fall back на `arenaEncounterGenerator.generate(encounterId)`. encounterId формат: `"arena_floor_${N}_${enemyType}"` — generator парсит и строит `EncounterDef` по правилам:

- `bossStats.layerCount = 2 + floor` (1-2 layers на ранних этажах, 7-8 на финальном)
- `baseHpPerLayer = 30 + floor * 12`
- `physAttack = 8 + floor * 2`
- `bossPattern` зависит от enemyType (Bandit: ["attack", "attack", "powerStrike"], DarkMage: ["attack", "shield", "bombs"], etc.)
- `chains` отсутствуют на этажах 1-3, появляются с 4-го (1 chain), на боссе 3-4 chains
- `rewards` скейлятся: XP 50*floor, gold 25*floor, loot rarity растёт с floor

### Buff application hook

В `EncounterBuilder.build()` после получения `playerStats` из save:
```ts
const playerStats = save.player.stats;
const buffedStats = buffSystem.applyToStats(playerStats);  // НОВОЕ
// ... bossHpMax derivation использует buffedStats ...
```

Если активного run нет (`save.arena.activeRun === null`) → `buffSystem.applyToStats` возвращает `playerStats` без изменений (no-op).

### Synthetic enemy CharacterDef pattern

Минимальный набор полей:
```ts
const arenaBandit: CharacterDef = {
  id: "arena_bandit",
  name: "Бандит",
  pronouns: "he",
  faction: "human",
  archetype: "generic-enemy",
  shortDescription: "Дорожный разбойник",
  backstory: "Один из множества безымянных нарушителей закона.",
  personality: { traits: ["hostile"], voiceGuidelines: "Не используется" },
  relationshipThresholds: { friendly: 0, romance: 0, hostileViaCynicism: 100 },
  assets: { portraitNeutral: "placeholder_bandit_portrait" },
  defaultDialogueId: "arena_no_dialogue",  // never resolved
};
```

PostCombatScene `renderFallback()` (Phase 1C R3) обработает отсутствие portrait/dialogue gracefully — это уже battle-tested.

### Project Context (стек, паттерны)

- **Стек**: Phaser 3.88 + TypeScript 5.9 strict + Vite 7. Telegram Mini App, frontend-only
- **v2 директория**: `src/v2/` (изолирована)
- **Singleton системы**: gameState, relationshipSystem, progressionSystem, inventorySystem (Phase 1B), eventBus, sceneRouter, toast (Phase 1C). Phase 2A добавляет: arenaSystem, buffSystem, shopSystem, arenaEncounterGenerator
- **Конвенции**: `.conventions/gold-standards/` (15 файлов), особенно: `system-dependency-injection.ts`, `single-source-enrichment.ts`, `ui-component.ts` (modal pattern, tear-down refresh), `toast-notifications.ts`, `content-validation.ts`
- **Текущий статус**: Phase 1C завершена + Phase 2A planning. dev-v2 ветка, push в origin.

---

## Review Checklist (для code reviewers)

### Arena Mode
- [ ] HubScene содержит кнопку «⚔️ Арена» в primary ряду 2
- [ ] ArenaScene существует, показывает best score и кнопки start/continue
- [ ] Run flow: 5 обычных боёв + 1 boss = 6 encounters
- [ ] Между боями ArenaRewardScene с выбором 1 из 3 бафов
- [ ] Permadeath: проигрыш в любом бою сбрасывает run state, активные бафы исчезают
- [ ] Накопленные XP/gold/items сохраняются persistent
- [ ] Run state сохраняется в SaveData.arena.activeRun, можно выйти и вернуться
- [ ] CombatBridgeScene fall back на arenaEncounterGenerator при miss в ENCOUNTERS
- [ ] PostCombatScene routing: arena fight → ArenaRunScene, story fight → DialogueScene/Hub (исходное поведение сохранено)

### Items
- [ ] ItemRarity union содержит «legendary»
- [ ] 24 предмета в `src/v2/content/items/index.ts`: 8 weapon + 8 armor + 8 accessory, 2 на rarity на slot
- [ ] Старые 6 предметов из Phase 1B нетронуты
- [ ] PlayerStatsScene применяет rarity colors (common/rare/epic/legendary) к equipment + backpack rows
- [ ] Stat scaling по rarity: common < rare (+50%) < epic (+120%) < legendary (+250%)
- [ ] Legendary всегда содержит crit field

### Shop
- [ ] HubScene содержит кнопку «🛒 Магазин» в primary ряду 2
- [ ] ShopScene показывает 6-8 ротирующихся предметов с ценой в gold
- [ ] Покупка списывает gold, добавляет в backpack
- [ ] Toast при недостатке gold или полном backpack
- [ ] Цены: common ~50, rare ~150, epic ~400, legendary ~1000

### Buff System
- [ ] BuffSystem singleton, BuffDef registry с минимум 10 buff types
- [ ] Бафы применяются в EncounterBuilder.build() hook
- [ ] Бафы НЕ влияют на не-арена бои (`activeRun === null` → no-op)
- [ ] Бафы сбрасываются при завершении run (success или failure)

### SaveData migration
- [ ] SAVE_VERSION = 2
- [ ] Migration v1 → v2 инициализирует arena state с defaults
- [ ] Существующие Phase 1B/1C сохранения загружаются без crash
- [ ] arena state имеет все required поля

### Bundle budget
- [ ] v1 main chunk ≤ 135 KB (unchanged)
- [ ] v2 chunk ≤ 100 KB (Phase 2A Round 4 exception документирован в DECISIONS.md)
- [ ] Bundle dedup task выполнен: extracted SceneChrome / theme / PaginatedList

### Conventions
- [ ] `.conventions/` обновлён с новыми patterns: arena-encounter-generation, buff-system, shop-system
- [ ] CLAUDE.md "Текущий статус" mentions Phase 2A completion + new directories + chunk sizes
- [ ] DECISIONS.md содержит Round 4 amendment по бюджету

### Exclusions respected
- [ ] Match3 механика нетронута (Board.ts, GameScene.ts, src/match3/, src/game/, src/ui/ v1)
- [ ] Никаких new story-диалогов / актов / локаций / персонажей (кроме arena enemies)
- [ ] Никаких special effects на предметах (только stats)
- [ ] Никаких set bonuses, crafting, item levels
- [ ] Никаких external dependencies для нового кода
- [ ] Никаких test frameworks
- [ ] Никаких изменений в SceneRouter сверх существующего API
