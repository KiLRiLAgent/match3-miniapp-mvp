import { TileKind } from "../match3/types";

export const ASSET_KEYS = {
  boss: {
    stage0: "boss_stage_0",
    stage1: "boss_stage_1",
    stage2: "boss_stage_2",
    stage3: "boss_stage_3",
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
