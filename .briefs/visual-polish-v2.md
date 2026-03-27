# Feature Brief: Визуальный полиш v2 — доработки и многослойный HP

## Intent
Довести визуальную полировку Match-3 игры: исправить баги из первого раунда, усилить визуальные эффекты, переработать HP бар босса в многослойную систему.

## Audience
Все игроки Telegram Mini App

## Success Criteria

### 1. Баг: damage art застывает после скила игрока
После применения сильного скила игрока (powerStrike) босс застывает в damage art и дельта HP бара замирает. Нужно:
- После применения скила — восстановить damage art обратно в idle через crossfade
- Дельта HP должна начать drain анимацию
- Проверить ВСЕ скилы (powerStrike, heal, stun, hammer) — ни один не должен оставлять босса в damage state

### 2. Свечение match 4/5 — ещё ярче
Текущее свечение (tileGlows) для match-4/5 недостаточно яркое. Увеличить:
- Alpha диапазон (сейчас 0.7→1.0 — увеличить до 0.85→1.0 или выше)
- Размер glow текстуры (glowScale ещё больше)
- Возможно увеличить интенсивность в BootScene при генерации glow текстур

### 3. Летящие фишки — ещё больше
Увеличить стартовый и финальный размер летящих фишек:
- startScale: было 1.25 → увеличить (~1.4-1.5)
- endScale: было 0.85 → увеличить (~0.95)
- Trail пропорционально больше

### 4. HP бар: прямые края fill и delta (для ВСЕХ баров)
Сейчас fillRoundedRect делает скруглённые края у цветной части и дельты. Нужно:
- Цветной fill (красный/зелёный/синий) — рисовать с ПРЯМЫМ правым краем
- Белая дельта — тоже прямой правый край
- Только внешний борт бара (strokeRoundedRect) остаётся скруглённым
- Левый край fill может остаться скруглённым (он совпадает с бортом бара)
- Применить для ВСЕХ баров (босс HP, игрок HP, игрок MP)
- Реализация: использовать fillRect для fill и delta, но с geometry mask по форме бара для обрезки

### 5. Trailing delta на HP баре игрока
Добавить такую же trailing delta анимацию как у босса:
- При получении урона — белая полоска между старым и новым HP
- При каскадных ударах — дельта накапливается
- После окончания — плавный drain
- Серый фон для пустой части (как у босса)

### 6. Flash бара — подсвечивать ВЕСЬ цветной кусок
Сейчас flash подсвечивает только часть бара ДО изменения (currentFillWidth на момент flash). Нужно:
- flash() должен подсвечивать весь текущий цветной кусок бара ПОСЛЕ setValue
- Порядок: setValue() обновляет fill → flash() подсвечивает новый fill

### 7. "МР" в стоимости скилов → иконка маны
В UI скилов (SkillButton) заменить текстовую надпись "МР" на маленькое изображение фишки маны (ASSET_KEYS.tiles[TileKind.Mana]).

### 8. Slash эффект по центру поля м3 (эксперимент)
При атаках босса по игроку — показывать крупный разрез (splash_1) по центру поля match3, а не на аватаре игрока.
- Позиция: центр игрового поля (boardOrigin + board size / 2)
- Размер: крупный (~300-400px)
- Это эксперимент — если не понравится, вернём на аватар

### 9. Многослойный HP бар босса
Полная переработка HP бара босса:

**Концепция**: У босса не 1 полоска HP, а 10 слоёв по 100 HP = 1000 HP total

**Визуал**:
- Бар показывает HP текущего слоя (0-100)
- Цвета чередуются: красный → жёлтый → красный → жёлтый...
- Когда текущий слой снимается полностью — начинает сниматься следующий (видна полоска другого цвета под текущей)
- Справа от бара — счётчик оставшихся слоёв (например "x10")

**Механика**:
- Пока снимается одна полоска — за ней видно следующую
- Когда текущая полоска снимается полностью — начинает сниматься вторая, за которой видно 3ю и т.д.

**UI**:
- Прогресс бар и цифры на нём сделать покрупнее чем сейчас (чтобы хорошо было видно)
- Счётчик слоёв справа ("x10", "x9", ...) крупный и читаемый

**Config**: BOSS_HP_MAX = 1000, layers = 10, hpPerLayer = 100
Цвета: [0xde3e3e (красный), 0xf5c542 (жёлтый)] чередуются

## Exclusions
- Не менять механику боя/урона (формулы, значения кроме BOSS_HP_MAX)
- Не менять логику матч-3 (Board.ts)
- Не трогать IntroScene

## Project Context

### Stack
- Phaser 3.88.2 + TypeScript 5.9.3 + Vite 7.2.4
- Telegram Mini App

### Key Architecture
- **Boss art**: 3-layer system (bossImageGlow, bossGlowBrightness ADD, bossImage)
- **Damage flash**: flashBoss() — instant texture swap + shake, bossDamageArtActive flag, restoreBossArtFromDamage()
- **Cutscene**: withCutscene() — overlay + fullscreen art
- **Flying tiles**: FlyingTile.ts, perspective scaling startScale→endScale along Bezier
- **Tile scale**: CELL_SIZE * TILE_DISPLAY_SCALE (1.20)
- **Meter.ts**: Graphics-based bars, flash(), drainDelta(), trailing delta, icon support
- **Hint glows**: tileGlows Map, gold/red radial textures, alpha pulse
- **SkillButton.ts**: UI component for player skills, shows mana cost
- **Slash effect**: showSlashEffect(target, strong) — splash_1/splash_2 sprites

### Key Files
- `src/scenes/GameScene.ts` (~2700 lines) — main scene
- `src/ui/Meter.ts` — HP/MP bars
- `src/ui/FlyingTile.ts` — flying tile animation
- `src/ui/SkillButton.ts` — skill buttons
- `src/game/animations.ts` — animation config
- `src/game/config.ts` — game constants
- `src/game/assets.ts` — asset key registry
- `src/scenes/BootScene.ts` — texture generation, asset loading

---

## Review Checklist

- [ ] После скила powerStrike босс НЕ застывает в damage art
- [ ] Свечение match-4/5 заметно ярче чем было
- [ ] Летящие фишки крупнее чем были
- [ ] Края fill и delta прямые для всех баров (скруглены только борты)
- [ ] HP бар игрока имеет trailing delta как у босса
- [ ] Flash бара подсвечивает ВЕСЬ цветной кусок
- [ ] "МР" в скилах заменено на иконку маны
- [ ] При атаке босса — slash по центру поля м3
- [ ] HP бар босса многослойный: 10 слоёв, красный/жёлтый, счётчик справа
- [ ] Board.ts и IntroScene не изменены
