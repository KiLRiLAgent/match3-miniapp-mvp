import { BASE_TYPES } from "../game/config";
import { TileKind } from "./types";
import type { BaseTileKind, Match, Position, Tile } from "./types";

export type SpecialTransform = {
  pos: Position;
  kind: TileKind;
  base: BaseTileKind;
  tile: Tile | null;
};

export type ClearOutcome = {
  cleared: Array<{ pos: Position; tile: Tile }>;
  transforms: SpecialTransform[];
  counts: Record<BaseTileKind, number>;
};

export type CollapseMove = {
  tile: Tile;
  from: Position;
  to: Position;
};

export type NewTile = {
  tile: Tile;
  pos: Position;
};

export type CollapseResult = {
  moves: CollapseMove[];
  newTiles: NewTile[];
};

export const baseCountTemplate = (): Record<BaseTileKind, number> => ({
  [TileKind.Sword]: 0,
  [TileKind.Star]: 0,
  [TileKind.Mana]: 0,
  [TileKind.Heal]: 0,
});

export class Match3Board {
  width: number;
  height: number;
  grid: (Tile | null)[][];
  private nextId = 1;
  private rng: () => number;

  constructor(width: number, height: number, rng: () => number = Math.random) {
    this.width = width;
    this.height = height;
    this.grid = [];
    this.rng = rng;
    this.fillInitial();
  }

  private randomBase(): BaseTileKind {
    const index = Math.floor(this.rng() * BASE_TYPES.length);
    return BASE_TYPES[index];
  }

  private createTile(kind: BaseTileKind): Tile {
    return {
      id: this.nextId++,
      kind,
      base: kind,
    };
  }

  private fillInitial() {
    for (let y = 0; y < this.height; y++) {
      this.grid[y] = [];
      for (let x = 0; x < this.width; x++) {
        let tile: Tile;
        do {
          tile = this.createTile(this.randomBase());
          this.grid[y][x] = tile;
        } while (this.createsImmediateMatch(x, y));
      }
    }
  }

  private createsImmediateMatch(x: number, y: number): boolean {
    const tile = this.grid[y][x];
    if (!tile) return false;

    return (
      this.hasMatchInDirection(x, y, tile.base, [-1, 0], [-2, 0]) ||
      this.hasMatchInDirection(x, y, tile.base, [0, -1], [0, -2])
    );
  }

  private hasMatchInDirection(
    x: number,
    y: number,
    base: BaseTileKind,
    offset1: [number, number],
    offset2: [number, number]
  ): boolean {
    const tile1 = this.getTile({ x: x + offset1[0], y: y + offset1[1] });
    const tile2 = this.getTile({ x: x + offset2[0], y: y + offset2[1] });
    return tile1?.base === base && tile2?.base === base;
  }

  getTile(pos: Position): Tile | null {
    if (!this.inBounds(pos)) return null;
    return this.grid[pos.y][pos.x];
  }

  removeTile(pos: Position): void {
    if (this.inBounds(pos)) {
      this.grid[pos.y][pos.x] = null;
    }
  }

  inBounds(pos: Position): boolean {
    return (
      pos.x >= 0 &&
      pos.x < this.width &&
      pos.y >= 0 &&
      pos.y < this.height
    );
  }

  isSpecial(kind: TileKind): boolean {
    return (
      kind === TileKind.BoosterRow ||
      kind === TileKind.BoosterCol ||
      kind === TileKind.Ultimate
    );
  }

  isBomb(kind: TileKind): boolean {
    return kind === TileKind.Bomb;
  }

  swap(a: Position, b: Position) {
    if (!this.inBounds(a) || !this.inBounds(b)) return;
    const tmp = this.grid[a.y][a.x];
    this.grid[a.y][a.x] = this.grid[b.y][b.x];
    this.grid[b.y][b.x] = tmp;
  }

  findMatches(): Match[] {
    const matches: Match[] = [];
    matches.push(...this.findMatchesInDirection("row"));
    matches.push(...this.findMatchesInDirection("col"));
    matches.push(...this.findSquareMatches());
    return matches;
  }

  private findSquareMatches(): Match[] {
    const matches: Match[] = [];

    for (let y = 0; y < this.height - 1; y++) {
      for (let x = 0; x < this.width - 1; x++) {
        const tile = this.getTile({ x, y });
        if (!tile || this.isBomb(tile.kind)) continue;

        const positions: Position[] = [
          { x, y },
          { x: x + 1, y },
          { x, y: y + 1 },
          { x: x + 1, y: y + 1 }
        ];

        const allSame = positions.every(pos => {
          const t = this.getTile(pos);
          // Бомбы не участвуют в квадратных матчах
          return t && t.base === tile.base && !this.isBomb(t.kind);
        });

        if (allSame) {
          matches.push({
            positions,
            kind: tile.base,
            direction: "row",
          });
        }
      }
    }

    return matches;
  }

  private findMatchesInDirection(direction: "row" | "col"): Match[] {
    const matches: Match[] = [];
    const [outerLimit, innerLimit] =
      direction === "row" ? [this.height, this.width] : [this.width, this.height];

    for (let outer = 0; outer < outerLimit; outer++) {
      let inner = 0;
      while (inner < innerLimit) {
        const pos =
          direction === "row" ? { x: inner, y: outer } : { x: outer, y: inner };
        const tile = this.getTile(pos);

        // Бомбы не начинают матчи
        if (!tile || this.isBomb(tile.kind)) {
          inner++;
          continue;
        }

        const runEnd = this.findRunEnd(pos, direction, tile.base);
        const length = runEnd - inner;

        if (length >= 3) {
          matches.push({
            positions: this.buildRunPositions(inner, runEnd, outer, direction),
            kind: tile.base,
            direction,
          });
        }

        inner = runEnd;
      }
    }

    return matches;
  }

  private findRunEnd(
    start: Position,
    direction: "row" | "col",
    base: BaseTileKind
  ): number {
    const limit = direction === "row" ? this.width : this.height;
    const index = direction === "row" ? start.x : start.y;
    let runEnd = index + 1;

    while (runEnd < limit) {
      const pos =
        direction === "row"
          ? { x: runEnd, y: start.y }
          : { x: start.x, y: runEnd };
      const tile = this.getTile(pos);

      // Бомбы не участвуют в матчах
      if (!tile || tile.base !== base || this.isBomb(tile.kind)) break;
      runEnd++;
    }

    return runEnd;
  }

  private buildRunPositions(
    start: number,
    end: number,
    fixed: number,
    direction: "row" | "col"
  ): Position[] {
    const positions: Position[] = [];
    for (let i = start; i < end; i++) {
      positions.push(
        direction === "row" ? { x: i, y: fixed } : { x: fixed, y: i }
      );
    }
    return positions;
  }

  computeClearOutcome(
    matches: Match[],
    manualSpecials: Position[] = [],
    swapTargets: Position[] = []
  ): ClearOutcome {
    const clearSet = new Set<string>();
    const transforms: SpecialTransform[] = [];
    const addPos = (pos: Position) => {
      if (this.inBounds(pos)) {
        clearSet.add(this.key(pos));
      }
    };

    manualSpecials.forEach((pos) => {
      const tile = this.getTile(pos);
      if (tile && this.isSpecial(tile.kind)) {
        this.blastArea(pos, tile.kind).forEach(addPos);
      }
    });

    for (const match of matches) {
      let specialKind: TileKind | null = null;
      // Увеличены требования: 6+ для Ultimate, 5 для Booster
      if (match.positions.length >= 6) {
        specialKind = TileKind.Ultimate;
      } else if (match.positions.length === 5) {
        specialKind =
          match.direction === "row"
            ? TileKind.BoosterRow
            : TileKind.BoosterCol;
      }

      const specialPos = specialKind
        ? this.chooseSpecialAnchor(match, swapTargets)
        : null;

      for (const pos of match.positions) {
        if (specialPos && this.positionsEqual(pos, specialPos)) {
          continue;
        }
        addPos(pos);
      }

      if (specialKind && specialPos) {
        const tileAtPos = this.getTile(specialPos);
        transforms.push({
          pos: { ...specialPos },
          kind: specialKind,
          base: match.kind,
          tile: tileAtPos,
        });
      }
    }

    this.expandSpecialsCascade(clearSet, addPos);

    // Do not clear tiles that transform into specials
    for (const transform of transforms) {
      clearSet.delete(this.key(transform.pos));
    }

    const { cleared, counts: finalCounts } = this.buildClearOutcome(clearSet);
    return { cleared, transforms, counts: finalCounts };
  }

  private expandSpecialsCascade(
    clearSet: Set<string>,
    addPos: (pos: Position) => void
  ): void {
    const processedSpecials = new Set<string>();
    const queue = Array.from(clearSet);

    while (queue.length > 0) {
      const posKey = queue.shift()!;
      if (processedSpecials.has(posKey)) continue;

      const pos = this.fromKey(posKey);
      const tile = this.getTile(pos);

      if (tile && this.isSpecial(tile.kind)) {
        processedSpecials.add(posKey);
        const additions = this.blastArea(pos, tile.kind);
        additions.forEach((p) => {
          addPos(p);
          const key = this.key(p);
          if (!processedSpecials.has(key)) {
            queue.push(key);
          }
        });
      }
    }
  }

  private buildClearOutcome(clearSet: Set<string>): {
    cleared: Array<{ pos: Position; tile: Tile }>;
    counts: Record<BaseTileKind, number>;
  } {
    const cleared: Array<{ pos: Position; tile: Tile }> = [];
    const counts = baseCountTemplate();

    for (const key of clearSet) {
      const pos = this.fromKey(key);
      const tile = this.getTile(pos);
      if (tile) {
        cleared.push({ pos, tile });
        counts[tile.base] += 1;
      }
    }

    return { cleared, counts };
  }

  applyClearOutcome(outcome: ClearOutcome): CollapseResult {
    // Apply transforms first so they can fall with the rest of the column if needed.
    outcome.transforms.forEach((transform) => {
      const current = this.getTile(transform.pos);
      if (current) {
        current.kind = transform.kind;
        current.base = transform.base;
      } else {
        this.grid[transform.pos.y][transform.pos.x] = {
          id: this.nextId++,
          kind: transform.kind,
          base: transform.base,
        };
      }
    });

    outcome.cleared.forEach(({ pos }) => {
      this.grid[pos.y][pos.x] = null;
    });

    return this.collapseGrid();
  }

  /** Collapse grid after removing tiles (e.g. exploded bombs) - tiles fall down, new tiles spawn */
  collapseGrid(): CollapseResult {
    const moves: CollapseMove[] = [];
    const newTiles: NewTile[] = [];

    for (let x = 0; x < this.width; x++) {
      let pointer = this.height - 1;
      for (let y = this.height - 1; y >= 0; y--) {
        const tile = this.grid[y][x];
        if (tile) {
          this.grid[pointer][x] = tile;
          if (pointer !== y) {
            moves.push({ tile, from: { x, y }, to: { x, y: pointer } });
            this.grid[y][x] = null;
          }
          pointer--;
        }
      }

      for (let fillY = pointer; fillY >= 0; fillY--) {
        const tile = this.createTile(this.randomBase());
        this.grid[fillY][x] = tile;
        newTiles.push({ tile, pos: { x, y: fillY } });
      }
    }

    return { moves, newTiles };
  }

  blastArea(pos: Position, kind: TileKind): Position[] {
    if (kind === TileKind.BoosterRow) {
      return this.buildRowPositions(pos.y);
    }
    if (kind === TileKind.BoosterCol) {
      return this.buildColumnPositions(pos.x);
    }
    // Ultimate: row + column (plus pattern)
    return [
      ...this.buildRowPositions(pos.y),
      ...this.buildColumnPositions(pos.x).filter((p) => p.y !== pos.y),
    ];
  }

  private buildRowPositions(y: number): Position[] {
    return Array.from({ length: this.width }, (_, x) => ({ x, y }));
  }

  private buildColumnPositions(x: number): Position[] {
    return Array.from({ length: this.height }, (_, y) => ({ x, y }));
  }

  private chooseSpecialAnchor(match: Match, swapTargets: Position[]): Position {
    const swappedPosition = swapTargets.find((target) =>
      match.positions.some((p) => this.positionsEqual(p, target))
    );

    return swappedPosition ?? match.positions[Math.floor(match.positions.length / 2)];
  }

  private positionsEqual(a: Position, b: Position): boolean {
    return a.x === b.x && a.y === b.y;
  }

  private key(pos: Position): string {
    return `${pos.x},${pos.y}`;
  }

  private fromKey(key: string): Position {
    const [x, y] = key.split(",").map(Number);
    return { x, y };
  }

  /** Iterates all tiles on the board, calling fn for each non-null tile */
  private forEachTile(fn: (pos: Position, tile: Tile) => void): void {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const tile = this.grid[y][x];
        if (tile) fn({ x, y }, tile);
      }
    }
  }

  // === Bomb methods ===

  placeBombs(count: number, bombCooldown: number): {
    placed: Array<{ pos: Position; tile: Tile }>;
    replaced: Array<{ pos: Position; tile: Tile }>;
  } {
    const available: Position[] = [];
    this.forEachTile((pos, tile) => {
      if (!this.isBomb(tile.kind) && !this.isSpecial(tile.kind)) {
        available.push(pos);
      }
    });

    const placed: Array<{ pos: Position; tile: Tile }> = [];
    const replaced: Array<{ pos: Position; tile: Tile }> = [];

    for (let i = 0; i < count && available.length > 0; i++) {
      const idx = Math.floor(this.rng() * available.length);
      const pos = available.splice(idx, 1)[0];
      const oldTile = this.getTile(pos);

      if (oldTile) {
        replaced.push({ pos, tile: oldTile });

        const bombTile: Tile = {
          id: this.nextId++,
          kind: TileKind.Bomb,
          base: oldTile.base,
          cooldown: bombCooldown,
        };
        this.grid[pos.y][pos.x] = bombTile;
        placed.push({ pos, tile: bombTile });
      }
    }

    return { placed, replaced };
  }

  tickBombs(): { exploded: Array<{ pos: Position; tile: Tile }>; remaining: Tile[] } {
    const exploded: Array<{ pos: Position; tile: Tile }> = [];
    const remaining: Tile[] = [];

    this.forEachTile((pos, tile) => {
      if (this.isBomb(tile.kind) && tile.cooldown !== undefined) {
        tile.cooldown--;
        if (tile.cooldown <= 0) {
          exploded.push({ pos, tile });
        } else {
          remaining.push(tile);
        }
      }
    });

    return { exploded, remaining };
  }

  private static readonly ORTHOGONAL_DIRS = [
    { x: -1, y: 0 },
    { x: 1, y: 0 },
    { x: 0, y: -1 },
    { x: 0, y: 1 },
  ] as const;

  getAdjacentBombs(clearedPositions: Position[]): Position[] {
    const bombsToRemove: Position[] = [];
    const seen = new Set<string>();

    for (const pos of clearedPositions) {
      for (const dir of Match3Board.ORTHOGONAL_DIRS) {
        const adjacent = { x: pos.x + dir.x, y: pos.y + dir.y };
        const key = this.key(adjacent);
        if (seen.has(key)) continue;

        const tile = this.getTile(adjacent);
        if (tile && this.isBomb(tile.kind)) {
          seen.add(key);
          bombsToRemove.push(adjacent);
        }
      }
    }

    return bombsToRemove;
  }
}
