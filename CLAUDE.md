# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
npm run dev      # Start Vite dev server with HMR
npm run build    # TypeScript check + Vite production build
npm run preview  # Preview production build locally
```

## Project Overview

This is a Match-3 boss fight game built as a Telegram Mini App using Phaser 3 and TypeScript. The game features turn-based combat where players match tiles to deal damage, heal, and charge skills against an AI boss.

## Architecture

### Scene Flow
- `BootScene` - Loads boss sprite assets and generates tile textures programmatically via Phaser graphics
- `GameScene` - Main gameplay: board rendering, input handling, HUD, skills, turn management, win/lose states

### Core Game Logic (`src/match3/`)
- `Board.ts` - Match-3 board logic: grid management, match detection, special tile creation (4-match creates row/col boosters, 5-match creates Ultimate), collapse/refill mechanics
- `types.ts` - Tile types (Sword, Star, Mana, Heal + specials), Position, Match interfaces

### Game Configuration (`src/game/config.ts`)
All game balance constants: board size, HP/mana values, damage per tile type, skill costs and effects

### UI Components (`src/ui/`)
- `Meter.ts` - Reusable HP/mana bar component
- `SkillButton.ts` - Skill button with enabled/ready states

### Telegram Integration (`src/telegram/telegram.ts`)
Initializes Telegram WebApp SDK (`ready()`, `expand()`)

## Key Patterns

- Tile sprites are tracked by ID in `Map<number, Phaser.GameObjects.Image>` for animation coordination
- Board operations return outcome objects (`ClearOutcome`, `CollapseResult`) that describe changes before rendering
- Turn system alternates between player and boss; boss uses simple greedy move search
- Tile textures are generated at runtime in BootScene, not loaded from images (except boss sprites)

## Deployment

Configured for GitHub Pages at `/match3-miniapp-mvp/` base path (see `vite.config.ts`)

