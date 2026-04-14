# Feature Brief: v2 Phase 1B — Progression, Gallery, Bug Fixes

## Intent

Игрок зашёл в v2 «Университет Падших», прошёл Лилана/Сафира arc и потерял ощущение прогресса:
- не понимает, что персонаж качается (XP пишется в save, но никаких уровней/UI/роста статов)
- хочет видеть «галерею побеждённых девочек» с состоянием отношений
- после боя с Сафирой Act 4 повторяется бесконечно (нет gating флагов)
- молот работает некорректно — после применения можно матчить тайлы и всё ломается

Этот пакет даёт игроку **clear progression loop** и фиксит структурные баги:

1. **🐛 Bug fix — Hammer**: после `removeWithHammer()` ход НЕ заканчивается, игрок может ещё матчить → game state breaks. Вызвать `finishPlayerTurn()` после завершения hammer-cascade.
2. **🐛 Bug fix — Dialogue progression flags**: Acts 1, 2, 4 не ставят `lilana:actN:done` флаги в end-узлах → LocationScene `resolveDialogueId` всегда возвращает Act 1 (или повторяет тот же акт). Нужно автоматически устанавливать флаги при завершении dialogue arc.
3. **🐛 Bug fix — Post-Safira loop**: после победы в Act 4 диалог Сафиры запускается снова с начала. Нет gate против `lilana:act4:done`. Добавить флаг + post-arc state в hotspot.
4. **✨ ProgressionSystem (hybrid)**: автоматический рост статов от уровня (XP→level→+HP/+atk) + 3 слота снаряжения (оружие/броня/аксессуар) дающие bonus stats. Хибрид Archero + RPG.
5. **✨ Inventory + Equipment**: ItemDatabase с 6-10 предметами (common/rare), loot drops после победы, equip/unequip flow.
6. **✨ PlayerStatsScene**: новая сцена доступная из HubScene — аватар, уровень, XP bar, base+equipment stats, 3 equipment слота, backpack list, equip-on-tap.
7. **✨ CharacterGalleryScene (Roster Grid)**: новая сцена доступная из HubScene — сетка всех встреченных персонажей. Tap → modal с большим портретом, бэкстори, 3 relationship bars, affinity status, defeated/met indicator.
8. **✨ HubScene reorganize**: 4 кнопки вместо 2 — Карта/Персонаж/Галерея/Назад в v1.

## Audience

- **Игрок-тестер v2**: видит понятную прогрессию (level up notification, growing stats, new equipment, character collection).
- **Геймдизайнер**: получает работающий progression loop для оценки геймплея перед добавлением новых персонажей в Phase 2.

## Success Criteria

### Bug fixes
- [ ] **Hammer**: использовать молот → cascade завершается → ход переходит к боссу (нельзя матчить до следующего turn). Воспроизвести: open dev → v2 → Атриум → Сафира act4 → use hammer → попытаться свайпнуть тайл → должно быть заблокировано (busy).
- [ ] **Dialogue progression flags**: пройти Act 1 → вернуться на карту → клик по Сафире → должен начаться Act 2 (не Act 1). Аналогично Act 2 → Act 4. Каждый акт ставит свой `done` флаг автоматически в end-узле.
- [ ] **Post-arc gate**: после победы Act 4 → клик по Сафире снова → должен показаться **post-arc state** (например, краткий диалог "Я всё ещё помню тебя, {playerName}" БЕЗ боя), не повтор Act 4 с боем.

### Progression
- [ ] При победе игрок получает XP (показывается в PostCombatScene). При accumulation XP до уровня → автоматический level-up → notification "Уровень N!" → +20 HP / +10 MP / +1 phys / +1 mag (или похожие формулы из ProgressionSystem.ts).
- [ ] Player Stats UI показывает: текущий уровень, XP bar к следующему уровню, base stats отдельно от equipment bonuses, 3 equipment слота, inventory list.
- [ ] Equipment даёт bonus stats: например "Учебный клинок +5 phys", "Робы первокурсника +10 HP". При equip — статы пересчитываются live, при unequip — возвращаются.
- [ ] Effective player stats в бою (через `effectivePlayerStats()` getter) включают level + equipment bonuses, не только GAME_PARAMS.

### Inventory
- [ ] ItemDatabase содержит минимум 6-10 предметов: 2 weapon, 2 armor, 2 accessory, 2 рандомных. Common + rare rarities.
- [ ] После победы в encounter с loot table → 1 случайный предмет добавляется в inventory с notification.
- [ ] Inventory ≤ 8 backpack slots; если переполнен — старые предметы могут быть проданы за gold (или заблокирован loot pickup).

### Character Gallery
- [ ] Кнопка "Галерея" в HubScene → CharacterGalleryScene → grid из всех персонажей у которых `relationships[id]` существует в SaveData (т.е. встречены в диалоге).
- [ ] Каждая ячейка: круглый портрет, имя, маленький relationship indicator (3 точки или mini-bar).
- [ ] Tap на портрет → modal с полной информацией: большой портрет, имя, бэкстори (из CharacterDef.backstory, scrollable), 3 relationship bars (empathy/dominance/cynicism, 0-100), affinity status (friendly/romance/hostile/neutral), defeated indicator (если бой пройден через `stats.combatsWon` или `story.completedEncounters`).

### HubScene
- [ ] 4 кнопки на главном экране: Карта, Персонаж, Галерея, ← Назад в v1. Layout — vertical stack в центре или 2x2 grid.
- [ ] При входе в HubScene показывается приветствие с player name + текущий уровень.

## Exclusions

- **Новые персонажи**: только Лилана/Сафира пока. Никаких новых character def, dialogues, encounters.
- **Новые локации**: только Atrium. Никаких Chapel/Library/etc.
- **Phase 3 AI chat**: вне scope.
- **Художественные ассеты**: используем существующие Safira портреты + chain.png + cathedral.jpg. Никакой генерации новых.
- **v1 GameScene refactoring**: только минимальный hammer fix + integration с effectivePlayerStats. Никаких больших изменений v1.
- **Мобильные UI tweaks**: layout должен быть responsive но без специальной mobile-only логики.
- **Sound design / музыка**: вне scope.
- **Save migration**: SaveData схема НЕ должна ломать существующие сохранения. Новые поля — optional или с defaults.
- **Telegram Stars / монетизация**: вне scope (Phase 3+).
- **Real Lilana art**: остаёмся на Safira visual swap, не генерим новые портреты.

## Additional Context

### Подтверждённые баги (из аудита researchers)

#### 1. Hammer не завершает ход
- **Файл**: `src/scenes/GameScene.ts:1974-2016` — `removeWithHammer()`
- **Проблема**: после `resolveBoard()` cascade → `exitHammerMode()` ставит `busy=false`, но **НЕ вызывает `finishPlayerTurn()`**.
- **Фикс**: добавить `await this.finishPlayerTurn()` в конце `removeWithHammer()`. Сравнить с `attemptSwap` flow для consistency.

#### 2. Acts не ставят done-флаги
- **Файлы**: `src/v2/content/dialogues/lilana-act{1,2,4}.ts` — end-узлы
- **Проблема**: end-узлы НЕ имеют `effects` с `setFlag`. После end → `lilana:actN:done` остаётся false.
- **Фиксы (2 опции)**:
  - **Опция A (manual)**: добавить `effects: [{ type: "setFlag", key: "lilana:actN:done", value: true }]` в end-узлы каждого акта.
  - **Опция B (auto)**: модифицировать DialogueRunner.applyEndEffects() — автоматически ставить `<characterId>:<dialogueId>:done` флаг ДО применения user effects. Менее invasive, но менее explicit. **Recommended: A для clarity.**

#### 3. Post-arc gate
- **Файл**: `src/v2/content/locations/atrium.ts` — hotspot dialogues array
- **Проблема**: dialogues array проверяет `lilana:act2:done` для Act 4 priority, но **НЕ проверяет `lilana:act4:done`**. После победы → priority всё ещё возвращает Act 4.
- **Фикс**: добавить новый dialogue option на самом высоком приоритете:
  ```ts
  {
    dialogueId: "lilana-postarc",  // короткий диалог "помню тебя"
    condition: { flag: "lilana:act4:done", flagEquals: true },
    priority: 5,
  }
  ```
- Создать новый файл `lilana-postarc.ts` (~10 строк) — простой двух-нодовый диалог без боя.
- Также: лила-act4 end-узел должен ставить `lilana:act4:done` (после applyEndEffects на epilogue_victory).

### Архитектура новых модулей

#### ProgressionSystem
**File**: `src/v2/systems/ProgressionSystem.ts`

```ts
const XP_TABLE = [0, 100, 250, 500, 850, 1300, 1850, 2500, 3250, 4100, 5050];

class ProgressionSystem {
  applyXpGain(amount: number): { newLevel: number; leveledUp: boolean } {
    const save = gameState.get();
    const oldLevel = save.player.level;
    save.player.xp += amount;
    let newLevel = oldLevel;
    while (newLevel < XP_TABLE.length - 1 && save.player.xp >= XP_TABLE[newLevel + 1]) {
      newLevel++;
    }
    if (newLevel > oldLevel) {
      save.player.level = newLevel;
      this.applyLevelUpStats(save, oldLevel, newLevel);
    }
    save.player.xpToNext = XP_TABLE[Math.min(newLevel + 1, XP_TABLE.length - 1)] - save.player.xp;
    gameState.commit();
    return { newLevel, leveledUp: newLevel > oldLevel };
  }

  applyLevelUpStats(save: SaveData, fromLevel: number, toLevel: number): void {
    const delta = toLevel - fromLevel;
    save.player.stats.hpMax += 20 * delta;
    save.player.stats.manaMax += 10 * delta;
    save.player.stats.physAttack += 1 * delta;
    save.player.stats.magAttack += 1 * delta;
  }

  computeEffectiveStats(): EffectivePlayerStats {
    const save = gameState.get();
    const base = save.player.stats;
    const equipBonus = inventorySystem.computeAggregateStats();
    return {
      hpMax: base.hpMax + equipBonus.hpMax,
      manaMax: base.manaMax + equipBonus.manaMax,
      physAttack: base.physAttack + equipBonus.physAttack,
      magAttack: base.magAttack + equipBonus.magAttack,
      crit: base.crit + equipBonus.crit,
    };
  }
}

export const progressionSystem = new ProgressionSystem();
```

EncounterBuilder.applyResult должен вызывать `progressionSystem.applyXpGain(rewards.xp)` после `combatStats` updates.

#### InventorySystem
**File**: `src/v2/systems/InventorySystem.ts`

```ts
interface ItemDef {
  id: string;
  name: string;
  description: string;
  slot: "weapon" | "armor" | "accessory";
  rarity: "common" | "rare" | "epic";
  baseStats: Partial<ItemStats>;
  iconKey?: string;
}

class InventorySystem {
  add(itemDefId: string): ItemInstance | null {
    const def = ITEMS[itemDefId];
    if (!def) return null;
    const save = gameState.get();
    if (save.inventory.items.length >= MAX_BACKPACK_SLOTS) return null; // full
    const instance: ItemInstance = {
      instanceId: `${itemDefId}-${Date.now()}`,
      defId: itemDefId,
      level: 1,
      rolledStats: { ...def.baseStats },
    };
    save.inventory.items.push(instance);
    gameState.commit();
    return instance;
  }

  equip(slot: "weapon" | "armor" | "accessory", instanceId: string): boolean {
    const save = gameState.get();
    const item = save.inventory.items.find(i => i.instanceId === instanceId);
    if (!item) return false;
    const def = ITEMS[item.defId];
    if (def.slot !== slot) return false;
    save.inventory.equipped[slot] = instanceId;
    gameState.commit();
    return true;
  }

  unequip(slot): boolean { ... }

  computeAggregateStats(): Partial<ItemStats> {
    const save = gameState.get();
    const result: ItemStats = { hpMax: 0, manaMax: 0, physAttack: 0, magAttack: 0, crit: 0 };
    for (const slot of ["weapon", "armor", "accessory"] as const) {
      const id = save.inventory.equipped[slot];
      if (!id) continue;
      const item = save.inventory.items.find(i => i.instanceId === id);
      if (!item) continue;
      for (const key of Object.keys(result) as Array<keyof ItemStats>) {
        result[key] += item.rolledStats[key] ?? 0;
      }
    }
    return result;
  }
}

export const inventorySystem = new InventorySystem();
```

#### ItemDatabase
**File**: `src/v2/content/items/index.ts`

Минимум 6 предметов:
- `wooden_blade` (weapon, common, +5 phys)
- `silver_dagger` (weapon, rare, +10 phys, +2 crit)
- `student_robes` (armor, common, +20 hpMax)
- `padded_cuirass` (armor, rare, +40 hpMax, +5 manaMax)
- `simple_amulet` (accessory, common, +5 manaMax)
- `focus_charm` (accessory, rare, +15 manaMax, +3 magAttack)

EncounterDef.rewards уже имеет `lootText` placeholder. Расширить до:
```ts
rewards: {
  xp: 150,
  gold: 50,
  loot: [
    { itemDefId: "silver_dagger", chance: 0.3 },
    { itemDefId: "wooden_blade", chance: 0.5 },
    { itemDefId: "student_robes", chance: 0.7 },
  ],
}
```

EncounterBuilder.applyResult должен случайно выбрать предмет из loot table и вызвать `inventorySystem.add()`.

#### PlayerStatsScene
**File**: `src/v2/scenes/PlayerStatsScene.ts`

Layout:
```
[← В Hub]
[Avatar + Name + "Уровень N"]
[XP bar: 250/500 XP до уровня 4]

╔══ Базовые статы ══╗
HP: 220 (200 + 20)    ← base + equip bonus
MP: 100 (100 + 0)
Атака: 12 (10 + 2)
Магия: 11 (10 + 1)

╔══ Снаряжение ══╗
[⚔️ Серебряный кинжал]    [tap to swap]
[🛡 Робы первокурсника]   [tap to swap]
[💎 Простой амулет]        [tap to swap]

╔══ Рюкзак (3/8) ══╗
[Деревянный клинок] [tap to equip]
[Тяжёлая броня]      [tap to equip]
[Кулон сосредоточения] [tap to equip]
```

Tap on equipment slot → list of compatible items → tap → equip + recalc stats.
Tap on backpack item → equip immediately if slot empty, else swap.

#### CharacterGalleryScene
**File**: `src/v2/scenes/CharacterGalleryScene.ts`

Layout:
```
[← В Hub]
"Галерея персонажей"

╔══════════════════════════╗
║  ⚪Сафира       ⚪Lilana ║   ← grid of CharacterPortrait
║  💕Romance      ❌None   ║   ← affinity indicator
║                           ║
║  ⚪Каэль        ⚪???    ║   ← future / locked
║  🤝Friend       ?        ║
╚══════════════════════════╝
```

Tap on portrait → modal:
```
╔═════════════════════════════╗
║ [BIG PORTRAIT]              ║
║ Сафира                      ║
║ Возраст: 21 · Падший Ангел  ║
║                             ║
║ Бэкстори:                   ║
║ "Лилана Воронова — высокая, ║
║  бледная..." [scrollable]   ║
║                             ║
║ ──── Отношения ────         ║
║ Эмпатия:    ▓▓▓▓▓░░░ 65    ║
║ Доминанта:  ▓▓▓░░░░░ 30    ║
║ Цинизм:     ▓▓░░░░░░ 20    ║
║                             ║
║ Статус: Романтик 💕         ║
║ Побеждена: ✓                ║
║                             ║
║          [Закрыть]          ║
╚═════════════════════════════╝
```

Reads from `gameState.get().relationships[characterId]` and `CHARACTERS[characterId]`. Filters: только те characters у которых есть relationship state (т.е. встречены).

### Files affected (estimated)

**Bug fixes:**
- `src/scenes/GameScene.ts` — hammer finishPlayerTurn fix (~5 lines)
- `src/v2/content/dialogues/lilana-act1.ts` — add setFlag effect to end node
- `src/v2/content/dialogues/lilana-act2.ts` — add setFlag effect
- `src/v2/content/dialogues/lilana-act4.ts` — add setFlag effect to epilogue end nodes
- `src/v2/content/dialogues/lilana-postarc.ts` — NEW (~30 lines)
- `src/v2/content/dialogues/index.ts` — register postarc
- `src/v2/content/locations/atrium.ts` — add postarc dialogue option

**New systems:**
- `src/v2/systems/ProgressionSystem.ts` — NEW (~120 lines)
- `src/v2/systems/InventorySystem.ts` — NEW (~150 lines)
- `src/v2/content/items/index.ts` — NEW item database (~80 lines)

**New scenes:**
- `src/v2/scenes/PlayerStatsScene.ts` — NEW (~300 lines)
- `src/v2/scenes/CharacterGalleryScene.ts` — NEW (~250 lines)
- `src/v2/index.ts` — register 2 new scenes
- `src/v2/scenes/HubScene.ts` — add 2 new buttons (~30 lines)

**Integration:**
- `src/v2/systems/EncounterBuilder.ts` — call progressionSystem.applyXpGain + inventorySystem.add for loot
- `src/v2/scenes/PostCombatScene.ts` — show level-up notification + loot drop notification
- `src/v2/content/encounters/lilana-act4.ts` — add real loot table

**Type updates:**
- `src/v2/content/types.ts` — extend ItemDef, EncounterRewards.loot
- `src/v2/core/types.ts` — confirm InventorySave.items shape works with InventorySystem

### Acceptance Test Path

1. Open game → switch to v2 → reload
2. HubScene → see 4 buttons (Карта/Персонаж/Галерея/← v1)
3. Click "Персонаж" → PlayerStatsScene → see Уровень 1, 0/100 XP, base stats, empty equipment
4. ← Hub → "Карта" → Atrium → Сафира → Act 1 → make choices → end → возврат
5. Атриум → Сафира → должен начаться **Act 2** (не Act 1) ← bug fix verification
6. Act 2 → end → возврат → Atrium → Сафира → **Act 4** ← progression verification
7. Act 4 → battle node → бой
8. **Use hammer in battle** → cascade завершается → ход переходит к боссу (нельзя матчить) ← hammer fix
9. Победить босса → PostCombatScene → видеть **+150 XP**, possibly **Уровень 2!** notification, **+1 предмет в инвентаре**
10. Continue → epilogue dialogue → end
11. Атриум → Сафира → **post-arc state** (короткий диалог без боя) ← post-arc gate verification
12. Hub → "Галерея" → видеть Сафиру как defeated, открыть modal с её бэкстори + relationship bars
13. Hub → "Персонаж" → видеть Уровень 2, новые stats, новый предмет в backpack, equip → stats обновляются live

## Project Context

**Stack**: Phaser 3.88 + TypeScript 5.9 strict + Vite 7. Telegram Mini App. Frontend-only, GitHub Pages deploy via `docs/`. No backend.

**Architecture**:
- v1 (`src/scenes/GameScene.ts`, `IntroScene.ts`, `BootScene.ts`) — match-3 boss fight против Safira, не трогаем
- v2 (`src/v2/`) — story-driven dating sim слой, активируется через toggle в SettingsPanel
- v2-isolation: `src/scenes/*` НЕ импортирует `src/v2/*` (только type-only). v2 импортит v1 как library
- All v2 mutations к SaveData идут через единственный source of truth (RelationshipSystem для отношений, EncounterBuilder для post-combat, gameState.patch для всего остального)

**Conventions**:
- `.conventions/checks/v2-isolation.md` — strict isolation rules
- `.conventions/gold-standards/feature-gated-patches.ts` — pattern для v1 GameScene модификаций (только через `if (encounterContext)` ветки с `// v2:` комментариями)
- `.conventions/gold-standards/dialogue-system.ts` — DialogueRunner pattern
- `.conventions/gold-standards/ui-component.ts` — Container-based UI с per-corner radius

**Текущий статус Phase 1A**: 13/13 задач завершены, build зелёный (132.75 kB v1, 54.70 kB v2 chunk, ≤135 kB budget). Phase 1A vertical slice работает: HubScene → StoryMap → LocationScene → DialogueScene → CombatBridge → GameScene с цепями → PostCombat → возврат.

**Известные ограничения Phase 1A**:
- Только 1 персонаж (Лилана/Сафира визуально)
- Только 1 локация (Atrium)
- Только 1 encounter (lilana-act4)
- Inventory struct в SaveData есть, но НИКАКОЙ ItemDatabase, НЕТ equip UI
- ProgressionSystem НЕ существует (XP пишется в save, но никаких level-up формул)
- Character Gallery НЕ существует
- Hammer skill (v1 feature) имеет баг с turn-end после use

---

## Review Checklist (for code reviewers)

### Bug fixes
- [ ] Hammer: после `removeWithHammer()` cascade → `finishPlayerTurn()` вызван → boss turn начинается → `canPlayerAct()` returns false до следующего turn
- [ ] Lilana Act 1 end-узел ставит `lilana:act1:done` флаг через setFlag effect (или auto via DialogueRunner)
- [ ] Lilana Act 2 end-узел ставит `lilana:act2:done`
- [ ] Lilana Act 4 epilogue_victory узел ставит `lilana:act4:done`
- [ ] Lilana Act 4 epilogue_defeat узел НЕ ставит флаг (можно перепройти)
- [ ] Atrium hotspot dialogues array содержит post-arc option с priority 5 и condition `lilana:act4:done`
- [ ] Создан `src/v2/content/dialogues/lilana-postarc.ts` — короткий диалог без battle node
- [ ] После победы Act 4 → возврат на карту → тап Сафиру → запускается postarc, не Act 4

### ProgressionSystem
- [ ] `src/v2/systems/ProgressionSystem.ts` существует, экспортирует `progressionSystem` singleton
- [ ] `applyXpGain(amount)` корректно обрабатывает multi-level overflow (например +500 XP с Уровня 1 → может прыгнуть на Уровень 3)
- [ ] `applyLevelUpStats` применяет +20 HP / +10 MP / +1 phys / +1 mag за уровень (или похожие формулы)
- [ ] `computeEffectiveStats()` возвращает base + equipment bonuses
- [ ] EncounterBuilder.applyResult вызывает `progressionSystem.applyXpGain(rewards.xp)` ПОСЛЕ relationship updates
- [ ] PostCombatScene показывает level-up notification если leveledUp=true
- [ ] v1 GameScene `effectivePlayerStats()` getter (если encounterContext) использует progressionSystem.computeEffectiveStats — не GAME_PARAMS

### InventorySystem
- [ ] `src/v2/systems/InventorySystem.ts` существует, экспортирует `inventorySystem` singleton
- [ ] `add(itemDefId)` создаёт ItemInstance с unique id, проверяет MAX_BACKPACK_SLOTS лимит
- [ ] `equip(slot, instanceId)` валидирует совместимость слота, обновляет save.inventory.equipped
- [ ] `unequip(slot)` корректно очищает слот
- [ ] `computeAggregateStats()` суммирует все equipped items' rolledStats
- [ ] ItemDatabase содержит ≥6 предметов: 2 weapon, 2 armor, 2 accessory
- [ ] EncounterBuilder.applyResult: после combat выбирает случайный предмет из rewards.loot table → вызывает `inventorySystem.add()` → возвращает в RawCombatResult.lootedItems
- [ ] PostCombatScene показывает loot notification если есть lootedItems

### PlayerStatsScene
- [ ] `src/v2/scenes/PlayerStatsScene.ts` существует, регистрируется в `src/v2/index.ts`
- [ ] Доступна из HubScene через кнопку "Персонаж"
- [ ] Показывает: avatar (player icon или CharacterPortrait для player), name, уровень, XP bar (current/max до next level)
- [ ] Показывает базовые статы С разбивкой на base + equipment bonus (например "HP: 220 (200 + 20)")
- [ ] 3 equipment слота визуально отделены, показывают имя и stats предмета (или "пусто")
- [ ] Tap на equipment слот → modal с list совместимых items → tap → equip + recalc + close modal
- [ ] Inventory list показывает все backpack items с их stats
- [ ] Tap на inventory item → equip immediately в правильный слот (или swap если занят)
- [ ] "← В Hub" возвращает в HubScene через SceneRouter
- [ ] Все интерактивные элементы используют `pointerdown`, не `pointerup` (паттерн v1 SettingsPanel)

### CharacterGalleryScene
- [ ] `src/v2/scenes/CharacterGalleryScene.ts` существует, регистрируется в `src/v2/index.ts`
- [ ] Доступна из HubScene через кнопку "Галерея"
- [ ] Показывает grid из всех characters у которых есть `gameState.get().relationships[id]` запись
- [ ] Каждая cell: круглый CharacterPortrait, имя, маленький affinity indicator (text или mini icon)
- [ ] Tap на cell → modal с большим портретом, бэкстори (scrollable text), 3 relationship bars (RelationshipMeter component reuse), affinity status text, defeated indicator (если encounter с этим характером в `stats.completedEncounters`)
- [ ] Modal закрывается через "Закрыть" button или tap outside
- [ ] "← В Hub" возвращает в HubScene
- [ ] Использует `pointerdown` для всех интерактивов

### HubScene
- [ ] 4 кнопки видны: "🗺 Карта" → StoryMapScene, "👤 Персонаж" → PlayerStatsScene, "📖 Галерея" → CharacterGalleryScene, "← Назад в v1" → setActiveMode + reload
- [ ] Layout не ломается на разных screen sizes (vertical stack или 2x2 grid с safe area respect)
- [ ] Все 4 кнопки используют `pointerdown` через `bg-direct hitArea` паттерн (как в Phase 1A fix dc83906)

### Build & integration
- [ ] `npm run build` проходит без TS strict errors
- [ ] v1 chunk ≤ 135 kB (REFINEMENT 9 budget)
- [ ] v2 chunk ≤ 80 kB (увеличение бюджета на ~25 kB допустимо для новой функциональности — Phase 1B refinement)
- [ ] Phaser chunk без изменений
- [ ] **v1 zero-disruption smoke test**: clean localStorage → BootScene → IntroScene → GameScene → identical baseline (только hammer fix может заметно изменить v1 поведение, но именно так и должно быть — fix bug)
- [ ] v2-isolation сохранена: 0 runtime imports из `src/v2/*` в `src/scenes/*` (type-only OK)
- [ ] SaveData migration: новые поля имеют default values, существующие сохранения v2 не ломаются

### Exclusions respected
- [ ] **Не добавлены** новые персонажи (только Lilana/Safira)
- [ ] **Не добавлены** новые локации (только Atrium)
- [ ] **Не реализован** Phase 3 AI chat
- [ ] **Не сгенерены** новые художественные ассеты (используются существующие Safira + chain.png + cathedral.jpg)
- [ ] **Не сделан** sound design / музыка
- [ ] **Не сломаны** legacy v1 localStorage ключи (`match3_params`, `match3_audio`, `match3_haptic`)
