# Verification Plan
## Feature: Visual Polish & UI/Animation Improvements

## Build & Types
- [ ] `npm run build` passes (TypeScript check + Vite build)

## Browser Checks
- [ ] Game loads at http://localhost:5173 without console errors
- [ ] Tiles display at 115% size (visibly larger than before)
- [ ] Match-4/5 tile glows are brighter and more visible
- [ ] Flying tiles start larger, shrink during flight, arrive smaller
- [ ] Boss art fades out before cutscene, fades back after
- [ ] Damage art stays during cascades, returns to idle after turn ends
- [ ] Flash/brightness pulse fires on every damage hit
- [ ] Tutorial shows 3-sword combo with darkened board
- [ ] Tutorial finger is large and animated (fade in → slide → fade out)
- [ ] Tutorial speech bubble is large and centered
- [ ] Slash effect (single) appears on normal attacks
- [ ] Slash effect (double) appears on skill/ultimate attacks
- [ ] HP bar stays green regardless of HP level
- [ ] Heal icon visible before player HP bar
- [ ] Mana icon visible before player MP bar
- [ ] HP/MP bars flash when values change
- [ ] Boss HP bar shows white delta on damage
- [ ] Delta accumulates during cascades
- [ ] Delta smoothly drains after cascade ends

## Spec Checks
- [ ] File `src/ui/Meter.ts` exports flash() method
- [ ] File `src/ui/Meter.ts` exports drainDelta() method
- [ ] File `src/game/assets.ts` contains splash_1 and splash_2 asset keys
- [ ] File `src/scenes/BootScene.ts` loads splash_1.png and splash_2.png
- [ ] Tile scale value is 1.15 in config.ts (not 1.1)
- [ ] `.conventions/` directory exists with gold-standards/

## Human Checks
- [ ] Visual quality of glow brightness matches expectations
- [ ] Flying tile perspective scaling looks natural (not jarring)
- [ ] Slash effect timing and rotation feel impactful
- [ ] Tutorial flow feels intuitive for new players
- [ ] Trailing delta animation timing feels satisfying
- [ ] Bar flash is noticeable but not distracting
