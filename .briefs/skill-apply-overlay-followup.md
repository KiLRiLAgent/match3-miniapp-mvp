# Feature Brief: skill-card-polish-and-pulse-cleanup (follow-up to skill-apply-overlay-rework)

## Intent

Привести в порядок визуал карточки подтверждения скила (`SkillApplyOverlay`) + панели скилов, и доделать VFX-светяшку для случая, когда берут **усиление** уже существующей способности. Это follow-up к предыдущему брифу `skill-apply-overlay-rework.md` (коммит `b80b823`): пользователь получил карточку, попользовался, обнаружил визуальные баги и недоделки.

## Audience

Все игроки v1 match3 (v2 через общий `GameScene` и общий `SkillApplyOverlay` в `src/ui/`).

## Success Criteria

### 1. Перенос по слогам русского языка

Длинные названия и описания на карточке скила (`SkillApplyOverlay`) разбиваются по правилам русского переноса (`Вос-ста-нав-ли-ва-ет`, `Мощ-ный`), а не обрезаются и не вылезают за границу.

**Конкретные тексты, на которых должно работать:**
- `«Восстанавливает здоровье»` (Heal description)
- `«Мощный удар»` (название скила)
- `«Наносит 100 физического урона»` (PowerStrike description — сейчас это и есть «Мощный удар сломан»)
- Любые другие текущие / будущие тексты в `SKILL_CONFIG`.

**Реализация:** pure helper `hyphenateRu(text: string, maxWidth: number, measureTextWidth: (s) => number): string[]` в `src/utils/ruHyphenate.ts`. Минимально достаточные правила:
- Не оставлять < 2 букв на строке (ни в начале, ни в конце).
- Разрыв между гласной и согласной (гласные: аеёиоуыэюяАЕЁИОУЫЭЮЯ).
- «ъ/ь/й» не переходят в начало следующей строки.
- Двойные согласные — разрыв между ними (бал-лон, груп-па).
- Если слово короче 4 букв — не переносить.

Применяется к `nameText` и `descText` в `SkillApplyOverlay.build()`. Заменяет текущий `setScale(rightMaxW / nameText.width)` auto-shrink.

### 2. Карточка зафиксирована над именем босса

`cardY` в `SkillApplyOverlay.build()` вычисляется так, что карточка стоит **над** текстом имени босса (`«Сафира пламя бездны»`), не ниже HP-бара босса как сейчас.

**Сейчас:** `cardY = UI_LAYOUT.bossHpBarY + UI_LAYOUT.hpBarHeight + 20 + CARD_H / 2` — под HP-баром, на уровне верха доски.
**Нужно:** привязать к `UI_LAYOUT.bossNameY` и поставить карточку **выше** этого текста, с небольшим gap (например, 12–16px).

Позиция статична, анимации появления нет.

### 3. Никакой пульсации, кроме работы с барами

**Убрать:**
- Пульс иконки-кружка на карточке (`iconBg` scale 1 → 1.08, 700ms yoyo repeat -1) — `SkillApplyOverlay.ts` строки 150–157.
- Пульс кнопки `«Применить!»` (`[btnGfx, btnHit, applyLabel]` scale 1 → 1.03, 800ms yoyo repeat -1) — `SkillApplyOverlay.ts` строки 290–298.
- Пульс scale на выбранной `SkillButton` (scale 1 → 1.12, 600ms yoyo repeat -1) — `GameScene.ts` строки 2164–2171.
- Зелёная пульсирующая рамка вокруг `playerAvatar` (`avatarHighlightGfx`, alpha 0.45 → 1.0, 600ms yoyo repeat -1) — `GameScene.ts` строки 2186–2204 (создание и tween) и 2226–2229 (destroy). Удалить создание, destroy-путь оставить defensive (gracefully no-op если `this.avatarHighlightGfx === undefined`).

**Оставить:**
- `LayeredMeter.showPreview()` на HP/MP/mana barах (показывает дельту: сколько маны уйдёт, сколько HP прибавится, сколько урона получит противник) — вызов в `openSkillHighlights`, cleanup в `closeSkillHighlights`.
- `LayeredMeter.flash()` после применения скила.

### 4. Выбранный скил — яркий над затемнением

Backdrop (`alpha 0.35`, depth 1500) продолжает затемнять всё (board, остальные skill buttons, boss, avatar). Но выбранная `SkillButton` должна быть **яркой над backdrop**:

- При `openSkillHighlights(id)`: выбранная кнопка `skillButtons[id]` поднимается на `depth 1501` (или выше overlay).
- **Без пульса, без смены alpha** — просто статично яркая.
- Остальные 3 кнопки остаются на depth 2, под backdrop (затемнены как сейчас).
- При `closeSkillHighlights()`: depth возвращается к 2 на всех 4 кнопках.

**Гонка с кликами:** выбранная кнопка при открытом overlay → `disableInteractive()` на время overlay (чтобы клик по яркой кнопке не создал race condition с `skillOverlayBusyToken`). В `closeSkillHighlights` → `setInteractive()` возвращается.

### 5. Mana cost badge на `SkillButton` — на границе кружка

**Сейчас:** на 4 кнопках внизу экрана иконка стоимости маны (капля с числом) висит не на границе кружка иконки скила — где-то внутри или сдвинута.

**Должно быть:** badge сидит на границе кружка, диагонально (как на `SkillApplyOverlay`). Референс позиционирования — `SkillApplyOverlay.ts` строки 161–175:
```ts
const BADGE_OFFSET = 23; // px diagonal from icon center
const badgeX = iconX - BADGE_OFFSET;
const badgeY = iconY - BADGE_OFFSET;
```

Применить тот же подход в `SkillButton.ts` — badge на ~23px диагонально от центра круга, что с ICON_SIZE 56px поставит его ровно на границе.

**Не применяется** к locked скилам (там вместо иконки — замок, badge не показывается).

### 6. VFX-светяшка при апгрейде существующей способности

**Уже работает** (НЕ трогать): при получении **новой** способности на месте карточки перка образуется золотая VFX-светяшка, летит со шлейфом к месту новой иконки в UI, там иконка «проявляется» — создаётся новая `SkillButton`.

**Нужно доделать:** при взятии **усиления** (level up) уже существующей способности:
- Светяшка запускается из той же точки (место карточки перка).
- Летит по тому же motion path (bezier / trail) к уже существующей иконке в панели скилов.
- При прилёте: **иконка вспыхивает / подсвечивается** (highlight flash) — не создаётся новая, а существующая реагирует золотой вспышкой.

**Референс визуала:** `https://youtu.be/VxmPM7PUUbE?si=QRN90OyPovWTRUEE&t=487`.

**Где это триггерится:** в `PerkManager` (или где там выбор перка) — когда выданный перк — это upgrade, а не unlock. Нужно найти callback, который сейчас создаёт иконку для нового скила, и разветвить: если скил уже в панели — использовать upgrade-VFX + flash на существующей `SkillButton`.

**Реализация flash на существующей иконке** — переиспользовать `SkillButton.flashIconPulse(durationMs)` (существует в коде), либо добавить `SkillButton.flashIconUpgrade()` с золотым оттенком (tint `0xffd700`) и коротким scale pulse (240ms, одноразовый, не loop).

## Exclusions

- **НЕ** трогать `LayeredMeter.showPreview()` / `.flash()` / `.clearPreview()` — работа с барами остаётся.
- **НЕ** трогать `flashPlayerAvatar()` (белая вспышка 100 мс при применении скила).
- **НЕ** менять функционал скилов: урон, хил, расход маны, перезарядка, cooldown, уровни.
- **НЕ** переписывать VFX для new-skill-unlock — он уже работает. Только добавить upgrade-вариант по тому же шаблону.
- **НЕ** менять схему `SKILL_CONFIG`, тексты названий/описаний скилов.
- **НЕ** менять backdrop alpha / цвет / размер.
- **НЕ** делать slide-in / fade-in анимацию появления карточки — мгновенное появление как сейчас.
- **НЕ** трогать v2 `Toast` / `ItemCardModal` — они на своих depth 2000 / 2100, их поведение не пересекается.

## Additional Context

- **«Мощный удар сломан»** — пользователь имел в виду **описание** (`«Наносит 100 физического урона»`), а не заголовок. Текст не вмещается в высоту карточки или вылезает сбоку. Решается п.1 (слоговый перенос с корректным wordWrap).
- **Зелёная рамка `playerAvatar`** (`avatarHighlightGfx`, коммит `b80b823`) читается пользователем как «мигание на здоровье» из-за совпадения цвета с HP bar. Убираем полностью; подсветка выбранного скила реализуется через depth-override п.4.
- **Backdrop остаётся полноэкранный alpha 0.35** — это нормальная «модалка» в игре, пользователь про него не жалуется. Менять нужно только *что выше* backdrop.

## Project Context

**Стек:** Phaser 3 + TypeScript + Vite. Telegram Mini App. Ветка `dev-v2`. Параллельно v1 и v2.

**Ключевые файлы:**
- `src/ui/SkillApplyOverlay.ts` (328 строк, depth 1500)
  - Убрать 2 пульса (icon circle + apply button).
  - Пересчитать `cardY` выше `UI_LAYOUT.bossNameY`.
  - Применить `hyphenateRu()` к `nameText` и `descText`.
- `src/scenes/GameScene.ts` (`openSkillHighlights` строка 2159, `closeSkillHighlights` строка 2209)
  - Убрать skill button scale pulse.
  - Удалить создание `avatarHighlightGfx` и его tween.
  - Добавить depth-override: `this.skillButtons[id]?.setDepth(1501); this.skillButtons[id]?.disableInteractive();`
  - В close: восстановить depth и interactive на всех 4 кнопках.
  - Подключить upgrade-VFX callback в PerkManager.
- `src/ui/SkillButton.ts`
  - Починить позицию mana cost badge — на границе круга, диагонально (как в SkillApplyOverlay: BADGE_OFFSET 23px).
  - Опционально: метод `flashIconUpgrade()` — золотой tint + 240ms scale pulse.
- `src/game/PerkManager.ts` (или где выбор перков)
  - Найти callback для upgrade vs unlock.
  - Подключить upgrade-VFX + `flashIconUpgrade()` на соответствующий `SkillButton`.
- VFX new-skill-unlock — найти текущий модуль (`src/ui/FlyingTile.ts` или отдельный), переиспользовать motion path.

**Новое:**
- `src/utils/ruHyphenate.ts` — pure helper, ~80–120 строк.

**Existing patterns для reviewer:**
- `LayeredMeter.showPreview()` / `clearPreview()` — актуальный API на barах.
- `createPulseController` из `src/utils/helpers.ts` — guarded pulse (не используется в overlay, используется в `CooldownIcon`).
- Cleanup tweens через `skillHighlightTweens[]` array + `preDestroy()` — уже реализован.

**Depth конвенции (актуальные):**
- 2: `SkillButton`
- 3: `playerAvatar`
- 4: HP/MP bars
- 4.5: `avatarHighlightGfx` — **удаляется** этим брифом
- 1500: `SkillApplyOverlay` (backdrop + card + button)
- 1501: выбранная `SkillButton` во время открытого overlay — **новый, добавляется этим брифом**
- 2000: v2 `Toast` (не трогать)
- 2100: v2 `ItemCardModal` (не трогать)

## Risks

1. **Слоговый перенос для русского без словаря** — упрощённые правила покрывают ~90% случаев. Для UI игры с ~10 скилами это приемлемо. Нужно вручную проверить все тексты в `SKILL_CONFIG` после реализации.
2. **Изменение `cardY` на min-экране (iPhone SE 375×667, или других маленьких безопасных зонах Telegram)** — если `bossNameY` близко к верху экрана, карточка может улететь за safe area. Нужен clamp: `cardY = Math.max(safeTop + CARD_H/2 + 8, UI_LAYOUT.bossNameY - 12 - CARD_H/2)`.
3. **Выбранная `SkillButton` на depth 1501** — она будет кликабельна во время открытого overlay, что создаст race condition с `skillOverlayBusyToken`. Решение: `disableInteractive()` при `openSkillHighlights`, `setInteractive()` при `closeSkillHighlights`.
4. **Upgrade-VFX если несколько upgrade'ов подряд** (например, после shuffle-over или события с мульти-выбором) — запускать светяшки параллельно (все иконки вспыхивают одновременно); это визуально понятнее.
5. **Bundle budget v1 ≤ 135 kB** — добавление `ruHyphenate.ts` (~1–2 kB) не должно выйти за бюджет. Новый VFX upgrade-флоу переиспользует существующий код, минимальный прирост.

---

## Review Checklist (для reviewer'ов)

- [ ] Тексты `«Восстанавливает здоровье»`, `«Мощный удар»`, `«Наносит 100 физического урона»` переносятся по слогам, не обрезаются, не вылезают за карточку.
- [ ] `hyphenateRu()` не оставляет 1 букву на строке; «ъ/ь/й» не в начале; короткие слова (<4 букв) не переносятся.
- [ ] Карточка стоит **над** именем босса на всех экранах (375×667, 480×800, 768×1024).
- [ ] На min-экране карточка не выходит за safe area top.
- [ ] Нет пульса иконки-кружка на карточке.
- [ ] Нет пульса кнопки «Применить!».
- [ ] Нет пульса scale на выбранной `SkillButton` при открытом overlay.
- [ ] Нет зелёной рамки на `playerAvatar` (ни статической, ни пульсирующей) — никогда, ни при каком скиле.
- [ ] Preview на HP/MP/mana barах при открытом overlay работает (показывает правильную дельту для каждого скила).
- [ ] Flash на барах после применения скила работает.
- [ ] При открытом overlay: выбранная кнопка — **яркая над backdrop**; остальные 3 — **затемнены** под backdrop.
- [ ] Клик по выбранной (яркой) кнопке во время overlay — **no-op** (не создаёт race с `skillOverlayBusyToken`).
- [ ] После `confirm` / `cancel` overlay: depth всех 4 skill buttons вернулся к 2, interactive — включён.
- [ ] Mana cost badge на `SkillButton` — на границе кружка, диагонально (совпадает с визуалом на `SkillApplyOverlay`).
- [ ] При взятии **нового** скила (unlock): золотая VFX-светяшка летит из карточки перка, прилетает, создаётся новая иконка — **работает как прежде, без регрессии**.
- [ ] При взятии **upgrade** существующего скила: светяшка летит из карточки перка, прилетает к **существующей** иконке, иконка вспыхивает золотым flash'ем — **новый поведение**.
- [ ] Функциональность скилов (урон, хил, расход маны, перезарядка, cooldown) не изменилась.
- [ ] Bundle: v1 chunk ≤ 135 kB (текущий 132.77 kB, запас ~2 kB).
- [ ] Нет регрессий на v2 стороне (Toast, ItemCardModal, CharacterGalleryScene).
