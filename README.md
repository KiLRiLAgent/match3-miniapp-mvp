# Match-3 RPG Boss (Telegram Mini App ready)

Phaser 3 + Vite (TypeScript) vertical match-3 boss fight built for Telegram Mini App container. One screen: 8×8 board, boss HUD with HP, player mana/HP, 4 skill buttons, boosters/ultimates, victory restart.

## Commands
- `npm install`
- `npm run dev` – local dev server
- `npm run build` – production build to `dist/`
- `npm run preview` – serve built bundle

## Gameplay cheatsheet
- Board: 8×8, swap adjacent tiles. Valid matches clear, cascade, refill; special tiles tap-activatable.
- Tile types: swords = 10 dmg each, stars = 12 dmg each, mana = +3 mana each (cap 100), bottles = +2 HP each (cap 100).
- Match-4 → booster (row/col clear by orientation). Match-5 → ultimate (row+col clear) and adds 1 ult charge.
- Skills (bottom squares):  
  1) Attack Boost: -30 mana, deal 120 dmg.  
  2) Magic Blast: -50 mana, clears random row.  
  3) Heal: -40 mana, heal 30 HP.  
  4) Ultimate: costs 1 ult charge, clears 5 random cells.  
  Buttons stay visible (disabled when insufficient resource).
- Boss art swaps at 75/50/25% HP. Victory overlay + restart when HP ≤ 0.

## Telegram Mini App notes
- On load calls `Telegram.WebApp.ready()` and `Telegram.WebApp.expand()` (safe to run in browser fallback).
- Security stub: placeholder comment in `src/telegram/telegram.ts` to validate init data server-side in a real deployment.

## Deploy as static
1) `npm run build`
2) Host `dist/` on any HTTPS static host (Vercel/Netlify/S3+CloudFront/etc.).
3) In BotFather set *Web App URL* to the hosted index (e.g., `https://yourdomain/game/`).

## Known limitations
- Placeholder boss art (4 SVG states) and generated tile textures.
- No sound, minimal effects; chunk is intentionally single bundle.
- No persistence/auth; Telegram init data not validated in MVP.
