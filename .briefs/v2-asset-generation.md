# v2 Phase 1A — Asset Generation Guide

Полный список ассетов для замены placeholder'ов в Phase 1A (Lilana vertical slice). Все ассеты грузятся **только при v2 режиме** через BootScene v2 preload — не влияют на v1 baseline.

## Базовый стиль (повторять в каждом промпте)

```
gothic anime art, dark academia aesthetic, painterly digital illustration,
muted palette of deep midnight blues + violet shadows + silver highlights + gold accents,
dramatic chiaroscuro lighting, atmospheric, melancholic, high detail, 4k
```

---

## 🎭 Приоритет 1 — Лилана (4 портрета)

**Базовое описание персонажа** (повторять в каждом промпте Лиланы):

> elegant young woman in her early 20s, long flowing silver-white hair with subtle blue undertones, pale porcelain skin, piercing ice-blue eyes, sharp aristocratic features, wearing dark gothic academy uniform — black blazer with silver chain trim, high collar, small silver feather pin, hint of seraphim feathers concealed beneath collar, gothic university setting

### 1. `lilana_neutral.png`
**Размер**: 1024 × 1536 (2:3 portrait), PNG transparent
**Куда**: DialogueScene CharacterPortrait (default state)

```
[base style] + [base lilana]
expression: cool, distant, slightly looking up, lips slightly parted in mid-thought,
eyes calm but observing, faint shadow under eyes,
pose: half-portrait, three-quarter view, hands not visible
mood: detached intellectual, untouchable
aspect: 2:3 portrait, transparent background
```

### 2. `lilana_cold.png`
**Размер**: 1024 × 1536 (2:3 portrait), PNG transparent
**Куда**: DialogueScene (emotion swap, Act 1-2 wrong choice reactions)

```
[base style] + [base lilana]
expression: cold disdain, slight squint, lips compressed in thin line,
one eyebrow subtly raised in disapproval, eyes narrowed but still beautiful,
pose: chin lifted slightly, looking down at the viewer,
mood: aristocratic contempt, freezing aura around shoulders
aspect: 2:3 portrait, transparent background
```

### 3. `lilana_smirk.png`
**Размер**: 1024 × 1536 (2:3 portrait), PNG transparent
**Куда**: DialogueScene (emotion swap, Act 2 правильные выборы — warming up)

```
[base style] + [base lilana]
expression: subtle knowing half-smile, one corner of mouth raised,
eyes amused with a glint of warmth breaking through ice, slight head tilt,
pose: relaxed shoulders, leaning slightly forward,
mood: intrigued, beginning to thaw, secretly pleased
aspect: 2:3 portrait, transparent background
```

### 4. `lilana_seraphim.png`
**Размер**: 1024 × 1536 (2:3 portrait), PNG transparent
**Куда**: DialogueScene Act 4 + battle intro (boss reveal — раскрытая форма)

```
[base style] + [base lilana]
TRANSFORMED into her hidden Seraphim form:
six massive feathered wings emerging from back (three pairs, white at base fading to silver tips),
glowing pale-gold halo, eyes blazing with cold celestial light (bright cyan-white glow),
hair lifted by ethereal wind, silver chains of guilt wrapping around her arms and shoulders,
divine but tragic — power constrained by her own remorse,
expression: anguished pride, tears not yet falling but ready to,
pose: half-arms-raised in defensive/defiant gesture,
background: dark chapel with broken stained glass behind her, faint sacred geometry circles
mood: terrible beauty, fallen seraph confronting her past
aspect: 2:3 portrait, transparent background
```

---

## 🏛️ Приоритет 2 — Локации (4 фона)

> ⚠️ Оставляй ~200px сверху и ~250px снизу относительно "безопасной зоны" — там HUD и кнопки Phaser. Главный focal point композиции — в средней трети.

### 5. `location_atrium.png`
**Размер**: 1080 × 1920 (9:16 portrait), PNG или JPG
**Куда**: LocationScene background (главная локация Phase 1A)

```
[base style] no character
gothic cathedral interior, vast atrium of an ancient university for fallen angels,
pillars cracked but still grand, broken stained glass windows letting in pale morning light,
long central nave leading to a distant altar, faded pastel mosaics on the floor,
flickering candle sconces along the walls, gargoyles perched in shadowed alcoves,
dust motes floating in the light beams, faint echo of footsteps,
mood: sacred but decaying, melancholic grandeur
aspect: 9:16 portrait, no UI overlay, no characters, leaves space at top and bottom for HUD
```

### 6. `location_chapel.png`
**Размер**: 1080 × 1920 (9:16 portrait), PNG или JPG
**Куда**: Phase 1B Chapel (для Act 4 boss fight)

```
[base style] no character
small dark gothic chapel, blood-red stained glass windows depicting the Seven Sins
(each sin a different scene — pride at center, wrath, envy, greed, lust, gluttony, sloth),
central altar with seven candles burning low, dripping wax,
ancient symbols carved into the stone floor, spiraling toward the altar,
heavy iron chandelier hanging from vaulted ceiling, only half its candles lit,
shadow-figures barely visible in the corners (carved statues of repentant angels),
mood: oppressive, sacred terror, place where confessions are forced from the soul
aspect: 9:16 portrait, dramatic vertical perspective, leaves space at top and bottom for HUD
```

### 7. `hub_bg.png`
**Размер**: 1080 × 1920 (9:16 portrait), PNG или JPG
**Куда**: HubScene background

```
[base style] no character
view of the University of Fallen Angels from outside,
silhouette of a vast gothic castle perched on a stormy cliff,
sky filled with dark purple thunderclouds, occasional lightning,
ravens circling the towers, distant lit windows hinting at life inside,
foreground: cracked stone pathway leading toward the gate,
mood: ominous welcome, dangerous knowledge awaits
aspect: 9:16 portrait
```

### 8. `storymap_bg.png`
**Размер**: 1080 × 1920 (9:16 portrait), PNG или JPG
**Куда**: StoryMapScene background

```
[base style] no character
stylized medieval-fantasy parchment map of a university campus,
hand-drawn cartography style with golden ink on dark aged paper,
illustrated landmarks: cathedral atrium (large central building),
chapel of seven sins (small ornate building), thorn garden (twisted vines area),
library tower, dormitories, alchemy shop — labeled in elegant gothic calligraphy,
compass rose in corner, decorative borders with feather motifs and chains,
mood: mysterious treasure map, an invitation to explore
aspect: 9:16 portrait
```

---

## ⛓️ Приоритет 3 — Цепи для Match-3

### 9. `chain_iron.png` (минимум — 1 sprite)
**Размер**: 256 × 256 (1:1 square), PNG transparent
**Куда**: ChainOverlay tile cells (full HP variant, HP states анимирую через alpha/scale в коде)

```
heavy iron chain link, hand-forged medieval style, dark metal with cold blue highlights,
single overlapping link with riveted joints, slight wear and rust,
ornate gothic detailing on the metal — faint engravings of latin sigils,
top-down 3/4 angle, glowing softly with a faint cold light from within,
no background, isolated on transparent
aspect: 1:1 square, transparent PNG
```

### 9a-c. Опционально — 3 HP variants
**Размер**: 256 × 256 (1:1 square), PNG transparent

```
chain_iron_3.png (full HP):    pristine, glowing strong blue
chain_iron_2.png (damaged):    one rivet popped, hairline crack visible, dimmer glow
chain_iron_1.png (critical):   visible large crack, one link half-broken hanging by a thread, glow fading
```

---

## 👤 Приоритет 4 — Avatar / UI

### 10. `lilana_avatar_small.png`
**Размер**: 256 × 256 (1:1 square), PNG transparent
**Куда**: StoryMap node icon, RelationshipMeter

```
[base style] + [base lilana neutral]
circular bust portrait, head and shoulders only, centered composition,
softer lighting (less dramatic than full portraits),
clean look suitable for small icon use,
aspect: 1:1 square, transparent background, subtle gold circular border
```

---

## 📐 Сводная таблица размеров

| # | Файл | Размер | Aspect | Формат | Приоритет |
|---|---|---|---|---|---|
| 1 | `lilana_neutral.png` | 1024 × 1536 | 2:3 | PNG transparent | 1 |
| 2 | `lilana_cold.png` | 1024 × 1536 | 2:3 | PNG transparent | 1 |
| 3 | `lilana_smirk.png` | 1024 × 1536 | 2:3 | PNG transparent | 1 |
| 4 | `lilana_seraphim.png` | 1024 × 1536 | 2:3 | PNG transparent | 1 |
| 5 | `location_atrium.png` | 1080 × 1920 | 9:16 | PNG / JPG | 2 |
| 6 | `location_chapel.png` | 1080 × 1920 | 9:16 | PNG / JPG | 2 |
| 7 | `hub_bg.png` | 1080 × 1920 | 9:16 | PNG / JPG | 2 |
| 8 | `storymap_bg.png` | 1080 × 1920 | 9:16 | PNG / JPG | 2 |
| 9 | `chain_iron.png` | 256 × 256 | 1:1 | PNG transparent | 3 |
| 9a | `chain_iron_3.png` (опц.) | 256 × 256 | 1:1 | PNG transparent | 3 |
| 9b | `chain_iron_2.png` (опц.) | 256 × 256 | 1:1 | PNG transparent | 3 |
| 9c | `chain_iron_1.png` (опц.) | 256 × 256 | 1:1 | PNG transparent | 3 |
| 10 | `lilana_avatar_small.png` | 256 × 256 | 1:1 | PNG transparent | 4 |

---

## 🛠️ Параметры для генераторов

### Midjourney
```
Portraits (4 Lilana):    --ar 2:3 --quality 2 --style raw
Backgrounds (4 locations): --ar 9:16 --quality 2 --style raw
Chains + Avatar:         --ar 1:1 --quality 2 --style raw
```

### Stable Diffusion / SDXL
```
Portraits:    width=1024 height=1536  (или ближайший SDXL native: 832×1216)
Backgrounds:  width=1080 height=1920  (или SDXL native: 768×1344)
Square:       width=1024 height=1024
Sampler: DPM++ 2M Karras, steps=30, cfg=7
Negative: low quality, blurry, deformed, cartoon, photo-realistic, harsh lighting, busy background
```

### DALL-E 3
```
Portraits:    1024x1792  (closest portrait)
Backgrounds:  1024x1792
Square:       1024x1024
Style: vivid (или natural для фонов)
```

---

## 📁 Куда положить файлы

После генерации создай структуру в `public/v2/`:

```
public/v2/
├── characters/
│   ├── lilana_neutral.png
│   ├── lilana_cold.png
│   ├── lilana_smirk.png
│   ├── lilana_seraphim.png
│   └── lilana_avatar_small.png
├── locations/
│   ├── location_atrium.png
│   ├── location_chapel.png
│   ├── hub_bg.png
│   └── storymap_bg.png
└── chains/
    └── chain_iron.png
```

После того как файлы окажутся на месте — скажи. Я добавлю их в BootScene v2 preload и заменю placeholder rectangles на `Image` GameObjects в HubScene / LocationScene / CharacterPortrait / ChainOverlay. Это будет один patch на ~30 минут (3-4 файла).

---

## 💾 Размер итоговых ассетов

| Категория | Кол-во | Размер каждого | Итого |
|---|---|---|---|
| Portraits (PNG) | 4 | ~800 KB | ~3.2 MB |
| Backgrounds (JPG) | 4 | ~600 KB | ~2.4 MB |
| Backgrounds (PNG, если без JPG) | 4 | ~2 MB | ~8 MB |
| Chains (PNG) | 1-4 | ~50 KB | ~50-200 KB |
| Avatar (PNG) | 1 | ~80 KB | ~80 KB |
| **Минимум (JPG фоны)** | | | **~5.7 MB** |
| **Максимум (PNG фоны)** | | | **~11.5 MB** |

После оптимизации через [TinyPNG](https://tinypng.com/) или [squoosh.app](https://squoosh.app/) → ~2-5 MB total.

**Важно**: эти ассеты НЕ влияют на v1 baseline (~1.34 MB). Они грузятся только при `getActiveMode() === "v2"` через BootScene v2 preload.

---

## 🎨 Tips для генерации

1. **Консистентность Лиланы** — используй один и тот же `[base lilana]` блок в каждом промпте. Это критично для того, чтобы 4 эмоции выглядели как один человек.

2. **Seed** — если генератор поддерживает, фиксируй seed для базового стиля и меняй только описание эмоции/позы. Это даёт ещё бо́льшую консистентность.

3. **Backgrounds без UI overlay** — не добавляй текст, цифры, иконки. Фон чистый, UI рисуется поверх в Phaser.

4. **Transparent PNG для портретов** — если генератор не умеет, сгенери на чёрном фоне и удали через [remove.bg](https://remove.bg/) или Photoshop. Без фона важно, иначе будет видна квадратная "коробка" вокруг персонажа.

5. **Цепи** — если 1 sprite, делай в варианте "full HP" (новая, целая). Я через alpha/scale покажу damage states. Это проще чем 3 sprite'а.

6. **Atrium особенно важен** — это ЕДИНСТВЕННАЯ локация Phase 1A, видна сразу. Chapel и остальные нужны позже.

7. **Не используй cyberpunk/neon стили** — Университет Падших это dark academia + готика, не futurism. Свечи, витражи, стрельчатые арки — да. Неоновая подсветка — нет.
