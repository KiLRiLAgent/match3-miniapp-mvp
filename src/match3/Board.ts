import { BASE_TYPES, CRIT_MULTIPLIERS } from "../game/config";
import { TileKind } from "./types";
import type { BaseTileKind, Chain, Match, Position, PotentialMove, Tile } from "./types";

export type SpecialTransform = {
  pos: Position;
  kind: TileKind;
  base: BaseTileKind;
  tile: Tile | null;
  multiplier?: number;
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

/** Convert match length to CRIT multiplier (4 = x2, 5+ = x3) */
function critMultiplier(matchLength: number): number {
  if (matchLength >= 5) return CRIT_MULTIPLIERS.match5;
  if (matchLength >= 4) return CRIT_MULTIPLIERS.match4;
  return 1;
}

export class Match3Board {
  width: number;
  height: number;
  grid: (Tile | null)[][];
  private nextId = 1;
  private rng: () => number;
  private chains: Map<string, Chain> = new Map();

  constructor(width: number, height: number, rng: () => number = Math.random) {
    this.width = width;
    this.height = height;
    this.grid = [];
    this.rng = rng;
    this.fillInitial();
  }

  static fromGrid(width: number, height: number, kinds: BaseTileKind[][]): Match3Board {
    const board = Object.create(Match3Board.prototype) as Match3Board;
    board.width = width;
    board.height = height;
    board.rng = Math.random;
    board.nextId = 1;
    board.chains = new Map();
    board.grid = kinds.map(row =>
      row.map(kind => ({ id: board.nextId++, kind, base: kind }))
    );
    return board;
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
      this.hasMatchInDirection(x, y, tile.base, [0, -1], [0, -2]) ||
      this.createsSquareMatch(x, y, tile.base)
    );
  }

  private createsSquareMatch(x: number, y: number, base: BaseTileKind): boolean {
    if (x < 1 || y < 1) return false;
    const tl = this.grid[y - 1]?.[x - 1];
    const tr = this.grid[y - 1]?.[x];
    const bl = this.grid[y]?.[x - 1];
    return tl?.base === base && tr?.base === base && bl?.base === base;
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
        if (!tile || this.isBomb(tile.kind) || this.isChained({ x, y })) continue;

        const positions: Position[] = [
          { x, y },
          { x: x + 1, y },
          { x, y: y + 1 },
          { x: x + 1, y: y + 1 }
        ];

        const allSame = positions.every(pos => {
          const t = this.getTile(pos);
          // Бомбы и зацепленные тайлы не участвуют в квадратных матчах
          return t && t.base === tile.base && !this.isBomb(t.kind) && !this.isChained(pos);
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

        // Бомбы и зацепленные тайлы не начинают матчи (тайл под цепью заблокирован)
        if (!tile || this.isBomb(tile.kind) || this.isChained(pos)) {
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

      // Бомбы и зацепленные тайлы не участвуют в матчах
      if (!tile || tile.base !== base || this.isBomb(tile.kind) || this.isChained(pos)) break;
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
    swapTargets: Position[] = []
  ): ClearOutcome {
    const clearSet = new Set<string>();
    const transforms: SpecialTransform[] = [];
    const addPos = (pos: Position) => {
      if (this.inBounds(pos)) {
        clearSet.add(this.key(pos));
      }
    };

    // Detect L-shape: row + col match of same kind sharing a position
    const usedInLShape = new Set<number>();

    for (let i = 0; i < matches.length; i++) {
      if (usedInLShape.has(i)) continue;
      for (let j = i + 1; j < matches.length; j++) {
        if (usedInLShape.has(j)) continue;
        const a = matches[i], b = matches[j];
        if (a.kind !== b.kind || a.direction === b.direction) continue;
        const corner = a.positions.find(pa =>
          b.positions.some(pb => this.positionsEqual(pa, pb))
        );
        if (!corner) continue;

        usedInLShape.add(i);
        usedInLShape.add(j);

        const uniquePositions = this.dedupePositions([...a.positions, ...b.positions]);
        const anchor = swapTargets.find(t =>
          uniquePositions.some(p => this.positionsEqual(p, t))
        ) ?? corner;

        for (const pos of uniquePositions) {
          if (!this.positionsEqual(pos, anchor)) addPos(pos);
        }

        const tileAtPos = this.getTile(anchor);
        transforms.push({
          pos: { ...anchor },
          kind: a.kind,
          base: a.kind,
          tile: tileAtPos,
          multiplier: critMultiplier(uniquePositions.length),
        });
      }
    }

    for (let idx = 0; idx < matches.length; idx++) {
      if (usedInLShape.has(idx)) continue;
      const match = matches[idx];

      if (match.positions.length >= 4) {
        // Enhanced tile: keep same kind, set multiplier
        const specialPos = this.chooseSpecialAnchor(match, swapTargets);

        for (const pos of match.positions) {
          if (specialPos && this.positionsEqual(pos, specialPos)) continue;
          addPos(pos);
        }

        if (specialPos) {
          const tileAtPos = this.getTile(specialPos);
          transforms.push({
            pos: { ...specialPos },
            kind: match.kind,
            base: match.kind,
            tile: tileAtPos,
            multiplier: critMultiplier(match.positions.length),
          });
        }
      } else {
        // Normal 3-match: clear all
        for (const pos of match.positions) {
          addPos(pos);
        }
      }
    }

    // CRIT tiles are also cleared (no special tiles remain on board)
    // Add transform positions to clearSet if not already there
    for (const transform of transforms) {
      clearSet.add(this.key(transform.pos));
    }

    const { cleared, counts: finalCounts } = this.buildClearOutcome(clearSet);
    return { cleared, transforms, counts: finalCounts };
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
        counts[tile.base] += tile.multiplier ?? 1;
      }
    }

    return { cleared, counts };
  }

  applyClearOutcome(outcome: ClearOutcome): CollapseResult {
    // Transforms are informational only (for CRIT text display) — no tile modification needed
    // All matched tiles (including CRIT anchors) are in cleared list

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

  private chooseSpecialAnchor(match: Match, swapTargets: Position[]): Position {
    const swappedPosition = swapTargets.find((target) =>
      match.positions.some((p) => this.positionsEqual(p, target))
    );

    return swappedPosition ?? match.positions[Math.floor(match.positions.length / 2)];
  }

  private dedupePositions(positions: Position[]): Position[] {
    const seen = new Set<string>();
    return positions.filter(p => {
      const k = this.key(p);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
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


  findPotentialMoves(): PotentialMove[] {
    const moves: PotentialMove[] = [];
    const dirs: Position[] = [{ x: 1, y: 0 }, { x: 0, y: 1 }];

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const from = { x, y };
        const tile = this.getTile(from);
        if (!tile || this.isBomb(tile.kind)) continue;

        for (const dir of dirs) {
          const to = { x: x + dir.x, y: y + dir.y };
          if (!this.inBounds(to)) continue;
          const other = this.getTile(to);
          if (!other || this.isBomb(other.kind)) continue;

          this.swap(from, to);
          const allMatches = this.findMatches();
          this.swap(from, to);

          const isSwapped = (p: Position) =>
            this.positionsEqual(p, from) || this.positionsEqual(p, to);

          // Only keep matches that involve at least one of the swapped positions
          const matches = allMatches.filter(m => m.positions.some(isSwapped));

          if (matches.length > 0) {
            // Determine which tile actually forms the match:
            // After swap, tile from 'from' sits at 'to' and vice versa.
            // fromInMatch = tile originally at 'from' (now at 'to') is in a match
            const fromInMatch = matches.some(m => m.positions.some(p => this.positionsEqual(p, to)));
            // toInMatch = tile originally at 'to' (now at 'from') is in a match
            const toInMatch = matches.some(m => m.positions.some(p => this.positionsEqual(p, from)));

            // If only the 'to' tile forms a match (at 'from' position), flip direction
            let moveFrom = from;
            let moveTo = to;
            if (toInMatch && !fromInMatch) {
              moveFrom = to;
              moveTo = from;
            }

            // Collect stationary match partners from ALL matches
            // (exclude swapped tiles — they're already shown via from/to and the shake animation)
            const partnerKeys = new Set<string>();
            for (const m of matches) {
              for (const p of m.positions) {
                if (!isSwapped(p)) partnerKeys.add(this.key(p));
              }
            }
            const allLengths = matches.map(m => m.positions.length);
            const maxMatchLength = allLengths.length > 0
              ? Math.max(...allLengths)
              : 0;
            moves.push({
              from: moveFrom,
              to: moveTo,
              matchPositions: Array.from(partnerKeys).map(k => this.fromKey(k)),
              maxMatchLength,
            });
          }
        }
      }
    }

    return moves;
  }

  // === Bomb methods ===

  placeBombs(count: number, bombCooldown: number): {
    placed: Array<{ pos: Position; tile: Tile }>;
    replaced: Array<{ pos: Position; tile: Tile }>;
  } {
    const available: Position[] = [];
    this.forEachTile((pos, tile) => {
      if (!this.isBomb(tile.kind)) {
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

  /** Fisher-Yates shuffle of all non-special, non-bomb tiles */
  shuffleBaseTiles(): void {
    const positions: Position[] = [];
    this.forEachTile((pos, tile) => {
      if (!this.isBomb(tile.kind)) {
        positions.push(pos);
      }
    });

    // Fisher-Yates
    for (let i = positions.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      const posA = positions[i];
      const posB = positions[j];
      const tmp = this.grid[posA.y][posA.x];
      this.grid[posA.y][posA.x] = this.grid[posB.y][posB.x];
      this.grid[posB.y][posB.x] = tmp;
    }
  }

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

  // === Chain methods ===

  private chainKey(pos: Position): string {
    return `${pos.x},${pos.y}`;
  }

  /**
   * Place chains on the board. Replaces any existing chains (idempotent).
   * Chains are positional overlay state — tiles UNDER chains match normally.
   */
  placeChains(placements: Chain[]): void {
    this.chains.clear();
    for (const c of placements) {
      this.chains.set(this.chainKey(c.pos), { ...c });
    }
  }

  isChained(pos: Position): boolean {
    return this.chains.has(this.chainKey(pos));
  }

  getChainAt(pos: Position): Chain | undefined {
    return this.chains.get(this.chainKey(pos));
  }

  getAllChains(): Chain[] {
    return Array.from(this.chains.values()).map(c => ({ ...c }));
  }

  /**
   * Returns chains adjacent to (or AT) any of the cleared positions.
   * Returns SHALLOW COPIES (snapshots) — caller can hold them across async
   * boundaries without risk of mutation. Adjacency = orthogonal 4-directional
   * + position itself (chain "lives on top of" a tile).
   */
  getDamagedChains(clearedPositions: Position[]): Chain[] {
    const seen = new Set<string>();
    const damaged: Chain[] = [];
    for (const pos of clearedPositions) {
      const candidates: Position[] = [
        pos,
        { x: pos.x - 1, y: pos.y },
        { x: pos.x + 1, y: pos.y },
        { x: pos.x, y: pos.y - 1 },
        { x: pos.x, y: pos.y + 1 },
      ];
      for (const c of candidates) {
        const key = this.chainKey(c);
        if (seen.has(key)) continue;
        const chain = this.chains.get(key);
        if (chain) {
          damaged.push({ ...chain });
          seen.add(key);
        }
      }
    }
    return damaged;
  }

  /**
   * Reduces HP by 1 of chains matching the given snapshot positions.
   * Looks up REAL chain in internal map by pos, mutates HP in place.
   * Caller's array NOT mutated. Returns broken (removed) and remaining.
   */
  damageChains(chains: Chain[]): { broken: Chain[]; remaining: Chain[] } {
    const broken: Chain[] = [];
    const remaining: Chain[] = [];
    for (const snapshot of chains) {
      const key = this.chainKey(snapshot.pos);
      const real = this.chains.get(key);
      if (!real) continue;
      real.hp -= 1;
      if (real.hp <= 0) {
        this.chains.delete(key);
        broken.push({ ...real });
      } else {
        remaining.push({ ...real });
      }
    }
    return { broken, remaining };
  }

  get hasActiveChains(): boolean {
    return this.chains.size > 0;
  }

  clearChains(): void {
    this.chains.clear();
  }
}
