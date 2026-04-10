/**
 * theme — shared v2 visual constants.
 *
 * Pure data module (ZERO Phaser imports). Mirrors the itemFormat.ts pattern:
 * only type imports from content/core, no runtime dependencies.
 *
 * Phase 2B R2B-2 dedup — extracted from HubScene / ArenaScene / ShopScene /
 * PlayerStatsScene / CharacterGalleryScene / ArenaRunScene / ArenaRewardScene
 * / LocationScene / StoryMapScene which all duplicated these values as local
 * `const` declarations. Scenes that need a DIFFERENT value for a specific
 * constant (e.g. StoryMapScene uses a darker BG) keep a local override.
 */

// ─── Colors ──────────────────────────────────────────────────────────────────

export const V2_COLORS = {
  /** Default v2 scene background. */
  bg: 0x1a0f2e,
  titleColor: "#e6c068",
  subtitleColor: "#9f7fc7",
  bodyColor: "#d4b8e8",
  valueColor: "#f4e4c1",
  bonusColor: "#4caf50",
  negativeColor: "#e64a4a",
  emptySlotColor: "#8a7ab0",

  /** Row/card backgrounds. */
  rowBg: 0x231436,
  rowBgHover: 0x33224c,
  rowStroke: 0x4a2d6e,

  /** Primary button (gold accent). */
  primaryBg: 0x4a2d6e,
  primaryBgHover: 0x6a4a90,
  primaryStroke: 0xe6c068,
  primaryText: "#f4e4c1",
  primaryTextHover: "#ffffff",

  /** Secondary / back button (muted purple). */
  secondaryBg: 0x2a1845,
  secondaryBgHover: 0x3a2358,
  secondaryStroke: 0x9f7fc7,
  secondaryText: "#b8a8d0",
  secondaryTextHover: "#e6c068",

  /** Avatar / portrait. */
  avatarBg: 0x2a1845,
  avatarStroke: 0xe6c068,
} as const;

// ─── Typography ──────────────────────────────────────────────────────────────

export const V2_FONTS = {
  primary: "'Exo 2', Arial, sans-serif",
} as const;

// ─── Layout ──────────────────────────────────────────────────────────────────

export const V2_SPACING = {
  /** Default primary button dimensions (dp). */
  primaryBtnWidth: 300,
  primaryBtnHeight: 64,
  /** Default secondary button dimensions (dp). */
  secondaryBtnWidth: 260,
  secondaryBtnHeight: 52,
  /** Back button dimensions (dp). */
  backBtnWidth: 180,
  backBtnHeight: 48,

  /** Row dimensions used in PlayerStatsScene / ShopScene (dp). */
  rowWidth: 360,
  rowHeight: 40,
  rowGap: 8,
} as const;
