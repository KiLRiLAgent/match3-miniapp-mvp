/**
 * GOLD STANDARD: Asset Management Patterns
 *
 * Assets are loaded and referenced through a centralized system:
 *
 * 1. ASSET_KEYS REGISTRY (src/game/assets.ts)
 *    - All texture keys defined in a single ASSET_KEYS object
 *    - Organized by category: boss, intro, game, player, tiles, glow, effects, sfx, ui, music
 *    - Never use string literals for texture keys — always reference ASSET_KEYS
 *
 *      // CORRECT
 *      this.load.image(ASSET_KEYS.effects.slash, "splash_1.png");
 *      scene.add.image(x, y, ASSET_KEYS.tiles[TileKind.Sword]);
 *
 *      // WRONG
 *      this.load.image("effect_slash", "splash_1.png");
 *      scene.add.image(x, y, "tile_sword");
 *
 * 2. BOOTSCENE PRELOAD (src/scenes/BootScene.ts)
 *    - All external assets loaded in BootScene.preload()
 *    - Programmatic textures generated in BootScene.create()
 *    - Canvas-based textures for glows (radial gradient)
 *    - Graphics-based textures for special tiles (rounded rects, circles)
 *
 * 3. CANVAS GLOW TEXTURES
 *    - Created via document.createElement("canvas") + 2d context
 *    - Use radial gradients with multiple color stops for smooth falloff
 *    - Register with this.textures.addCanvas(key, canvas)
 *    - Size proportional to CELL_SIZE with DPR scaling
 *
 *      const size = Math.ceil(CELL_SIZE * 1.4 * d);
 *      const grad = ctx.createRadialGradient(center, center, 0, center, center, center);
 *      grad.addColorStop(0, rgba(1.0));
 *      grad.addColorStop(0.4, rgba(0.7));
 *      grad.addColorStop(0.7, rgba(0.4));
 *      grad.addColorStop(1, rgba(0));
 *
 * 4. ADDING NEW ASSETS
 *    Step 1: Add key to ASSET_KEYS in src/game/assets.ts
 *    Step 2: Load in BootScene.preload() using the ASSET_KEYS reference
 *    Step 3: Reference in game code via ASSET_KEYS
 *
 * 5. DPR SCALING
 *    - All generated textures account for device pixel ratio (DPR)
 *    - Canvas dimensions: size * DPR
 *    - Drawing coordinates: value * d (where d = DPR)
 */
