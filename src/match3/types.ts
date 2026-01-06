export enum TileKind {
  Sword = "sword",
  Star = "star",
  Mana = "mana",
  Heal = "heal",
  BoosterRow = "boosterRow",
  BoosterCol = "boosterCol",
  Ultimate = "ultimate",
  Bomb = "bomb",
}

export type BaseTileKind =
  | TileKind.Sword
  | TileKind.Star
  | TileKind.Mana
  | TileKind.Heal;

export type Position = {
  x: number;
  y: number;
};

export type Tile = {
  id: number;
  kind: TileKind;
  base: BaseTileKind;
  cooldown?: number;
};

export type MatchDirection = "row" | "col";

export type Match = {
  positions: Position[];
  kind: BaseTileKind;
  direction: MatchDirection;
};

export type CountTotals = Record<BaseTileKind, number>;
