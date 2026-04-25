# Feature Brief: ivan-feedback-batch-1

## Intent

Три блока правок от продакта/ревьюера Ивана + один связанный bug:

1. **Bug**: HP босса по слоям считается неправильно (или UI Settings вводит в заблуждение). Иван ставит «базовое ХП = 1000», K1=1.1 — ожидает 1100 HP на 1й полоске, получает 15500.
2. **Hits counter rework**: Убрать `CRIT! x2`/`MEGA CRIT! x3` лейблы по центру поля; вместо них рядом с боссом — крупная надпись «N Hits!» которая обновляется по каждому удару каскада и исчезает после конца каскада.
3. **Perk-select VFX rework**: текущий частицы-трейл невыразителен. Должна лететь сама **иконка способности** (как тайл) от карточки в нижний слот; при upgrade — приземляется на существующую SkillButton с подсветкой.
4. **Сопутствующее**: починить scroll в SettingsPanel.

UI применения способности (SkillApplyOverlay rework) Иван пометил как «готово» — НЕ трогаем.

## Audience

Все v1 игроки match3 (бой с боссом).

## Success Criteria

### 1. Bug: Boss layer HP calculation + Settings clarity

**Текущее поведение** (что Иван видит):
- Ставит в SettingsPanel «базовое ХП босса» = 1000.
- Ставит K1=1.1, K2=1.2, ..., K10=2.0.
- На 1й полоске — 15500 HP.

**Ожидаемое**:
- HP полоски 1 = 1000 × 1.1 = **1100**.
- HP полоски 2 = 1000 × 1.2 = **1200**.
- ...
- HP полоски 10 = 1000 × 2.0 = **2000**.
- Сумма (hpMax) = 1100+1200+...+2000 = **15500** (это нормально, но это ИТОГ, а не HP первой полоски).

**Гипотеза**: текущий UI Settings либо показывает hpMax как «HP первой полоски», либо формула `getBossLayerHpArray` использует не то поле (`hpPerLayer` вместо `baseHpPerLayer` или наоборот). См. `src/game/config.ts` строки 56-63 и 396-407.

**Что сделать**:
- Аудит цепочки `loadGameParams → recalcBossHpMax → getBossLayerHpArray → UI`.
- В SettingsPanel явно показывать **массив HP по полоскам** ("Полоска 1: 1100, Полоска 2: 1200, ...") — чтобы Иван видел расчёт сразу.
- Поле «базовое ХП» в UI должно быть однозначно подписано как **«ХП одной полоски (база)»**, не как «ХП босса».
- Инвариант: `baseHpPerLayer × Kn = HP полоски n` — выполняется **всегда**.

### 2. Hits counter rework: убрать CRIT по центру + «N Hits!» возле босса

**Удалить**:
- `showCritTexts` метод в GameScene.ts (~строка 1138) — выводит «CRIT! x2» / «MEGA CRIT! x5» по центру поля.
- Все его вызовы.

**Добавить**:
- Новый компонент `src/ui/HitsCounter.ts` или встроенный в GameScene — показывает крупный лейбл «**N Hits!**» рядом с боссом (привязка к `bossTarget` коорд).
- При **втором** ударе в каскаде → появляется «2 Hits!» с fade-in (~150ms).
- При **третьем** → текст обновляется на «3 Hits!» с pop-анимацией (scale 1.0→1.2→1.0).
- При **N-том** → «N Hits!».
- После окончания каскада (когда `resolveBoard` доходит до конца, нет matches) → fade-out (~250ms) и destroy.
- Шрифт: bold, ~36-44px, цвет золотой `#ffd700` или белый со stroke. Размер существенно крупнее damage numbers.
- Позиция: над боссом, чуть выше HP бара босса.

**Важно**: на поле в центре — **ничего не должно появляться** на месте старого CRIT лейбла. Damage numbers `-30/+50` у босса/игрока остаются как сейчас.

### 3. Perk-select VFX: летящая иконка вместо trail

**Текущее** (`flyPerkSelectVfx` в GameScene ~строка 1506): частицы со шлейфом летят от карточки к слоту, в слоте срабатывает `flashIconPulse` (или `flashIconUpgrade` при upgrade).

**Новое**:
- При выборе карточки перка карточка делает существующий `playSelect()` (scale + fade-out).
- **Параллельно** или сразу после — спавнится **Phaser.Image с текстурой/эмодзи иконки скила** (тот же визуал что на самой PerkCard) в позиции карточки.
- Эта иконка летит по bezier-кривой к worldPosition существующей или будущей SkillButton (`getIconWorldPosition`).
- Во время полёта: scale shrink 1.5 → 0.8, лёгкий spin (rotation) опционально, alpha 0.95, со шлейфом из частиц (можно переиспользовать существующий trail).
- При **landing** (unlock path):
  - Если SkillButton ещё не создана — создать её сейчас (текущая логика unlock через `repositionSkillButtons`), приземлить иконку в неё, **исчезнуть** летящую (она сливается с button visual).
  - SkillButton делает pop-анимацию (scale 0 → 1.2 → 1.0, fade in alpha 0 → 1).
- При **landing** (upgrade path):
  - Существующая SkillButton подсвечивается через **усиленный** `flashIconUpgrade`:
    - Текущий: золотой tint + scale 1.0 → 1.25 → 1.0 (240ms).
    - Усилить: scale **1.0 → 1.4 → 1.0** (более крупный), длительность 320ms, добавить short particle burst (5-8 золотых dots) расходящихся радиально.
  - Летящая иконка скила исчезает в момент landing (alpha → 0, scale → 0).
- Trail (частицы шлейфа) остаётся — но теперь не главный VFX, а сопровождение к иконке.

**Реализация**: расширить `flyPerkSelectVfx` чтобы принимать `iconTexture: string` (или `iconChar: string` если эмодзи). Внутри: создать Image/Text копию, анимировать вдоль bezier path параллельно с trail, в `onComplete` уничтожить и вызвать landing flash.

### 4. SettingsPanel scroll fix

- Проверить mask + scroll логику в `src/ui/SettingsPanel.ts`.
- Известный anti-pattern: `.conventions/anti-patterns/avoid-container-mask.md` — geometry masks НЕ работают внутри Containers в Phaser. Если scroll использует mask на Container — переписать на overflow через depth-based culling или scrollable viewport.
- Acceptance: при touch drag вверх-вниз/wheel содержимое прокручивается, не выходит за рамки панели, скролл-бар (если есть) обновляется.

## Exclusions

- НЕ менять механику CRIT (4-match → ×2 damage, 5+ → ×3 damage). Меняется только **визуальный индикатор**.
- НЕ трогать damage numbers (-30, +50) у босса/игрока — они остаются.
- НЕ трогать LayeredMeter / визуал HP бара (только формула HP за ним).
- НЕ трогать SkillApplyOverlay — Иван пометил «готово».
- НЕ трогать v2 (Toast, ItemCardModal, CharacterGalleryScene, arena flow) — это v1 фичи.

## Additional Context

Reference videos:
- Hits counter: `https://youtu.be/-_kNpb1bQDA?si=pHruEbTRqRfiDPhr&t=533`
- Perk landing VFX: `https://youtu.be/VxmPM7PUUbE?si=QRN90OyPovWTRUEE&t=487`

Эти ссылки — визуальные референсы, не реализуем pixel-perfect, важна **идея**: hits-counter крупно у персонажа; landing — golden burst + явная подсветка иконки.

## Project Context

**Стек**: Phaser 3 + TypeScript + Vite. Telegram Mini App. Ветка `dev-v2`. v1 main chunk в районе 153 kB (drift accepted per R-BUNDLE-1, Phase 2C cleanup pending).

**Ключевые файлы**:
- `src/game/config.ts` — GAME_PARAMS.boss + getBossLayerHpArray + recalcBossHpMax + loadGameParams.
- `src/ui/SettingsPanel.ts` — UI редактирования + scroll.
- `src/scenes/GameScene.ts`:
  - `showCritTexts` (~1138) — удалить.
  - `flyPerkSelectVfx` (~1506) — расширить для летящей иконки.
  - `applyPerk` callback (~1402) — split unlock/upgrade уже есть с прошлой итерации (R-VFX-1).
- `src/ui/SkillButton.ts` — `flashIconUpgrade` (есть, усилить).
- `src/ui/PerkCard.ts` — `playSelect`, иконка скила хранится в `iconText` / `cfg.icon`.

**Существующие conventions** (читать):
- `.conventions/gold-standards/phaser-animation.ts` §9 — VFX trail pattern (актуальный, нужно эволюционировать).
- `.conventions/gold-standards/ui-component.ts` — Container patterns.
- `.conventions/anti-patterns/avoid-container-mask.md` — для scroll fix.

**Риски**:
- Bug 1 (boss HP): причина может быть в нескольких местах — нужна risk investigation (рискtester read trace `loadGameParams → recalc → render`).
- VFX rework: текущий `flyPerkSelectVfx` cleanup-логика (cleaned flag, SHUTDOWN listener) — не сломать.
- SettingsPanel scroll fix может быть >2 кБ (если переписан viewport).

## Review Checklist (для reviewer'ов)

- [ ] Settings: установка «базовое ХП полоски» = 1000 + K1=1.1 даёт **1100 HP** на 1й полоске
- [ ] Settings: установка K1..K10 = 1.1..2.0 даёт массив [1100, 1200, ..., 2000]
- [ ] Settings: UI показывает массив HP по полоскам в реальном времени
- [ ] Settings: scroll работает на touch / wheel
- [ ] **Нет** лейблов «CRIT! xN» / «MEGA CRIT! xN» по центру поля
- [ ] При 2-м ударе в каскаде — рядом с боссом появляется крупный «2 Hits!»
- [ ] При 3-м, 4-м, ... — обновляется на «N Hits!» с pop-анимацией
- [ ] После окончания каскада — лейбл fade-out и destroy
- [ ] При unlock-перке: иконка скила летит из карточки → приземляется в слот → SkillButton pop-in
- [ ] При upgrade-перке: иконка летит → приземляется в существующую SkillButton → усиленный flashIconUpgrade (scale 1.4 + golden burst)
- [ ] Иконки летят со шлейфом (trail сохраняется)
- [ ] Damage numbers (-30/+50) у босса/игрока продолжают работать
- [ ] Apply skill flow (SkillApplyOverlay → confirm → execute) не сломан
- [ ] Bundle ≤ 160 kB (текущий ~153 kB, headroom ~7 kB)
- [ ] Нет регрессий в v2 (Toast, ItemCardModal, arena flow)
