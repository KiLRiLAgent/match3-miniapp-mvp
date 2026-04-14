# Feature Brief: v2 Phase 1C — Resilience, Data Safety & UX Polish

## Intent

После Phase 1B (ProgressionSystem / InventorySystem / новые сцены) команда провела post-mortem-аудит v2 кода (исключая Match3 механику). Найдено **14 реальных issues**, которые делятся на три тематические оси:

1. **Content Validation & Robustness** — игрок может застрять в диалоге или потерять прогресс если контент-автор сделал опечатку. Сейчас все ошибки контента всплывают только в момент когда игрок до них доходит, без fallback.
2. **Data Safety** — есть несколько мест где состояние может разрушиться или потеряться без feedback (двойной apply наград, quota exceeded, orphan inventory references, кривой импорт сейва).
3. **UX & Visibility** — игрок не видит критичных вещей: прогресс XP в Hub, не помещается рюкзак при ≥5 предметах, ошибки уходят в console.warn без UI-feedback.

Цель Phase 1C: **сделать v2 устойчивым к контентным ошибкам и невидимым data-loss, добавить базовую UI-видимость прогресса**. Без новых геймплейных фич, только robustness + visibility.

## Audience

- **Игроки** — перестают терять прогресс, видят XP на главном экране, видят весь рюкзак, получают понятные сообщения об ошибках вместо чёрного экрана.
- **Контент-авторы (включая будущего ИИ-генератора Phase 3)** — получают мгновенный фидбек о dangling references при загрузке игры, а не через 30 минут плейтеста.
- **Разработчики (мы)** — спокойно делаем Phase 1C+ контент, зная что система расскажет о любой ошибке сразу.

## Success Criteria

### Content Validation & Robustness (Пакет 1)

- ✅ При первом запуске v2 (`registerV2Scenes`) выполняется валидация всех контент-реестров: каждая `choice.next`, `node.next`, `onVictory`, `onDefeat`, `encounterId`, `characterId`, `dialogueId`, `itemDefId` указывает на существующую сущность. Если найдена dangling ссылка — throw в console с понятным сообщением: `"DialogueGraph 'lilana-act1': choice 'empathy_path' references missing node 'branch_xyz'"`. Игра не запускается до фикса.
- ✅ Если игрок попадает в choice-ноду где `getAvailableChoices()` вернул пустой массив (все условия false) — DialogueScene показывает кнопку «← Вернуться в Hub» вместо застывания. Логирует warning с указанием диалога/ноды.
- ✅ Если CombatBridgeScene получает несуществующий `encounterId` — вызывает `runner.reportBattleResult(false)` (или эквивалент) и переходит на defeat-эпилог, **НЕ** возвращается в DialogueScene на ту же battle-ноду.
- ✅ `DialogueRunner.applyEffects` оборачивает каждый `applySingleEffect` в try-catch: ошибка одного эффекта **НЕ** прерывает остальные. Failed эффекты логируются с указанием dialogueId/nodeId/effectType.

### Data Safety (Пакет 2)

- ✅ `CombatBridgeScene.handleCombatComplete` имеет idempotency guard: если коллбэк вызван повторно для того же CombatResult — игнорируется. Тест: вручную вызвать колбэк дважды → награды применяются один раз.
- ✅ `SaveManager.save()` при `QuotaExceededError` устанавливает флаг `saveFailed` и **НЕ** проглатывает ошибку молча. Game emit-ит событие `saveError` через EventBus, новый компонент Toast показывает игроку понятное сообщение «Не удаётся сохранить прогресс — память переполнена».
- ✅ `InventorySystem` имеет метод `removeItem(instanceId): boolean`. Метод удаляет предмет из `inventory.items` И автоматически очищает любые `equipped` слоты, где он стоит. Тест: equip → removeItem → getEquipped возвращает null.
- ✅ `SaveManager.importJson` валидирует структуру через светлую schema-проверку (без внешних библиотек): проверяет существование `player.stats`, `inventory.items[]`, `inventory.equipped`, `relationships`, `story.flags`. На failure возвращает `{ ok: false, error: "..." }`. Не падает с TypeError при обращении к undefined.

### UX & Visibility (Пакет 3)

- ✅ В HubScene под greeting добавлен XP-bar (тонкая полоса 200×8 DPR-px) с подписью `{xp} / {xpToNext} XP до уровня {N+1}` или `МАКС`. Использует уже существующий `progressionSystem.getLevelEntryXp()`.
- ✅ В PlayerStatsScene при ≥5 предметах рюкзак скроллится: добавлен Phaser Container с `setMask` или scrollable list. Тест: добавить 8 предметов через dev-консоль → весь список доступен прокруткой.
- ✅ Создан компонент `src/v2/ui/Toast.ts` — non-blocking notification (top-of-screen, fade-in/fade-out 3s). Использован для save errors, content errors, asset errors.
- ✅ `LocationScene` и `HubScene` при отсутствии preloaded background показывают визуально-видимый fallback: тёмно-фиолетовый градиент с placeholder-текстом «загрузка фона» вместо чёрного экрана.
- ✅ `RelationshipSystem.logDecision` дополнительно к count-cap (50) фильтрует по timestamp: записи старше 30 дней удаляются при следующей записи. Тест: вручную добавить старую запись → следующий logDecision её удалит.

## Exclusions

- **НЕ трогать match3 механику**: Board.ts, GameScene.ts, types.ts (TileKind, Match), animations.ts, BossAbility.ts. Любые изменения в `src/scenes/`, `src/match3/`, `src/game/`, `src/ui/` (v1 ui), `src/utils/` — запрещены, кроме случаев когда это необходимо для интеграции (согласовать с tech-lead).
- **НЕ добавлять новый контент**: ни новых диалогов, ни персонажей, ни локаций, ни предметов. Только инфраструктура.
- **НЕ переписывать ProgressionSystem / InventorySystem / RelationshipSystem с нуля**: только точечные дополнения (`removeItem`, `getLevelEntryXp` уже есть).
- **НЕ делать full settings panel**: настройки аудио/языка остаются как есть.
- **НЕ рефакторить SceneRouter под full-stack-management**: уже добавлен `setRoot()` в hot-fix `714466d`, остальное не трогать.
- **НЕ менять SAVE_VERSION** если только не появится действительно required field в SaveData. Все новые методы (removeItem, schema validation) — runtime-only, не схема.
- **НЕ внедрять внешние зависимости** для schema validation. Использовать ручные TypeScript guards.

## Additional Context

### Аудит: список 14 issues с file:line

| # | File:Line | Severity | Описание |
|---|-----------|----------|----------|
| C1 | DialogueScene.ts:319-323 | CRITICAL | Empty available choices → застывшая сцена |
| C2 | CombatBridgeScene.ts:69-73 | CRITICAL | Missing encounter → loop при повторном тапе battle-ноды |
| C3 | PostCombatScene.ts:83-88 | CRITICAL | Missing character/encounter → silent loss наград |
| C4 | DialogueRunner.ts:57-64 | CRITICAL | Dangling node refs не валидируются |
| S1 | CombatBridgeScene.ts:105-137 | MAJOR | Нет double-call guard в handleCombatComplete |
| S2 | SaveManager.ts save() | MAJOR | Quota exceeded silent failure |
| S3 | DialogueRunner.ts:250-253 | MAJOR | Эффекты не атомарны (mid-chain throw) |
| S4 | InventorySystem.ts | MAJOR | Нет removeItem → orphan equipped refs |
| S5 | SaveManager.ts importJson | MAJOR | Нет schema validation |
| U1 | HubScene.ts | MINOR | Нет XP-индикации в Hub |
| U2 | LocationScene.ts:91-105 | MINOR | Нет fallback на сетевую ошибку фона |
| U3 | PlayerStatsScene.ts | MINOR | Рюкзак не скроллится при ≥5 предметах |
| U4 | RelationshipSystem.ts | MINOR | decisionLog растёт без time-trim |
| U5 | Все сцены | MINOR | Нет toast-системы для пользовательских ошибок |

### Архитектурные подсказки для команды

**Валидация контента** (Пакет 1):
- Создать `src/v2/content/validate.ts` с одной публичной функцией `validateContent(): { ok: true } | { ok: false, errors: string[] }`.
- Вызвать из `registerV2Scenes` ДО регистрации сцен. На failure — throw с агрегированным списком ошибок.
- Проверять: DIALOGUES (все node.next, choice.next, onVictory, onDefeat → существующие nodes; battle.encounterId → ENCOUNTERS), ENCOUNTERS (characterId → CHARACTERS), LOCATIONS (hotspots.dialogues[].dialogueId → DIALOGUES), ITEMS (slot ∈ valid values).

**Toast компонент** (Пакет 3):
- `src/v2/ui/Toast.ts` — singleton manager, экспортирует `showToast(scene, message, type: "info" | "warn" | "error")`. Создаёт top-anchored Container поверх текущей сцены с auto-fade. Не блокирует input.
- Использовать в SaveManager (через EventBus), DialogueRunner (failed effects), CombatBridgeScene (missing encounter), LocationScene (asset errors), DialogueScene (empty choices fallback).

**EventBus** (уже есть `src/v2/core/EventBus.ts`):
- Добавить новые event types: `saveError`, `contentError`, `assetError`. SaveManager / DialogueRunner / asset loaders emit, Toast подписывается.

**Idempotency guard в CombatBridgeScene** (Пакет 2):
- Простой instance flag `private resultApplied = false;`. В начале `handleCombatComplete`: `if (this.resultApplied) return; this.resultApplied = true;`. Сбрасывается в `init` (новый бой = новый instance после scene.start).

**InventorySystem.removeItem** (Пакет 2):
- Сигнатура: `removeItem(instanceId: string): boolean`. Возвращает true если предмет был и удалён.
- Внутри: один `gameState.patch` который filter-ит items и зануляет matching equipped slots.

**Backpack scroll в PlayerStatsScene** (Пакет 3):
- Phaser имеет `RenderTexture` или ручной clipping через `setMask` с Graphics. Простейший вариант: scrollable Container с `setSize` + drag input handler.
- Альтернатива: paginate (предыдущая/следующая страница). Менее красиво, но проще. Пусть команда выберет.

### Project Context (для команды)

- **Стек**: Phaser 3.88 + TypeScript 5.9 strict + Vite 7. Telegram Mini App, frontend-only, нет backend.
- **v2 директория**: `src/v2/` (изолирована). Реестры контента: characters, dialogues, encounters, items, locations.
- **Singleton системы**: gameState (фасад над SaveManager), relationshipSystem, progressionSystem, inventorySystem. Все читают/пишут через `gameState.get()` / `gameState.patch()`.
- **Конвенции**: `.conventions/gold-standards/` (включая system-dependency-injection.ts, single-source-enrichment.ts, ui-component.ts с modal pattern §12 и tear-down refresh §13).
- **Бюджет чанков**: v1 main ≤135 kB (сейчас 132.77), v2 chunk ≤80 kB (сейчас 73.74). Phase 1C должна остаться в этих рамках.
- **Текущий статус**: Phase 1B завершена + hot-fix back button (`714466d`). dev-v2 ветка, push в origin.

---

## Review Checklist (для code reviewers)

### Content Validation & Robustness
- [ ] `src/v2/content/validate.ts` существует и экспортирует `validateContent()`
- [ ] `registerV2Scenes` вызывает `validateContent()` ДО регистрации сцен; на failure throw с агрегированным сообщением
- [ ] Тест: вручную сломать ссылку в `lilana-act1.ts` (опечатка в choice.next) → запуск игры падает с понятной ошибкой, указывающей на dialogue+node+choice
- [ ] DialogueScene: при пустых choices показывает кнопку «← В Hub» вместо застывания
- [ ] CombatBridgeScene: при missing encounter переходит на defeat path, не возвращается в dialogue
- [ ] DialogueRunner.applyEffects оборачивает каждый эффект в try-catch с per-effect логом

### Data Safety
- [ ] `CombatBridgeScene.handleCombatComplete` имеет flag `resultApplied`, второй вызов игнорируется
- [ ] SaveManager.save при quota exceeded emit-ит `saveError` через EventBus, не молчит
- [ ] `InventorySystem.removeItem(id)` существует, auto-cleanup equipped slots, возвращает boolean
- [ ] Тест: equip предмет → removeItem(его id) → getEquipped(slot) возвращает null
- [ ] `SaveManager.importJson` валидирует схему; не падает с TypeError на кривом JSON

### UX & Visibility
- [ ] HubScene показывает XP-bar под greeting с подписью или «МАКС»
- [ ] PlayerStatsScene рюкзак скроллится/пагинируется при ≥5 предметах
- [ ] `src/v2/ui/Toast.ts` существует, использован минимум в SaveManager и DialogueRunner
- [ ] LocationScene/HubScene показывают visible fallback при missing background asset (не чёрный экран)
- [ ] RelationshipSystem.logDecision удаляет записи старше 30 дней при следующей записи
- [ ] v1 chunk ≤135 kB, v2 chunk ≤80 kB

### Exclusions
- [ ] Match3-код (Board.ts, GameScene.ts, animations.ts, BossAbility.ts, src/match3/, src/game/, src/ui/) НЕ изменён, кроме согласованных интеграционных точек
- [ ] Нет нового контента (диалоги, персонажи, локации, предметы)
- [ ] SAVE_VERSION не повышен (если повышен — обоснование в DECISIONS.md)
- [ ] Нет внешних зависимостей для schema validation
- [ ] Нет full settings panel
- [ ] Нет рефакторинга SceneRouter сверх hot-fix `714466d`
