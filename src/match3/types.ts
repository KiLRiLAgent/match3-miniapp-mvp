export enum TileKind {
  Sword = "sword",
  Star = "star",
  Mana = "mana",
  Heal = "heal",
  /** @deprecated No longer generated — kept for backward compatibility */
  BoosterRow = "boosterRow",
  /** @deprecated No longer generated — kept for backward compatibility */
  BoosterCol = "boosterCol",
  /** @deprecated No longer generated — kept for backward compatibility */
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
  multiplier?: number;
};

type MatchDirection = "row" | "col";

export type Match = {
  positions: Position[];
  kind: BaseTileKind;
  direction: MatchDirection;
};

export type CountTotals = Record<BaseTileKind, number>;

export type PotentialMove = {
  from: Position;
  to: Position;
  matchPositions: Position[];
  maxMatchLength: number;
};

