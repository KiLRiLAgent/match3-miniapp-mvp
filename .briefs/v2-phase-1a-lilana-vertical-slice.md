# Feature Brief: v2 Phase 1A — Lilana Vertical Slice

## Intent

Доказать, что весь стек v2 (Hub → StoryMap → Location → Dialogue → Combat с цепями → PostCombat) работает end-to-end на одном полностью прорисованном персонаже — **Лилане «Седьмой Грех» Вороновой**. Это первый играбельный кусок «Университета Падших», который игрок может полностью пройти от знакомства до кульминации.

После этой фазы пользователь, переключив toggle в настройках на v2, должен увидеть HubScene → начать историю с Лиланой → пройти 3 акта диалогов → инициировать бой с цепями → победить или проиграть → получить relationship delta → вернуться в hub. Без Сафиры v2-арки, без отдельного инвентаря, без shop — только основной story-loop.

Каждая система, написанная здесь (DialogueRunner, RelationshipSystem, EncounterBuilder, ChainOverlay, GameScene encounterContext patch), будет переиспользована для остальных персонажей в Phase 1B/1C.

## Audience

- **Игроки v2** — те, кто переключил toggle в SettingsPanel на «Университет (β)». Они получают первый играбельный сюжетный контент.
- **Геймдизайнер v1** — должен видеть **ноль регрессий** в v1 Arena после этого изменения.
- **Лид/разработка v2** — после успеха этого slice знают, что архитектура работает, и могут масштабировать на остальной контент.

## Success Criteria

### Гейм-флоу (E2E happy path)

- [ ] С чистым localStorage игра стартует в v1 точно так же, как сейчас. Никаких регрессий.
- [ ] Игрок открывает SettingsPanel → переключает «Режим игры» на v2 → reload → видит **полноценный** HubScene (не stub Phase 0) с greeting от SaveData и кнопкой «К карте кампуса».
- [ ] HubScene → StoryMapScene показывает одну разблокированную локацию **«Атриум»** (placeholder rect + label). Тап на локацию → LocationScene.
- [ ] LocationScene «Атриум» показывает фон (placeholder), один кликабельный hotspot **«Лилана»**. Тап на hotspot → DialogueScene.
- [ ] DialogueScene запускает первый диалог Лиланы (Act 1). Игрок видит её портрет (placeholder), реплику в SpeechBubble (переиспользованный компонент), три варианта выбора. Каждый выбор меняет relationship delta (empathy/dominance/cynicism) и ведёт к следующей реплике.
- [ ] Завершение Act 1 → возврат на StoryMap. Локация «Атриум» помечена как «Лилана: 1/3 актов».
- [ ] Повторный заход в локацию → доступен Act 2. Три акта (Act 1 → Act 2 → Act 4 — пропускаем Act 3 для первого slice). Финальный Act 4 → DialogueScene заканчивается trigger battle.
- [ ] Trigger battle → CombatBridgeScene собирает CombatContext (encounterDef + relationship state) → `scene.start("GameScene", { encounterContext })`.
- [ ] GameScene в режиме encounter использует **boss stats из EncounterDef**, а не из `GAME_PARAMS.boss`. На поле появляются **8 цепей** по периметру (placeholder ChainOverlay).
- [ ] Игрок может матчить тайлы под цепями нормально. Матч РЯДОМ с цепью наносит ей 1 урон, цепь уменьшается визуально, при HP=0 — particle effect и удаление.
- [ ] Пока на поле есть активные цепи — HP босса не падает ниже 20% (threshold блокирует, отображается «BLOCKED BY CHAINS» при попытке).
- [ ] После уничтожения всех цепей блок снимается, игрок может добить босса.
- [ ] Победа/Поражение → НЕ переход в IntroScene, а emit event → CombatBridgeScene → PostCombatScene.
- [ ] PostCombatScene показывает: XP получено, relationship delta для Лиланы (анимированный counter), 1 предмет лута (placeholder text), кнопка «Продолжить» → возврат в DialogueScene на post-battle node ИЛИ в StoryMap.
- [ ] После завершения арки Лиланы — locations/Атриум помечен как «пройден», на StoryMap появляется опция «Новая игра» или «Продолжить» (пока без реального unlock новых локаций — это для Phase 1B).
- [ ] Из любой v2 сцены можно вернуться в HubScene и оттуда — в SettingsPanel (через шестерёнку или отдельную кнопку), переключить обратно на v1.

### Системы и архитектура

- [ ] `src/v2/content/types.ts` — полные TypeScript интерфейсы: `CharacterDef`, `LocationDef`, `EncounterDef`, `DialogueGraph`, `DialogueNode` (line/choice/battle/end), `ConditionExpr`, `EffectExpr`, `RelationshipDelta`, `CombatContext`, `LootEntry`.
- [ ] `src/v2/content/characters/lilana.ts` — полный профиль Лиланы (имя, архетип, бэкстори для будущего AI prompt, личность, voiceGuidelines, relationshipThresholds, asset keys для placeholder).
- [ ] `src/v2/content/dialogues/{lilana-act1.ts, lilana-act2.ts, lilana-act4.ts}` — три диалога, по 5-10 нод каждый, с реальным русским текстом в стилистике плана (драматизм, цитаты).
- [ ] `src/v2/content/encounters/lilana-act4.ts` — EncounterDef с boss stats, ability pattern, 8 цепями (initial placement + HP) и lootTable.
- [ ] `src/v2/content/locations/atrium.ts` — LocationDef с описанием, hotspots массивом (где сидит Лилана + время дня).
- [ ] `src/v2/systems/DialogueRunner.ts` — интерпретатор графа: current/advance/selectChoice(idx)/applyEffects/evaluateCondition/resolveText (с подстановкой `{{playerName}}`, `{{pronoun}}`).
- [ ] `src/v2/systems/RelationshipSystem.ts` — applyDelta(characterId, delta), getState(characterId), hasReached(characterId, axis, threshold). Пишет в `SaveData.relationships`.
- [ ] `src/v2/systems/StoryFlags.ts` — set/get/has/inc флаги в `SaveData.story.flags`.
- [ ] `src/v2/systems/EncounterBuilder.ts` — единственная точка склейки `CombatContext` из `PlayerSave + EncounterDef + RelationshipState`. Передаёт frozen object в GameScene.
- [ ] `src/v2/scenes/HubScene.ts` — переписан с Phase 0 stub в полноценный hub: greeting, кнопки «К карте» и «← Вернуться в v1». Использует `this.cameras.main.width/height` (НЕ GAME_WIDTH).
- [ ] `src/v2/scenes/StoryMapScene.ts` — рендерит локации (Phase 1A — одна, Атриум). Тап → LocationScene.
- [ ] `src/v2/scenes/LocationScene.ts` — рендерит фон + NPC hotspots. Тап на hotspot → DialogueScene.
- [ ] `src/v2/scenes/DialogueScene.ts` — получает DialogueRunner через `data`, рендерит через SpeechBubble + DialogueChoiceButton, обрабатывает node типа `battle` через переход в CombatBridgeScene.
- [ ] `src/v2/scenes/CombatBridgeScene.ts` — собирает CombatContext через EncounterBuilder, делает `scene.start("GameScene", { encounterContext })`, слушает event для возврата.
- [ ] `src/v2/scenes/PostCombatScene.ts` — показывает результат боя: XP, relationship delta, loot, кнопка «Продолжить».
- [ ] `src/v2/ui/ChainOverlay.ts` — рендер цепей поверх Match3 board. Depth `1.2` (между тайлами и hints). Один Image per chain position, 3 sprite states (1/2/3 HP). Placeholder = цветной квадрат с числом HP.
- [ ] `src/v2/ui/DialogueChoiceButton.ts` — кнопка выбора в диалоге. Один class (не PerkCard reuse), показывает текст и delta hints (опционально).
- [ ] `src/v2/ui/CharacterPortrait.ts` — sprite с emotion swap, used в DialogueScene. Placeholder = цветной круг с буквой имени.
- [ ] `src/v2/ui/RelationshipMeter.ts` — три маленькие полоски (empathy/dominance/cynicism) в PostCombatScene. Использует тот же per-corner radius pattern что Meter/LayeredMeter.
- [ ] `src/match3/types.ts` — добавлен `Chain` interface (`{pos, hp, variant}`).
- [ ] `src/match3/Board.ts` — обратно совместимое расширение: `placeChains/getDamagedChains/damageChains/hasActiveChains`. Существующая bomb-логика — template для chain logic. БЕЗ изменения существующих методов.
- [ ] `src/scenes/GameScene.ts` — **минимальный feature-gated патч**: ветка `if (this.encounterContext)` для override stats, chain handling в `resolveBoard`, emit event вместо перехода в IntroScene в `showVictory/showDefeat`. Все правки помечены комментарием `// v2:`.

### Качество и регрессии

- [ ] **Zero-disruption v1**: после `git pull` любой регрессионный smoke-test v1 (чистый localStorage → IntroScene → GameScene → 5 ходов → бой Сафиры → исход) проходит идентично состоянию до Phase 1A. Никаких визуальных или поведенческих отличий.
- [ ] `npm run build` проходит без TypeScript ошибок.
- [ ] v2 chunk вырастает (с ~5 KB до ~30-50 KB примерно), но v1 chunk остаётся ≤130 KB.
- [ ] Все новые async пути в v2 имеют try/finally или try/catch с гарантированным cleanup (см. `.conventions/gold-standards/phaser-animation.ts` секция 8).
- [ ] Никаких geometry masks внутри Container — `.conventions/anti-patterns/avoid-container-mask.md`.
- [ ] Никаких magic numbers — `.conventions/anti-patterns/avoid-magic-numbers.md`.
- [ ] Naming: `draw*` для render, `animate*` для async animation, `is*/can*` для booleans (`.conventions/checks/naming.md`).
- [ ] Imports: relative paths, no circular (`.conventions/checks/imports.md`).
- [ ] v2 isolation: `src/scenes/*` НЕ импортирует `src/v2/*` (`.conventions/checks/v2-isolation.md`).
- [ ] SaveData schema unchanged (version=1) — никаких миграций в этом slice. Phase 1A только READS из existing SaveData fields, никаких новых полей.
- [ ] `docs/` пересобран и включён в финальный коммит (GitHub Pages деплой).

## Exclusions

- ❌ **Сафира v2 арка** — её 4-актная история и rematch с цепями. Только Лилана в Phase 1A.
- ❌ **Каэль и Морган** — оставлены на Phase 2.
- ❌ **Inventory UI / InventoryScene** — лут падает в PostCombatScene как text-only badge, без отдельного экрана. Equipment slots, item icons, стат aggregation — Phase 1B.
- ❌ **ShopScene** — нет магазина. Soulshards/Stars не вводятся.
- ❌ **CharacterRosterScene** — нет галереи персонажей.
- ❌ **Time-of-day расписание NPC** — все hotspots всегда доступны, без утра/вечера/ночи.
- ❌ **Player customization** — no PrologueScene с выбором gender/name. Используется default из `SaveManager.createDefaultSaveData()`: name = "Падший", gender = "nb".
- ❌ **AI чат** (Phase 3).
- ❌ **Cloud save / Telegram CloudStorage** (Phase 4).
- ❌ **Реальные ассеты** — все портреты, фоны, иконки цепей, иконки предметов — **placeholder** (цветные прямоугольники с текстовыми лейблами). Реальный арт подставляется ПОСЛЕ в отдельном PR без изменения логики.
- ❌ **Изменения в `src/scenes/IntroScene.ts`, `src/scenes/BootScene.ts` (за исключением routing)** — никаких рефакторингов ради v2.
- ❌ **Изменения в `src/match3/Board.ts` методов кроме chain-методов** — без затрагивания `findMatches`, `swap`, `applyClearOutcome`, `collapseGrid` логики. Только новые методы добавляются.
- ❌ **Изменения в `src/game/PerkManager.ts`, `src/game/BossAbility.ts`, `src/game/config.ts` GAME_PARAMS** — v2 берёт boss stats из EncounterDef, не трогает global config.
- ❌ **Локализация (i18n)** — только русский. Все строки inline в TS-файлах контента.
- ❌ **Cascade interruption через perks в v2 боях** — пока нет, перки в v2 боях работают как в v1 (in-combat reset).

## Additional Context

### Сюжет Лиланы (вход для писателя/AI)

**Архетип:** ice queen с трещиной — староста потока, перфекционистка, тайно ненавидит себя за прошлое.

**Истинная форма:** Серафим Гордыни — шесть огненных крыльев, золотая броня, лицо закрыто маской из расплавленного света. Когда-то была одним из высших ангелов суда.

**Грех/причина изгнания:** осудила невинную душу из гордыни, отказавшись пересмотреть приговор. Бог изгнал её «в тело смертной, чтобы научилась сомневаться». Татуировка-печать на ключице (семиугольная звезда) — символ её ангельского ранга.

**Стартовая позиция отношений:** -10 (презрение к игроку, считает его бесполезным новичком).

**Арка (3 акта в Phase 1A):**
1. **Act 1 — Холодная встреча.** Лилана отчитывает игрока за опоздание на лекцию в Атриуме. Три варианта ответа: empathy (искренне извиниться, +5 emp), dominance (огрызнуться, +6 dom), cynicism (отмахнуться, +5 cyn). Заканчивается возвратом на StoryMap.
2. **Act 2 — Трещина.** Игрок повторно встречает её в Атриуме, она обронила что-то важное (дневник?), реплика-признание о её прошлом. Три варианта ответа продолжают накапливать relationship. Заканчивается trigger «доступна Act 4».
3. **Act 4 — Кульминация.** В Атриуме (для Phase 1A — без отдельной локации Часовни). Эмоциональный пик, истинная форма прорывается, trigger battle. После боя — PostCombat → возврат в DialogueScene на эпилог-нод (короткая реплика результата) → StoryMap.

**Бой Лиланы (EncounterDef):**
- HP: 600 (9 слоёв × ~67 HP, layerMultipliers по умолчанию)
- Pattern: преимущественно `attack` + `shield` (медленная и тяжёлая)
- Chains: 8 железных цепей по периметру 8×7 поля. HP цепи = 2.
- Threshold: пока цепи живы — HP не падает ниже 20%
- Reward: XP 150, 1 placeholder loot item (Phase 1A — text only, не нужен item icon)
- Relationship impact: победа = +10 empathy если cynicism < 30, иначе +5 dominance; поражение = -5 empathy

**Стилистика диалогов** — см. `~/.claude/plans/iridescent-riding-pudding.md` и геймдизайн-документ. Лилана: книжная лексика, формальная, длинные предложения. Подсветка ключевых слов через `highlights` в SpeechBubble.

### Технические опоры (готовые компоненты)

- **`src/ui/SpeechBubble.ts`** — переиспользуется в DialogueScene. Уже поддерживает highlights, fadeIn/fadeOut, multi-line wrap.
- **`src/ui/PerkCard.ts`** — пример паттерна 3-выбор карточек. Можно использовать как образец для DialogueChoiceButton (но не наследовать — у диалога другая семантика).
- **`src/ui/Meter.ts` / `src/ui/LayeredMeter.ts`** — образец per-corner radius pattern для RelationshipMeter.
- **`src/match3/Board.ts`** — существующая bomb-defuse логика (`getAdjacentBombs`) — точный template для chain логики.
- **`src/scenes/IntroScene.ts`** — образец cinematic архитектуры с async/await, skip via tap.
- **`src/utils/helpers.ts`** — `tweenPromise`, `wait`, `createPulseController` — обязательное переиспользование.

### Размещение цепей в Лилана encounter

8 позиций на 8×7 поле, по периметру (формирующие «корону» вокруг центра):

```
Cells (x,y) — индексы 0..7 по X, 0..6 по Y:
(2,0) (5,0)
(0,2)       (7,2)
(0,4)       (7,4)
(2,6) (5,6)
```

Это создаёт визуальный рисунок, что Лилана «защищена со всех сторон» — игрок должен системно прорываться к центру.

### Placeholder арт стандарт

- **Портреты персонажей:** круг 200×200 px с одной буквой имени по центру (Л — Лилана, П — Player). Цвет фона по эмоции: neutral=серый, cold=синий, angry=красный, surprised=жёлтый.
- **Фоны локаций:** сплошной цветной прямоугольник с текстом-названием по центру. Атриум = тёмно-фиолетовый `#2a1f4e`.
- **Цепи:** серый квадрат 46×46 с числом HP в центре (1/2/3). Полупрозрачный alpha 0.7.
- **Иконки предметов:** не нужны для Phase 1A — лут отображается текстом.
- **Карта кампуса:** нет — StoryMapScene рисует один интерактивный кружок с подписью «Атриум».

Все плейсхолдеры реализуются через `Phaser.GameObjects.Graphics` или `Phaser.GameObjects.Text` без загрузки внешних PNG. Никаких новых записей в `ASSET_KEYS` для Phase 1A.

## Project Context

**Stack:** Phaser 3.88 + TypeScript 5.9 strict + Vite 7. Telegram Mini App. GitHub Pages deploy через `docs/` folder.

**Scene infrastructure (Phase 0 готов):**
- `BootScene.routeToActiveMode()` — routing через `getActiveMode()`. v1 → IntroScene, v2 → lazy `await import("../v2") → registerV2Scenes → HubScene`.
- `src/v2/index.ts` — entry point, экспортирует `registerV2Scenes(game)`. Phase 1A добавляет в этот файл регистрацию новых сцен (StoryMap, Location, Dialogue, CombatBridge, PostCombat).
- `src/v2/core/SaveManager.ts` — единая точка чтения/записи v2 state. SaveData v1 schema (player/inventory/story/relationships/ai/settings/stats) уже задана. Phase 1A только читает/пишет существующие поля.
- `src/v2/core/SceneRouter.ts` — push/pop/replace стек.
- `src/v2/core/EventBus.ts` — typed pub/sub для cross-scene событий. Phase 1A добавит events: `combat:complete`, `dialogue:choice`, `relationship:changed`.
- `src/v2/core/GameState.ts` — singleton фасад над SaveManager + EventBus.
- `src/game/version.ts` — `getActiveMode/setActiveMode` toggle через SettingsPanel.

**Conventions (соблюдать обязательно):**
- `.conventions/checks/v2-isolation.md` — границы импортов между v1 и v2.
- `.conventions/checks/naming.md` — naming rules.
- `.conventions/checks/imports.md` — import order, no circular.
- `.conventions/gold-standards/phaser-animation.ts` — async/await chains, busy flag, error recovery patterns (section 8).
- `.conventions/gold-standards/ui-component.ts` — Container-based UI, fillRadius() helper, trailing delta pattern.
- `.conventions/gold-standards/cascade-interruption.ts` — паттерн mid-cascade перков (для cascade-интеракций в v2 если будут).
- `.conventions/anti-patterns/avoid-container-mask.md` — НИКАКИХ geometry masks в Container (RelationshipMeter, ChainOverlay).
- `.conventions/anti-patterns/avoid-magic-numbers.md` — UPPER_SNAKE константы.
- `.conventions/anti-patterns/avoid-hardcoded-textures.md` — ASSET_KEYS для всех текстур.

**Мастер-план:** `~/.claude/plans/iridescent-riding-pudding.md` — полный roadmap v2. Phase 1A — это первая часть Phase 1 из плана.

**Build:** `npm run build` (TypeScript strict + Vite). После build — `git add docs/ && git commit && git push origin dev-v2` (per user memory: GitHub Pages deploy).

**Branch:** `dev-v2`. Все коммиты Phase 1A пушатся сюда.

---

## Review Checklist (для code reviewers)

### Архитектура
- [ ] `src/scenes/*` НЕ импортирует `src/v2/*` (кроме существующего `await import` в BootScene).
- [ ] `src/v2/*` импортирует v1 как библиотеку: `match3/`, `ui/`, `game/`, `utils/`, `telegram/`, `scenes/GameScene.ts`.
- [ ] Все правки `GameScene.ts` помечены `// v2:` и завёрнуты в `if (this.encounterContext)`. Без encounterContext поведение идентично v1.
- [ ] `Match3Board` chain-методы добавлены без изменения существующих `findMatches/swap/applyClearOutcome/collapseGrid`. Тайлы под цепями матчатся нормально (как тайлы НЕ под бомбами).
- [ ] `EncounterBuilder` — единственная точка склейки stats. GameScene получает frozen object через `data.encounterContext`, не мутирует global.
- [ ] `SaveManager.patch()` используется для всех мутаций SaveData. Нет прямого `localStorage.setItem` в v2 коде.

### Системы
- [ ] `DialogueRunner` корректно применяет effects (setFlag, addEmpathy, addDominance, addCynicism), evaluateCondition (flag, empathyGte, etc.) и resolveText с подстановкой `{{playerName}}`.
- [ ] `RelationshipSystem.applyDelta` пишет в `SaveData.relationships[characterId]` через `gameState.patch`. `getState` возвращает default state если character ещё не встречался.
- [ ] `StoryFlags` пишет в `SaveData.story.flags` через `gameState.patch`.
- [ ] Match3Board `getDamagedChains(positions)` структурно аналогичен `getAdjacentBombs` (4 ortho directions adjacency). `damageChains` уменьшает HP, удаляет broken, возвращает `{broken, remaining}`.

### Сцены
- [ ] HubScene использует `this.cameras.main.width/height`, НЕ `GAME_WIDTH/HEIGHT` (см. fix 20b70c4).
- [ ] StoryMapScene отображает Атриум как кликабельный круг (placeholder), тап → LocationScene с правильным locationId.
- [ ] LocationScene получает locationId через `data`, рендерит фон + hotspots из `LocationDef`. Тап на hotspot → DialogueScene с правильным dialogueId.
- [ ] DialogueScene получает dialogueId через `data`, инициализирует DialogueRunner, рендерит current node через SpeechBubble + DialogueChoiceButton. Тап на choice → applyEffects + advance + re-render.
- [ ] Node типа `battle` → переход в CombatBridgeScene с EncounterDef.
- [ ] CombatBridgeScene собирает CombatContext, делает `scene.start("GameScene", { encounterContext })`. Слушает event `combat:complete` для возврата.
- [ ] PostCombatScene получает CombatResult через `data`, показывает XP/loot/relationship delta, кнопка «Продолжить» → возврат в DialogueScene на post-battle node ИЛИ StoryMap.

### GameScene patches
- [ ] `effectivePlayerStats()` и `effectiveBossStats()` getters использованы вместо прямого `GAME_PARAMS.player.*` / `GAME_PARAMS.boss.*` на critical paths (resetState, applyDamage*, HUD update).
- [ ] В `resolveBoard` после `applyClearOutcome` — обработка chains (только если `this.board.hasActiveChains`).
- [ ] В `applyDamageToBoss` — threshold `chainBlockedHpRatio * effectiveBossMaxHp` пока есть active chains. Floating text «BLOCKED BY CHAINS» при попытке.
- [ ] `showVictory`/`showDefeat` — если `this.encounterContext.onComplete` или есть `combat:complete` event, не делать `scene.start("IntroScene")`, а emit event для CombatBridgeScene.

### UI компоненты
- [ ] `ChainOverlay` рендерит цепи поверх board, depth 1.2 (между тайлами и hint overlays). Обновляется при изменении chain HP.
- [ ] `DialogueChoiceButton` — кликабельная зона с текстом выбора. Без masks. Уважает SAFE_AREA.
- [ ] `CharacterPortrait` — Image с emotion swap. Placeholder = Graphics circle с текстом. Без masks.
- [ ] `RelationshipMeter` — три полоски, использует тот же `fillRadius()` pattern что Meter/LayeredMeter (`.conventions/gold-standards/ui-component.ts` секция 2a).

### Регрессии (smoke test обязателен)
- [ ] С чистым localStorage → BootScene → IntroScene → GameScene → 5 ходов → бой Сафиры → визуально и поведенчески идентично состоянию до Phase 1A.
- [ ] SettingsPanel в v1 GameScene открывается, новая секция «Режим игры» работает, обратный toggle на v1 работает.
- [ ] `npm run build` проходит без TypeScript ошибок и warnings.

### Контент
- [ ] Лилана content TS-файлы соответствуют типам, проходят strict check.
- [ ] Все три акта диалога имеют минимум 5 нод, минимум 2 choice points, корректные delta. Тексты на русском, в стилистике Лиланы (книжная лексика, длинные предложения).
- [ ] EncounterDef для Лилана-Act4 содержит 8 цепей, корректные позиции, HP 2.

### Финал
- [ ] `docs/` пересобран после `npm run build`.
- [ ] Все коммиты pushed в `origin/dev-v2`.
- [ ] В каждом коммите мессендж содержит `feat(v2):` или `fix(v2):` префикс.
- [ ] План `~/.claude/plans/iridescent-riding-pudding.md` обновлён: Phase 1A статус → completed.
