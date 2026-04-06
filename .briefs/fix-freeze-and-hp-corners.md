# Feature Brief: Fix Screen Freeze & Boss HP Bar Square Corners

## Intent

Исправить два критических бага игрового опыта:

**Баг 1: Зависание экрана** — иногда игрок не может двигать ни одну фишку, экран "замораживается". Причина: флаг `busy` в `GameScene` застревает в состоянии `true` после выбора перка, активированного через скилл, либо после исключения в анимации.

**Баг 2: Квадратные углы HP-бара босса** — в `LayeredMeter` видны прямые углы заливки, "торчащие" за пределы скруглённого фона бара. Происходит в двух сценариях: (a) когда бар почти полный (~97-99% слоя), (b) когда в текущем слое осталось очень мало HP (ширина заливки меньше 2×радиус скругления).

## Audience

Все игроки Match-3 Telegram Mini App — оба бага напрямую портят игровой опыт и визуал.

## Success Criteria

### Баг 1: Зависание экрана
- [ ] После использования скилла, который пересекает границу слоя босса и вызывает показ перка, `busy` гарантированно возвращается в `false` после закрытия окна выбора
- [ ] `showPerkSelection()` обёрнут в `try/finally`, гарантирующий cleanup overlay/banner/text даже при исключении
- [ ] `processPerks()` в `activateSkill()` корректно `await`-ится либо обёрнут в защищённый путь с гарантированным сбросом `busy`
- [ ] `executeBossAbility()` в `finishPlayerTurn()` обёрнут в `try/catch`/`try/finally`, чтобы `busy = false` сбрасывался даже при ошибке боссовой способности
- [ ] `withCutscene()` обёрнут в `try/finally` для гарантированного восстановления base boss art
- [ ] После любой комбинации (матч, каскад, скилл, перк, боссовая способность, урон, исцеление) игрок может сделать следующий ход — `busy` всегда корректно сбрасывается
- [ ] Никаких регрессий в intro scene, cutscene boss abilities, hammer mode, tutorial flow

### Баг 2: Квадратные углы HP-бара
- [ ] HP-бар босса всегда визуально скруглён по всей форме — никаких прямых углов "внутри" скруглённой рамки, ни при полной, ни при почти пустой полосе слоя
- [ ] Решение через `GeometryMask` (или эквивалент) от формы `borderGfx`, применённую ко всем внутренним Graphics слоям (`fillGfx`, `deltaGfx`, `nextFillGfx`, `flashGfx`)
- [ ] Внутренние слои рисуются обычным `fillRect` без manual-скруглений — маска автоматически обрезает их по округлой форме
- [ ] Delta-анимация (белая полоска потерянного HP) корректно скруглена на любой ширине
- [ ] Flash-эффект при получении урона корректно скруглён
- [ ] Layer transition (переход на следующий слой) работает без визуальных глитчей
- [ ] Работает корректно на всех уровнях HP: 100%, 99%, 50%, 10%, 1%, 0%
- [ ] Работает для `playerHpBar` и `manaBar`, если они используют тот же компонент (проверить и применить при необходимости)

## Exclusions

- НЕ изменять игровую механику перков, скиллов, боссовых способностей — только инфраструктуру обработки ошибок и async flow
- НЕ рефакторить `LayeredMeter` целиком — только fix для артефактов скруглений + минимальная чистка логики `isFull` threshold, которая станет ненужной
- НЕ трогать `Meter.ts` (player HP/mana), если он не затронут тем же багом
- НЕ изменять визуальный дизайн бара (цвета, размеры, текст, положение)
- НЕ добавлять новые фичи, настройки или UI-элементы
- НЕ трогать `IntroScene`, `BootScene`, `Board.ts`, систему match-3
- НЕ менять Telegram integration, haptics, audio settings

## Additional Context

**Известные критические пути для Bug 1** (из исследования):

1. `src/scenes/GameScene.ts:1764-1775` — `activateSkill()` → `processPerks()` fire-and-forget без await
2. `src/scenes/GameScene.ts:1057-1218` — `showPerkSelection()` без try/finally, `Promise.all` fade-out может упасть
3. `src/scenes/GameScene.ts:860-864` — mid-cascade perk selection в `resolveBoard()` без try/catch
4. `src/scenes/GameScene.ts:2440-2460` — `finishPlayerTurn()` без try/finally вокруг `executeBossAbility()`
5. `src/scenes/GameScene.ts:2687-2705` — `withCutscene()` без try/finally вокруг `logic()`

**Архитектура проблемы Bug 2** (из исследования `src/ui/LayeredMeter.ts`):

- `borderGfx` рисует скруглённый фон `fillRoundedRect(0, 0, widthPx, heightPx, radius=12)`
- `fillGfx` при partial fill рисует `fillRoundedRect(0, 0, fillWidth, heightPx, {tl:12, tr:0, bl:12, br:0})`
- Когда `fillWidth ∈ (widthPx - 2*radius, widthPx - 0.5)` = (216, 239.5) — правый прямой край `fillGfx` попадает в зону скругления `borderGfx` → **квадратный угол внутри скруглённой рамки**
- Когда `fillWidth < 2*radius` (< 24px) — Phaser `fillRoundedRect` не может корректно нарисовать скругления шире самого прямоугольника → **артефакты/квадраты слева**
- Коммит `a544443` (threshold 0.5px) решает только edge case float precision при 100%, но не два сценария выше
- **Правильное решение:** `GeometryMask` от фигуры `borderGfx` применённая к `fillGfx`, `deltaGfx`, `nextFillGfx`, `flashGfx`. Тогда внутренние слои рисуются простыми `fillRect` и автоматически обрезаются по округлой форме маски.

**Важно при применении маски в Phaser:**
- `GeometryMask` создаётся из отдельного `Graphics` объекта (mask shape), который НЕ добавляется в scene
- Mask shape должна быть в **локальных координатах Container** (так как LayeredMeter — это Container)
- Нужно учитывать device pixel ratio и positioning Container при создании mask shape
- Альтернатива: `BitmapMask` — но GeometryMask эффективнее для простых форм

## Project Context

**Stack:** Phaser 3.88 + TypeScript 5.9 (strict) + Vite 7. Telegram Mini App. GitHub Pages deploy (`docs/` folder). No backend, no database. Game state в памяти `GameScene` + localStorage для настроек.

**Архитектура:**
- 3 сцены: `BootScene` (preload) → `IntroScene` (cutscene) → `GameScene` (gameplay, ~3475 строк)
- Match-3 логика: `src/match3/Board.ts` (643 строки)
- 10 UI-компонентов в `src/ui/`
- `busy` flag в `GameScene` — единственный gate ввода игрока, управляется через `canPlayerAct()`
- Все анимации — Promise-based (`async/await`, `tweenPromise`)

**Сложность задачи:** MEDIUM (не SIMPLE потому что затрагивает critical async flow GameScene + Graphics/mask в Phaser, но не COMPLEX потому что ограничено двумя локальными изменениями в двух файлах).

**Файлы, которые будут затронуты:**
- `src/scenes/GameScene.ts` — try/catch/finally оборачивание (bug 1)
- `src/ui/LayeredMeter.ts` — переход на GeometryMask (bug 2)

**Файлы, которые НЕ должны меняться (out of scope):**
- `src/match3/Board.ts`
- `src/game/BossAbility.ts`
- `src/game/PerkManager.ts`
- `src/scenes/IntroScene.ts`
- `src/ui/Meter.ts`, `PerkCard.ts`, `SpeechBubble.ts` и др.

**После фикса обязательно:**
1. `npm run build` — убедиться что TypeScript проходит
2. Коммит включая `docs/` (per user memory: "ALWAYS include docs/ in commits after npm run build")
3. `git push`

---

## Review Checklist (for code reviewers)

### Bug 1: Screen freeze
- [ ] `showPerkSelection()` имеет `try/finally` и cleanup overlay/banner/text гарантирован даже при исключении
- [ ] `activateSkill()` → `processPerks()` либо `await`-ится, либо обёрнут в `.catch()` с сбросом `busy = false`
- [ ] `finishPlayerTurn()` → `executeBossAbility()` обёрнут в `try/catch` с гарантированным `this.busy = false` в happy path
- [ ] `withCutscene()` восстанавливает base boss art (`bossLayers.alpha = 1`) даже если `logic()` упадёт
- [ ] `resolveBoard()` mid-cascade perk selection устойчив к исключениям (либо обёрнут, либо полагается на upstream finally)
- [ ] Ручное тестирование: использовать скилл PowerStrike который сносит слой → перк → попробовать двигать фишки (должны двигаться)
- [ ] Ручное тестирование: сделать каскад с большим крит-скилл-комбо, пересекающий 2+ слоя → несколько перков подряд → фишки двигаются
- [ ] Ручное тестирование: дождаться боссовую способность → выбрать перк сразу после → фишки двигаются
- [ ] Никакой регрессии в tutorial flow, intro scene, hammer mode, victory/defeat screens

### Bug 2: HP bar square corners
- [ ] `LayeredMeter` использует `GeometryMask` от формы `borderGfx` на всех внутренних Graphics
- [ ] Внутренние Graphics (`fillGfx`, `deltaGfx`, `nextFillGfx`, `flashGfx`) рисуются без manual corner-radius (только `fillRect` или полный скругленный fill если проще)
- [ ] Устаревшая логика `isFull` threshold 0.5px / per-corner radius `{tl, tr:0, bl, br:0}` удалена или упрощена — она больше не нужна при наличии маски
- [ ] Ручное тестирование: бар при 100% HP — все углы скруглены
- [ ] Ручное тестирование: бар при 99% HP — правый край НЕ квадратный
- [ ] Ручное тестирование: бар при 50% HP в слое — корректно скруглён слева, обрезан справа по маске
- [ ] Ручное тестирование: бар при 5% HP в слое (fillWidth < 2*radius) — НЕ квадратный, корректно обрезан
- [ ] Ручное тестирование: delta-анимация (белая полоска) корректно скруглена при любой ширине
- [ ] Ручное тестирование: flash-эффект при получении урона корректно обрезан маской
- [ ] Ручное тестирование: layer transition (переход между слоями) визуально плавный

### Build & deploy
- [ ] `npm run build` проходит без TypeScript ошибок
- [ ] `docs/` включён в коммит
- [ ] `git push origin dev-v2`
