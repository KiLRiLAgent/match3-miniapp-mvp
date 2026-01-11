import { describe, it, expect, beforeEach } from "vitest";
import { Match3Board } from "../match3/Board";
import { TileKind } from "../match3/types";

import type { Match } from "../match3/types";

// Deterministic RNG for testing
function createSeededRNG(seed: number) {
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

// Check if a match is a 2x2 square (4 positions forming a 2x2 grid)
function isSquareMatch(match: Match): boolean {
  if (match.positions.length !== 4) return false;
  const xs = match.positions.map(p => p.x);
  const ys = match.positions.map(p => p.y);
  const uniqueXs = [...new Set(xs)];
  const uniqueYs = [...new Set(ys)];
  return uniqueXs.length === 2 && uniqueYs.length === 2;
}

describe("Match3Board", () => {
  describe("initialization", () => {
    it("should create a board with correct dimensions", () => {
      const board = new Match3Board(8, 7);
      expect(board.width).toBe(8);
      expect(board.height).toBe(7);
    });

    it("should fill all positions with tiles", () => {
      const board = new Match3Board(8, 7);
      for (let y = 0; y < 7; y++) {
        for (let x = 0; x < 8; x++) {
          const tile = board.getTile({ x, y });
          expect(tile).not.toBeNull();
          expect(tile?.id).toBeGreaterThan(0);
        }
      }
    });

    it("should not create initial horizontal or vertical 3-run matches", () => {
      // Test with seeded RNG for determinism
      // The board should prevent 3-in-a-row/column matches during initialization
      const board = new Match3Board(8, 7, createSeededRNG(42));
      const matches = board.findMatches();
      // Note: The board may still have 2x2 square matches
      // We only verify that no horizontal or vertical run matches of length >= 3 exist
      const runMatches = matches.filter(
        m => m.positions.length >= 3 && !isSquareMatch(m)
      );
      expect(runMatches.length).toBe(0);
    });

    it("should use custom RNG when provided", () => {
      const board1 = new Match3Board(4, 4, createSeededRNG(12345));
      const board2 = new Match3Board(4, 4, createSeededRNG(12345));

      // Both boards should have same tile layout
      for (let y = 0; y < 4; y++) {
        for (let x = 0; x < 4; x++) {
          expect(board1.getTile({ x, y })?.kind).toBe(board2.getTile({ x, y })?.kind);
        }
      }
    });
  });

  describe("bounds checking", () => {
    let board: Match3Board;

    beforeEach(() => {
      board = new Match3Board(8, 7);
    });

    it("should return true for valid positions", () => {
      expect(board.inBounds({ x: 0, y: 0 })).toBe(true);
      expect(board.inBounds({ x: 7, y: 6 })).toBe(true);
      expect(board.inBounds({ x: 4, y: 3 })).toBe(true);
    });

    it("should return false for invalid positions", () => {
      expect(board.inBounds({ x: -1, y: 0 })).toBe(false);
      expect(board.inBounds({ x: 8, y: 0 })).toBe(false);
      expect(board.inBounds({ x: 0, y: -1 })).toBe(false);
      expect(board.inBounds({ x: 0, y: 7 })).toBe(false);
    });

    it("should return null for out of bounds getTile", () => {
      expect(board.getTile({ x: -1, y: 0 })).toBeNull();
      expect(board.getTile({ x: 100, y: 100 })).toBeNull();
    });
  });

  describe("swap", () => {
    let board: Match3Board;

    beforeEach(() => {
      board = new Match3Board(8, 7);
    });

    it("should swap two adjacent tiles", () => {
      const tileA = board.getTile({ x: 0, y: 0 });
      const tileB = board.getTile({ x: 1, y: 0 });

      board.swap({ x: 0, y: 0 }, { x: 1, y: 0 });

      expect(board.getTile({ x: 0, y: 0 })).toBe(tileB);
      expect(board.getTile({ x: 1, y: 0 })).toBe(tileA);
    });

    it("should do nothing for out of bounds swap", () => {
      const originalTile = board.getTile({ x: 0, y: 0 });
      board.swap({ x: -1, y: 0 }, { x: 0, y: 0 });
      expect(board.getTile({ x: 0, y: 0 })).toBe(originalTile);
    });
  });

  describe("match detection", () => {
    it("should detect horizontal 3-match", () => {
      const board = new Match3Board(8, 7);
      // Manually create a horizontal match with unique surrounding tiles
      const kind = TileKind.Sword;
      board.grid[0][0] = { id: 1001, kind, base: kind };
      board.grid[0][1] = { id: 1002, kind, base: kind };
      board.grid[0][2] = { id: 1003, kind, base: kind };
      // Ensure position 3 is different to prevent longer match
      board.grid[0][3] = { id: 1004, kind: TileKind.Star, base: TileKind.Star };

      const matches = board.findMatches();
      expect(matches.length).toBeGreaterThanOrEqual(1);

      const horizontalMatch = matches.find(
        (m) => m.direction === "row" && m.positions.length >= 3 && m.kind === kind
      );
      expect(horizontalMatch).toBeDefined();
      expect(horizontalMatch?.kind).toBe(kind);
    });

    it("should detect vertical 3-match", () => {
      const board = new Match3Board(8, 7);
      const kind = TileKind.Star;
      board.grid[0][0] = { id: 1001, kind, base: kind };
      board.grid[1][0] = { id: 1002, kind, base: kind };
      board.grid[2][0] = { id: 1003, kind, base: kind };
      // Ensure tiles below are different
      board.grid[3][0] = { id: 1004, kind: TileKind.Heal, base: TileKind.Heal };
      // Ensure adjacent column is different to avoid 2x2
      board.grid[0][1] = { id: 2001, kind: TileKind.Sword, base: TileKind.Sword };
      board.grid[1][1] = { id: 2002, kind: TileKind.Mana, base: TileKind.Mana };
      board.grid[2][1] = { id: 2003, kind: TileKind.Heal, base: TileKind.Heal };

      const matches = board.findMatches();
      const verticalMatch = matches.find(
        (m) => m.direction === "col" && m.positions.length >= 3 && m.kind === kind
      );
      expect(verticalMatch).toBeDefined();
      expect(verticalMatch?.kind).toBe(kind);
    });

    it("should detect 5-match", () => {
      const board = new Match3Board(8, 7);
      const kind = TileKind.Mana;
      for (let i = 0; i < 5; i++) {
        board.grid[0][i] = { id: 1001 + i, kind, base: kind };
      }
      // Ensure position 5 is different
      board.grid[0][5] = { id: 1006, kind: TileKind.Heal, base: TileKind.Heal };

      const matches = board.findMatches();
      const longMatch = matches.find((m) => m.positions.length >= 5 && m.kind === kind);
      expect(longMatch).toBeDefined();
    });

    it("should detect 2x2 square match", () => {
      const board = new Match3Board(8, 7);
      const kind = TileKind.Heal;
      board.grid[0][0] = { id: 1001, kind, base: kind };
      board.grid[0][1] = { id: 1002, kind, base: kind };
      board.grid[1][0] = { id: 1003, kind, base: kind };
      board.grid[1][1] = { id: 1004, kind, base: kind };

      const matches = board.findMatches();
      const squareMatch = matches.find((m) => m.positions.length === 4);
      expect(squareMatch).toBeDefined();
    });

    it("should exclude bombs from matches", () => {
      const board = new Match3Board(8, 7);
      const kind = TileKind.Sword;
      board.grid[0][0] = { id: 1001, kind, base: kind };
      board.grid[0][1] = { id: 1002, kind: TileKind.Bomb, base: kind, cooldown: 3 };
      board.grid[0][2] = { id: 1003, kind, base: kind };

      const matches = board.findMatches();
      // Bomb breaks the chain, no match should be found
      const match = matches.find(
        (m) => m.positions.some((p) => p.x === 0 && p.y === 0) && m.positions.length >= 3
      );
      expect(match).toBeUndefined();
    });

    it("should exclude bombs from 2x2 square matches", () => {
      const board = new Match3Board(8, 7);
      const kind = TileKind.Heal;
      board.grid[0][0] = { id: 1001, kind, base: kind };
      board.grid[0][1] = { id: 1002, kind, base: kind };
      board.grid[1][0] = { id: 1003, kind: TileKind.Bomb, base: kind, cooldown: 3 };
      board.grid[1][1] = { id: 1004, kind, base: kind };

      const matches = board.findMatches();
      const squareMatch = matches.find(
        (m) => m.positions.length === 4 && m.positions.some((p) => p.x === 0 && p.y === 0)
      );
      expect(squareMatch).toBeUndefined();
    });
  });

  describe("special tile detection", () => {
    let board: Match3Board;

    beforeEach(() => {
      board = new Match3Board(8, 7);
    });

    it("should recognize BoosterRow as special", () => {
      expect(board.isSpecial(TileKind.BoosterRow)).toBe(true);
    });

    it("should recognize BoosterCol as special", () => {
      expect(board.isSpecial(TileKind.BoosterCol)).toBe(true);
    });

    it("should recognize Ultimate as special", () => {
      expect(board.isSpecial(TileKind.Ultimate)).toBe(true);
    });

    it("should not recognize base tiles as special", () => {
      expect(board.isSpecial(TileKind.Sword)).toBe(false);
      expect(board.isSpecial(TileKind.Star)).toBe(false);
      expect(board.isSpecial(TileKind.Mana)).toBe(false);
      expect(board.isSpecial(TileKind.Heal)).toBe(false);
    });

    it("should not recognize bombs as special", () => {
      expect(board.isSpecial(TileKind.Bomb)).toBe(false);
    });
  });

  describe("bomb detection", () => {
    let board: Match3Board;

    beforeEach(() => {
      board = new Match3Board(8, 7);
    });

    it("should recognize bombs", () => {
      expect(board.isBomb(TileKind.Bomb)).toBe(true);
    });

    it("should not recognize other tiles as bombs", () => {
      expect(board.isBomb(TileKind.Sword)).toBe(false);
      expect(board.isBomb(TileKind.BoosterRow)).toBe(false);
    });
  });

  describe("blast area calculation", () => {
    let board: Match3Board;

    beforeEach(() => {
      board = new Match3Board(8, 7);
    });

    it("should calculate row blast area", () => {
      const positions = board.blastArea({ x: 3, y: 2 }, TileKind.BoosterRow);
      expect(positions.length).toBe(8); // Full row width
      expect(positions.every((p) => p.y === 2)).toBe(true);
    });

    it("should calculate column blast area", () => {
      const positions = board.blastArea({ x: 3, y: 2 }, TileKind.BoosterCol);
      expect(positions.length).toBe(7); // Full column height
      expect(positions.every((p) => p.x === 3)).toBe(true);
    });

    it("should calculate ultimate blast area (cross)", () => {
      const positions = board.blastArea({ x: 3, y: 2 }, TileKind.Ultimate);
      // Row (8) + Column minus intersection (7-1=6) = 14
      expect(positions.length).toBe(14);
    });
  });

  describe("bomb placement", () => {
    let board: Match3Board;

    beforeEach(() => {
      board = new Match3Board(8, 7);
    });

    it("should place specified number of bombs", () => {
      const { placed } = board.placeBombs(5, 3);
      expect(placed.length).toBe(5);
    });

    it("should set correct cooldown on bombs", () => {
      const { placed } = board.placeBombs(3, 5);
      placed.forEach(({ tile }) => {
        expect(tile.cooldown).toBe(5);
      });
    });

    it("should preserve base type when placing bomb", () => {
      const { placed, replaced } = board.placeBombs(1, 3);
      expect(placed.length).toBe(1);
      expect(placed[0].tile.base).toBe(replaced[0].tile.base);
    });

    it("should not place bombs on existing bombs", () => {
      // First placement
      board.placeBombs(10, 3);
      const firstBombCount = countBombs(board);

      // Second placement should not place on existing bombs
      board.placeBombs(10, 3);
      const secondBombCount = countBombs(board);

      expect(secondBombCount).toBeGreaterThan(firstBombCount);
    });

    it("should not place bombs on special tiles", () => {
      // Create a special tile
      board.grid[0][0] = {
        id: 9999,
        kind: TileKind.BoosterRow,
        base: TileKind.Sword,
      };

      // Place many bombs
      board.placeBombs(56, 3); // Max possible

      // Special tile should still be there
      expect(board.getTile({ x: 0, y: 0 })?.kind).toBe(TileKind.BoosterRow);
    });
  });

  describe("bomb tick", () => {
    let board: Match3Board;

    beforeEach(() => {
      board = new Match3Board(8, 7);
    });

    it("should decrement bomb cooldowns", () => {
      board.placeBombs(3, 5);
      const { remaining } = board.tickBombs();

      remaining.forEach((tile) => {
        expect(tile.cooldown).toBe(4);
      });
    });

    it("should return exploded bombs when cooldown reaches 0", () => {
      board.placeBombs(2, 1); // Cooldown of 1
      const { exploded, remaining } = board.tickBombs();

      expect(exploded.length).toBe(2);
      expect(remaining.length).toBe(0);
    });

    it("should separate exploded and remaining bombs", () => {
      board.placeBombs(2, 2);
      board.placeBombs(2, 1);

      const { exploded, remaining } = board.tickBombs();

      expect(exploded.length).toBe(2); // Cooldown 1 -> 0
      expect(remaining.length).toBe(2); // Cooldown 2 -> 1
    });
  });

  describe("adjacent bomb detection", () => {
    let board: Match3Board;

    beforeEach(() => {
      board = new Match3Board(8, 7);
    });

    it("should find bombs adjacent to cleared positions", () => {
      // Place bomb at (2, 0)
      board.grid[0][2] = {
        id: 9999,
        kind: TileKind.Bomb,
        base: TileKind.Sword,
        cooldown: 3,
      };

      // Clear position at (1, 0) - adjacent to bomb
      const adjacentBombs = board.getAdjacentBombs([{ x: 1, y: 0 }]);

      expect(adjacentBombs.length).toBe(1);
      expect(adjacentBombs[0]).toEqual({ x: 2, y: 0 });
    });

    it("should not find diagonally adjacent bombs", () => {
      // Place bomb at (2, 1)
      board.grid[1][2] = {
        id: 9999,
        kind: TileKind.Bomb,
        base: TileKind.Sword,
        cooldown: 3,
      };

      // Clear position at (1, 0) - diagonally adjacent
      const adjacentBombs = board.getAdjacentBombs([{ x: 1, y: 0 }]);

      expect(adjacentBombs.length).toBe(0);
    });

    it("should not duplicate bombs found from multiple cleared positions", () => {
      // Place bomb at (1, 1)
      board.grid[1][1] = {
        id: 9999,
        kind: TileKind.Bomb,
        base: TileKind.Sword,
        cooldown: 3,
      };

      // Clear positions around the bomb
      const adjacentBombs = board.getAdjacentBombs([
        { x: 0, y: 1 },
        { x: 2, y: 1 },
        { x: 1, y: 0 },
        { x: 1, y: 2 },
      ]);

      expect(adjacentBombs.length).toBe(1);
    });
  });

  describe("removeTile", () => {
    let board: Match3Board;

    beforeEach(() => {
      board = new Match3Board(8, 7);
    });

    it("should remove tile at position", () => {
      expect(board.getTile({ x: 0, y: 0 })).not.toBeNull();
      board.removeTile({ x: 0, y: 0 });
      expect(board.getTile({ x: 0, y: 0 })).toBeNull();
    });

    it("should handle out of bounds removal gracefully", () => {
      expect(() => board.removeTile({ x: -1, y: -1 })).not.toThrow();
    });
  });

  describe("collapseGrid", () => {
    let board: Match3Board;

    beforeEach(() => {
      board = new Match3Board(8, 7);
    });

    it("should move tiles down to fill gaps", () => {
      // Get the tile just above the bottom
      const tileAboveBottom = board.getTile({ x: 0, y: 5 });
      board.removeTile({ x: 0, y: 6 }); // Remove bottom tile

      const { moves } = board.collapseGrid();

      expect(moves.length).toBeGreaterThan(0);
      // Tile that was at y=5 should now be at y=6
      expect(board.getTile({ x: 0, y: 6 })).toBe(tileAboveBottom);
    });

    it("should spawn new tiles at the top", () => {
      board.removeTile({ x: 0, y: 6 });

      const { newTiles } = board.collapseGrid();

      expect(newTiles.length).toBe(1);
      expect(newTiles[0].pos.y).toBe(0);
    });

    it("should fill multiple gaps correctly", () => {
      board.removeTile({ x: 0, y: 3 });
      board.removeTile({ x: 0, y: 4 });
      board.removeTile({ x: 0, y: 5 });

      const { newTiles } = board.collapseGrid();

      // All positions should be filled
      for (let y = 0; y < 7; y++) {
        expect(board.getTile({ x: 0, y })).not.toBeNull();
      }

      expect(newTiles.length).toBe(3);
    });
  });

  describe("computeClearOutcome", () => {
    let board: Match3Board;

    beforeEach(() => {
      board = new Match3Board(8, 7);
    });

    it("should count tiles by base type", () => {
      // Use seeded board for determinism
      board = new Match3Board(8, 7, createSeededRNG(999));

      const kind = TileKind.Sword;
      // Create isolated 3-match to ensure only 3 tiles are counted
      board.grid[0][0] = { id: 1001, kind, base: kind };
      board.grid[0][1] = { id: 1002, kind, base: kind };
      board.grid[0][2] = { id: 1003, kind, base: kind };
      // Surround with different types to isolate the match
      board.grid[0][3] = { id: 1004, kind: TileKind.Star, base: TileKind.Star };
      board.grid[1][0] = { id: 1005, kind: TileKind.Mana, base: TileKind.Mana };
      board.grid[1][1] = { id: 1006, kind: TileKind.Heal, base: TileKind.Heal };
      board.grid[1][2] = { id: 1007, kind: TileKind.Star, base: TileKind.Star };

      // Create a specific match for our 3 sword tiles
      const testMatch: Match = {
        positions: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }],
        kind: TileKind.Sword,
        direction: "row"
      };

      const outcome = board.computeClearOutcome([testMatch], [], []);

      expect(outcome.counts[TileKind.Sword]).toBe(3);
    });

    it("should create BoosterRow for 5-match horizontal", () => {
      const kind = TileKind.Mana;
      // Create isolated 5-match horizontal
      for (let i = 0; i < 5; i++) {
        board.grid[0][i] = { id: 1001 + i, kind, base: kind };
      }
      // Ensure position 5 is different
      board.grid[0][5] = { id: 1006, kind: TileKind.Star, base: TileKind.Star };
      // Ensure row 1 is different to avoid 2x2 matches
      for (let i = 0; i < 5; i++) {
        board.grid[1][i] = { id: 2001 + i, kind: TileKind.Sword, base: TileKind.Sword };
      }

      const matches = board.findMatches();
      const horizontalMatch = matches.find(m => m.direction === "row" && m.kind === kind && m.positions.length === 5);
      expect(horizontalMatch).toBeDefined();

      const outcome = board.computeClearOutcome([horizontalMatch!], [], []);

      expect(outcome.transforms.length).toBe(1);
      expect(outcome.transforms[0].kind).toBe(TileKind.BoosterRow);
    });

    it("should create BoosterCol for 5-match vertical", () => {
      const kind = TileKind.Mana;
      // Create exactly 5 vertical match, isolated from other tiles
      for (let i = 0; i < 5; i++) {
        board.grid[i][0] = { id: 1001 + i, kind, base: kind };
      }
      // Ensure tiles at 5+ are different
      board.grid[5][0] = { id: 1006, kind: TileKind.Star, base: TileKind.Star };
      board.grid[6][0] = { id: 1007, kind: TileKind.Heal, base: TileKind.Heal };
      // Also ensure adjacent column is different to avoid 2x2 matches
      for (let i = 0; i < 5; i++) {
        board.grid[i][1] = { id: 2001 + i, kind: TileKind.Sword, base: TileKind.Sword };
      }

      const matches = board.findMatches();
      const verticalMatch = matches.find(m => m.direction === "col" && m.kind === kind && m.positions.length === 5);
      expect(verticalMatch).toBeDefined();

      const outcome = board.computeClearOutcome([verticalMatch!], [], []);

      expect(outcome.transforms.length).toBe(1);
      expect(outcome.transforms[0].kind).toBe(TileKind.BoosterCol);
    });

    it("should create Ultimate for 6+ match", () => {
      const kind = TileKind.Star;
      for (let i = 0; i < 6; i++) {
        board.grid[0][i] = { id: 1001 + i, kind, base: kind };
      }

      const matches = board.findMatches();
      const outcome = board.computeClearOutcome(matches, [], []);

      expect(outcome.transforms.some((t) => t.kind === TileKind.Ultimate)).toBe(true);
    });

    it("should expand special tile blast areas", () => {
      // Place a BoosterRow and trigger it
      board.grid[0][0] = {
        id: 9999,
        kind: TileKind.BoosterRow,
        base: TileKind.Sword,
      };

      const outcome = board.computeClearOutcome([], [{ x: 0, y: 0 }], []);

      // Should clear entire row
      expect(outcome.cleared.length).toBe(8);
    });
  });
});

// Helper function to count bombs on board
function countBombs(board: Match3Board): number {
  let count = 0;
  for (let y = 0; y < board.height; y++) {
    for (let x = 0; x < board.width; x++) {
      const tile = board.getTile({ x, y });
      if (tile && tile.kind === TileKind.Bomb) {
        count++;
      }
    }
  }
  return count;
}
