import { TileKind } from "../match3/types";

export const ASSET_KEYS = {
  boss: {
    normal: "safira_normal",
    battle: "safira_battle",
    damaged: "safira_damaged",
    ulta: "safira_ulta",
  },
  intro: {
    background: "intro_background",
    vsLogo: "intro_vs",
    swords: "intro_swords",
    swordsGloom: "intro_swords_gloom",
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
    [TileKind.BoosterRow]: "tile_booster_row",
    [TileKind.BoosterCol]: "tile_booster_col",
    [TileKind.Ultimate]: "tile_ultimate",
    [TileKind.Bomb]: "tile_bomb",
  },
};
