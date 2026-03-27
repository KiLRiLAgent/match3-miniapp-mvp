import { TileKind } from "../match3/types";

export const ASSET_KEYS = {
  boss: {
    intro: "safira_intro",
    introBack: "safira_intro_back",
    main: "safira_main",
    mainBack: "safira_main_back",
    attack: "safira_attack",
    attackBack: "safira_attack_back",
    ulta: "safira_ulta",
    ultaBack: "safira_ulta_back",
    lowhp: "safira_lowhp",
    lowhpBack: "safira_lowhp_back",
    damage: "safira_damage",
    damageBack: "safira_damage_back",
    shield: "boss_shield",
  },
  intro: {
    background: "intro_background",
    vsLogo: "intro_vs",
    swords: "intro_swords",
    swordsGloom: "intro_swords_gloom",
    playerGloom: "intro_player_gloom",
    playerFrame: "player_frame",
    playerNameplate: "player_nameplate",
  },
  game: {
    background: "game_background",
  },
  player: {
    avatar: "player_avatar",
  },
  tiles: {
    [TileKind.Sword]: "tile_sword",
    [TileKind.Star]: "tile_star",
    [TileKind.Mana]: "tile_mana",
    [TileKind.Heal]: "tile_heal",
    /** @deprecated No longer generated — kept for type compatibility */
    [TileKind.BoosterRow]: "tile_booster_row",
    /** @deprecated No longer generated — kept for type compatibility */
    [TileKind.BoosterCol]: "tile_booster_col",
    /** @deprecated No longer generated — kept for type compatibility */
    [TileKind.Ultimate]: "tile_ultimate",
    [TileKind.Bomb]: "tile_bomb",
  },
  glow: {
    gold: "tile_glow_gold",
    red: "tile_glow_red",
  },
  effects: {
    slash: "effect_slash",
    slashDouble: "effect_slash_double",
  },
  particle: "particle",
  sfx: {
    gemSwipe: "gem_swipe",
    gemTap: "gem_tap",
    gemDestroy: "gem_destroy",
    gemFalldown: "gem_falldown",
    enemyAttack: "enemy_attack",
    enemyBombs: "enemy_bombs",
    enemyShield: "enemy_shield",
  },
  ui: {
    handArrow: "hand_arrow",
  },
  music: {
    bgm: "music_bgm",
  },
};
