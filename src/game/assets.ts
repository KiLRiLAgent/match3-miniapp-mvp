import { TileKind } from "../match3/types";

export const ASSET_KEYS = {
  boss: {
    normal: "kristi_1",
    damaged: "kristi_2",
    ulta: "kristi_ulta",
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
