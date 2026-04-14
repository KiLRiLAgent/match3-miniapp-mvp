# Feature Brief: Arena Perk Modal Visual Rework

## Intent
Текущий ArenaPerkModal (`src/v2/ui/ArenaPerkModal.ts`) выглядит плохо — простые прямоугольники без стиля. Нужно привести его к качеству v1 PerkCard (`src/ui/PerkCard.ts`): glow border с анимацией, rounded rect через Graphics, title strip, resolution:2, scale factor. Также должна остаться анимация "новый уровень" как в v1.

## Audience
Игроки v2 арены — видят perk modal на каждой снятой полоске HP босса.

## Success Criteria
1. **Skill карты** (4 скила × 5 уровней) визуально идентичны v1 PerkCard:
   - Glow border (золотой, с пульсирующей анимацией `alpha 0.4 → 0.8 yoyo`)
   - Rounded rect через `Phaser.GameObjects.Graphics` (не Rectangle)
   - Title strip (тёмная полоса вверху карты с именем скила)
   - Icon circle с emoji скила (⚡/⏳/💚/🔨)
   - 5 звёзд: заполненные ★ (золотые) для текущего уровня, мигающая ★ для следующего (yoyo tween), пустые ☆ для остальных
   - Описание следующего уровня (текст из `getNextDescription()`)
   - Стоимость маны
   - `resolution: 2` на текстовых элементах для чёткости
   - Scale factor от высоты карты (как в v1: `const scale = h / 200`)
2. **Passive карты** (12 one-time перков) — тот же визуальный стиль но:
   - Без звёзд — вместо них badge "ОДНОРАЗОВЫЙ" или просто пустое место
   - Border color: фиолетовый `0x9944aa` вместо золотого
   - Description из PassivePerkDef
3. **Stat карты** (6 unlimited перков) — тот же визуальный стиль но:
   - Без звёзд — вместо них badge "×N" (count) в правом верхнем углу
   - Border color: зелёный `0x44aa66`
   - Description из StatPerkDef
4. **Анимация входа карт**: staggered scale-from-zero с `Back.easeOut` (300ms, delay 100ms между картами) — как entrance animation
5. **Анимация выбора**: выбранная карта scale 1→1.2 с glow pulse, остальные fade out (alpha → 0), затем resolve
6. **Заголовок модала**: "Выбери улучшение" (не "Выбери перк")
7. **Non-dismissable**: нет tap-to-close на backdrop, игрок ОБЯЗАН выбрать карту

## Exclusions
- НЕ менять v1 `src/ui/PerkCard.ts` — только использовать его как визуальный reference
- НЕ менять GameScene integration (handler injection) — только визуал модала
- НЕ менять ArenaPerkSystem logic (card generation, applyCard) — только рендер
- НЕ менять другие сцены

## Project Context
- Match-3 Telegram Mini App, Phaser 3 + TypeScript
- v1 PerkCard: `src/ui/PerkCard.ts` — reference implementation с glow, Graphics, stars, resolution:2
- Текущий ArenaPerkModal: `src/v2/ui/ArenaPerkModal.ts` (~187 lines) — простые rectangles
- ArenaPerkSystem: `src/v2/systems/ArenaPerkSystem.ts` — getCardOptions() возвращает PerkCard[]
- GameScene вызывает modal через `arenaPerkModal.open(scene)` handler injection
- Модал работает ВНУТРИ GameScene (zoomed camera, DPR-zoom, логические координаты БЕЗ умножения на DPR)
- Depth: 2100 (blocking modal)

## Key Reference
Визуальный стиль целиком из `src/ui/PerkCard.ts`:
- `CARD_COLORS` объект с bg/border/borderGlow/titleBg/star* цветами
- `Graphics.fillRoundedRect` + `strokeRoundedRect` для карт
- `borderGlow` с pulsing tween (alpha 0.4 → 0.8)
- Title strip с `fillRoundedRect({tl: r, tr: r, bl: 0, br: 0})`
- Stars row с filled/next-blinking/empty logic
- `resolution: 2` на текстовых элементах
- Container-based (extends Phaser.GameObjects.Container)

---

## Review Checklist
- [ ] ArenaPerkModal использует Graphics.fillRoundedRect для карт (не Rectangle)
- [ ] Glow border с pulsing tween на каждой карте
- [ ] Title strip (тёмная полоса) с именем перка
- [ ] Skill карты: 5 звёзд с мигающей следующей
- [ ] Passive карты: фиолетовый border, без звёзд
- [ ] Stat карты: зелёный border, badge ×N
- [ ] Entrance animation: staggered scale-from-zero
- [ ] Selection animation: выбранная grows + glow, остальные fade
- [ ] resolution:2 на текстах
- [ ] Работает внутри GameScene zoomed camera (логические координаты)
- [ ] v1 PerkCard.ts НЕ модифицирован
- [ ] npm run build passes
