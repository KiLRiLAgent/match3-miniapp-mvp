import { TileKind } from "../match3/types";

export const ASSET_KEYS = {
  boss: {
    stage100: "boss_stage_100",
    stage75: "boss_stage_75",
    stage50: "boss_stage_50",
    stage25: "boss_stage_25",
  },
  tiles: {
    [TileKind.Sword]: "tile_sword",
    [TileKind.Star]: "tile_star",
    [TileKind.Mana]: "tile_mana",
    [TileKind.Heal]: "tile_heal",
    [TileKind.BoosterRow]: "tile_booster_row",
    [TileKind.BoosterCol]: "tile_booster_col",
    [TileKind.Ultimate]: "tile_ultimate",
  },
};
