/**
 * Animation timing constants (in milliseconds)
 * Centralized to maintain consistent feel across all game animations
 */
export const ANIMATION_DURATIONS = {
  swap: 140,
  tileCollapse: 160,
  newTileDrop: 200,
  tileFade: 80,
  tileFly: 350,
  abilityOverlay: 200,
  abilityFadeIn: 300,
  abilityFadeOut: 300,
  flashDuration: 100,
  shakeDuration: 50,
} as const;

/**
 * Easing functions for different animation types
 * Using Phaser's built-in easing function names
 */
export const ANIMATION_EASING = {
  swap: "Quad.easeOut",
  collapse: "Quad.easeIn",
  fade: "Quad.easeIn",
  ability: "Quad.easeOut",
  scale: "Back.easeOut",
} as const;

/**
 * Visual effect parameters for game animations
 * Scale factors, shake offsets, and alpha values
 */
export const VISUAL_EFFECTS = {
  tileScaleReduction: 0.5,
  tileFadeAlpha: 0,
  bossShakeOffset: 8,
  damageShakeOffset: 5,
  transformScaleFactor: 1.2,
} as const;

/**
 * Flying tile animation parameters
 * Controls the visual effects when tiles fly to targets (player/boss)
 */
export const FLYING_TILE = {
  size: 32,
  arcHeight: 30,
  arcVariation: 15,
  targetSpread: 20,
  trailFade: 0.08,
  trailOpacity: 0.7,
  trailSize: 6,
  delayBetweenTiles: 30,
  flyingTileScaleReduction: 0.6,
} as const;
