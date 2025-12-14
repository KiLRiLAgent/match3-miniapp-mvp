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
    const base = tile.base;
    const left1 = x > 0 ? this.grid[y][x - 1] : null;
    const left2 = x > 1 ? this.grid[y][x - 2] : null;
    if (left1 && left2 && left1.base === base && left2.base === base) {
      return true;
    }
    const up1 = y > 0 ? this.grid[y - 1][x] : null;
    const up2 = y > 1 ? this.grid[y - 2][x] : null;
    if (up1 && up2 && up1.base === base && up2.base === base) {
      return true;
    }
    return false;
  }

  getTile(pos: Position): Tile | null {
    if (!this.inBounds(pos)) return null;
    return this.grid[pos.y][pos.x];
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

  swap(a: Position, b: Position) {
    const tmp = this.grid[a.y][a.x];
    this.grid[a.y][a.x] = this.grid[b.y][b.x];
    this.grid[b.y][b.x] = tmp;
  }

  findMatches(): Match[] {
    const matches: Match[] = [];
    // rows
    for (let y = 0; y < this.height; y++) {
      let x = 0;
      while (x < this.width) {
        const tile = this.grid[y][x];
        if (!tile) {
          x++;
          continue;
        }
        let runEnd = x + 1;
        while (
          runEnd < this.width &&
          this.grid[y][runEnd] &&
          this.grid[y][runEnd]!.base === tile.base
        ) {
          runEnd++;
        }
        const length = runEnd - x;
        if (length >= 3) {
          const positions: Position[] = [];
          for (let i = x; i < runEnd; i++) {
            positions.push({ x: i, y });
          }
          matches.push({
            positions,
            kind: tile.base,
            direction: "row",
          });
        }
        x = runEnd;
      }
    }

    // columns
    for (let x = 0; x < this.width; x++) {
      let y = 0;
      while (y < this.height) {
        const tile = this.grid[y][x];
        if (!tile) {
          y++;
          continue;
        }
        let runEnd = y + 1;
        while (
          runEnd < this.height &&
          this.grid[runEnd][x] &&
          this.grid[runEnd][x]!.base === tile.base
        ) {
          runEnd++;
        }
        const length = runEnd - y;
        if (length >= 3) {
          const positions: Position[] = [];
          for (let i = y; i < runEnd; i++) {
            positions.push({ x, y: i });
          }
          matches.push({
            positions,
            kind: tile.base,
            direction: "col",
          });
        }
        y = runEnd;
      }
    }

    return matches;
  }

  computeClearOutcome(
    matches: Match[],
    manualSpecials: Position[] = [],
    swapTargets: Position[] = []
  ): ClearOutcome {
    const clearSet = new Set<string>();
    const transforms: SpecialTransform[] = [];
    const counts = baseCountTemplate();
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
      if (match.positions.length >= 5) {
        specialKind = TileKind.Ultimate;
      } else if (match.positions.length === 4) {
        specialKind =
          match.direction === "row"
            ? TileKind.BoosterRow
            : TileKind.BoosterCol;
      }

      const specialPos = specialKind
        ? this.chooseSpecialAnchor(match, swapTargets)
        : null;

      for (const pos of match.positions) {
        if (specialPos && pos.x === specialPos.x && pos.y === specialPos.y) {
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

    const processedSpecials = new Set<string>();
    let expanded = true;
    while (expanded) {
      expanded = false;
      for (const posKey of Array.from(clearSet)) {
        if (processedSpecials.has(posKey)) continue;
        const pos = this.fromKey(posKey);
        const tile = this.getTile(pos);
        if (tile && this.isSpecial(tile.kind)) {
          const additions = this.blastArea(pos, tile.kind);
          additions.forEach(addPos);
          processedSpecials.add(posKey);
          expanded = true;
        }
      }
    }

    // Do not clear tiles that transform into specials
    for (const transform of transforms) {
      clearSet.delete(this.key(transform.pos));
    }

    const cleared: Array<{ pos: Position; tile: Tile }> = [];
    for (const key of clearSet) {
      const pos = this.fromKey(key);
      const tile = this.getTile(pos);
      if (tile) {
        cleared.push({ pos, tile });
        counts[tile.base] += 1;
      }
    }

    return { cleared, transforms, counts };
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

    const moves: CollapseMove[] = [];
    const newTiles: NewTile[] = [];

    for (let x = 0; x < this.width; x++) {
      let pointer = this.height - 1;
      for (let y = this.height - 1; y >= 0; y--) {
        const tile = this.grid[y][x];
        if (tile) {
          this.grid[pointer][x] = tile;
          if (pointer !== y) {
            moves.push({
              tile,
              from: { x, y },
              to: { x, y: pointer },
            });
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

  activateSpecial(pos: Position): ClearOutcome {
    const tile = this.getTile(pos);
    if (!tile || !this.isSpecial(tile.kind)) {
      return { cleared: [], transforms: [], counts: baseCountTemplate() };
    }
    const clearSet = new Set<string>();
    this.blastArea(pos, tile.kind).forEach((p) => clearSet.add(this.key(p)));
    const cleared: Array<{ pos: Position; tile: Tile }> = [];
    const counts = baseCountTemplate();
    for (const key of Array.from(clearSet)) {
      const p = this.fromKey(key);
      const t = this.getTile(p);
      if (t) {
        cleared.push({ pos: p, tile: t });
        counts[t.base] += 1;
      }
    }
    return { cleared, transforms: [], counts };
  }

  clearPositions(positions: Position[]): ClearOutcome {
    const counts = baseCountTemplate();
    const clearSet = new Set<string>();
    positions.forEach((pos) => {
      if (this.inBounds(pos)) {
        clearSet.add(this.key(pos));
      }
    });

    const queue = Array.from(clearSet);
    const visited = new Set<string>();
    while (queue.length) {
      const key = queue.pop();
      if (!key || visited.has(key)) continue;
      visited.add(key);
      const pos = this.fromKey(key);
      const tile = this.getTile(pos);
      if (tile && this.isSpecial(tile.kind)) {
        this.blastArea(pos, tile.kind).forEach((p) => {
          const k = this.key(p);
          if (!visited.has(k)) {
            clearSet.add(k);
            queue.push(k);
          }
        });
      }
    }

    const cleared: Array<{ pos: Position; tile: Tile }> = [];
    for (const key of clearSet) {
      const pos = this.fromKey(key);
      const tile = this.getTile(pos);
      if (tile) {
        cleared.push({ pos, tile });
        counts[tile.base] += 1;
      }
    }

    return { cleared, transforms: [], counts };
  }

  blastArea(pos: Position, kind: TileKind): Position[] {
    if (kind === TileKind.BoosterRow) {
      return Array.from({ length: this.width }, (_, x) => ({ x, y: pos.y }));
    }
    if (kind === TileKind.BoosterCol) {
      return Array.from({ length: this.height }, (_, y) => ({ x: pos.x, y }));
    }
    // Ultimate clears full row + column (plus pattern).
    const positions: Position[] = [];
    for (let x = 0; x < this.width; x++) {
      positions.push({ x, y: pos.y });
    }
    for (let y = 0; y < this.height; y++) {
      positions.push({ x: pos.x, y });
    }
    return positions;
  }

  private chooseSpecialAnchor(match: Match, swapTargets: Position[]): Position {
    if (swapTargets.length) {
      for (const target of swapTargets) {
        if (match.positions.find((p) => p.x === target.x && p.y === target.y)) {
          return target;
        }
      }
    }
    return match.positions[Math.floor(match.positions.length / 2)];
  }

  private key(pos: Position): string {
    return `${pos.x},${pos.y}`;
  }

  private fromKey(key: string): Position {
    const [x, y] = key.split(",").map((n) => Number(n));
    return { x, y };
  }
}
