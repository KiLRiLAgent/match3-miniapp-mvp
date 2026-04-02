# Feature Brief: Багфиксы v4 — маna tip, бомбы, бустеры, шрифт интро

## Intent
Исправить 4 бага после предыдущих обновлений.

## Success Criteria

### 1. Убрать надпись "достаточно маны, используй скил внизу"
- Скилы теперь открываются через перки, а не автоматически
- Tip "Достаточно маны!\nИспользуй скил внизу" больше не актуален
- Найти и удалить: `manaTipShown`, `showTip("Достаточно маны...")` в GameScene.ts
- Удалить всю логику проверки маны для показа этого типа

### 2. Бомбы — tip по центру экрана
- Текст-подсказка про бомбы ("Собирай тайлы рядом с бомбами...") должен показываться по середине экрана
- Проверить позиционирование showTip — если tip уже по центру, ОК
- Если нет — исправить

### 3. Match 4/5 — полностью убрать бустеры
Сейчас при match-4/5 всё равно создаются фишки с цветной подсветкой и пульсацией (бустеры/enhanced tiles). Их быть НЕ должно.

Нужно найти и убрать:
- Создание enhanced tile glow (tileGlows Map) при match-4/5
- Пульсацию (tween на glow alpha) для enhanced tiles
- `createTileGlowSprite()` вызовы при трансформации match-4/5
- `tile.multiplier` не должен вызывать создание glow sprite
- Код в `animateTransforms()` который создаёт визуальные эффекты для бустеров
- Код в `spawnTileSprite()` который создаёт glow для tiles с multiplier > 1

Результат: match-4/5 просто уничтожает фишки + показывает "CRIT! x2" / "MEGA CRIT! x3". Никаких спецфишек, никакой подсветки.

### 4. Шрифт в IntroScene — неправильный при первом запуске
При первом запуске первый текст в IntroScene отображается системным шрифтом, а при перезапуске — правильным ('Exo 2').

Причина: веб-шрифт 'Exo 2' ещё не загружен к моменту первого рендера. Решение:
- Дождаться загрузки шрифта перед показом текста (document.fonts.ready или WebFont API)
- Или прелоадить шрифт в BootScene/main.ts

## Exclusions
- Board.ts logic не менять (CRIT multiplier уже работает правильно)
- Не трогать PerkManager, LayeredMeter, Meter

## Project Context
- Phaser 3.88.2 + TypeScript + Vite
- GameScene.ts (~2800 lines)
- IntroScene.ts — кинематик интро
- Tips: showTip() method in GameScene
- Glow: tileGlows Map, createTileGlowSprite()
- Font: 'Exo 2' loaded via CSS @import or Google Fonts

---

## Review Checklist
- [ ] Нет надписи "достаточно маны" при накоплении маны
- [ ] Tip про бомбы показывается по центру
- [ ] Match-4/5 НЕ создаёт enhanced tile glows / пульсацию
- [ ] Match-4/5 только уничтожает + показывает CRIT текст
- [ ] Шрифт IntroScene правильный с первого запуска
