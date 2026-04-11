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
    // Поле — тайлы и матчи
    gemSwipe: "gem_swipe",
    gemTap: "gem_tap",
    gemDestroy: "gem_destroy",
    gemFalldown: "gem_falldown",
    // Бой — урон по боссу
    enemyHit1: "enemy_hit_1",
    enemyHit2: "enemy_hit_2",
    enemyHit3: "enemy_hit_3",
    enemyHit4: "enemy_hit_4",
    enemyLevelDestroyed: "enemy_level_destroyed",
    // Способности босса
    enemyAttack: "enemy_attack",
    enemyPowerAttack: "enemy_power_attack",
    enemyBombs: "enemy_bombs",
    enemyBombExplode: "enemy_bomb_explode",
    enemyShield: "enemy_shield",
    enemyShieldDestroyed: "enemy_shield_destroyed",
    // Скиллы и молот
    explosionMode: "explosion_mode",
    // HUD и состояния
    lowHealth: "low_health",
    critX2: "crit_x2",
    critX3: "crit_x3",
    critX4: "crit_x4",
    critX5: "crit_x5",
    critX6: "crit_x6",
    // UI
    uiLevelup: "ui_levelup",
    uiCardSelect: "ui_card_select",
    uiTap: "ui_tap",
    // Конец игры
    defeat: "defeat",
  },
  ui: {
    handArrow: "hand_arrow",
  },
  music: {
    bgm: "music_bgm",
  },
};
