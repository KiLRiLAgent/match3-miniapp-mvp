import Phaser from "phaser";
import { ASSET_KEYS } from "../game/assets";
import {
  BOARD_PADDING,
  BOARD_SIZE,
  BOSS_HP_MAX,
  CELL_SIZE,
  GAME_HEIGHT,
  GAME_WIDTH,
  MATCH_GAINS,
  PLAYER_HP_MAX,
  PLAYER_MANA_MAX,
  SKILL_CONFIG,
  DAMAGE_PER_TILE,
  ULT_CHARGE_REQUIRED,
  BOSS_ATTACK_DAMAGE,
} from "../game/config";
import type { SkillId } from "../game/config";
import { Match3Board, baseCountTemplate } from "../match3/Board";
import { TileKind } from "../match3/types";
import type { Match, Position, Tile, BaseTileKind } from "../match3/types";
import { Meter } from "../ui/Meter";
import { SkillButton } from "../ui/SkillButton";
import { initTelegram } from "../telegram/telegram";

type CountTotals = Record<BaseTileKind, number>;

export class GameScene extends Phaser.Scene {
  private board!: Match3Board;
  private tileSprites = new Map<number, Phaser.GameObjects.Image>();
  private tilePositions = new Map<number, Position>();
  private dragStart:
    | { pos: Position; point: Phaser.Math.Vector2 }
    | null = null;
  private busy = false;

  private bossHp = BOSS_HP_MAX;
  private playerHp = PLAYER_HP_MAX;
  private mana = 0;
  private ultimateCharges = 0;

  private bossImage?: Phaser.GameObjects.Image;
  private bossHpBar?: Meter;
  private playerHpBar?: Meter;
  private manaBar?: Meter;
  private skillButtons: Partial<Record<SkillId, SkillButton>> = {};
  private victoryContainer?: Phaser.GameObjects.Container;
  private defeatContainer?: Phaser.GameObjects.Container;

  private boardOrigin = { x: 0, y: 0 };
  private currentTurn: "player" | "boss" = "player";
  private gameOver = false;

  constructor() {
    super("GameScene");
  }

  create() {
    initTelegram();
    this.cameras.main.setBackgroundColor("#0d0f1a");
    const boardWidth = BOARD_SIZE * CELL_SIZE;
    this.boardOrigin = {
      x: (GAME_WIDTH - boardWidth) / 2,
      y: 200,
    };

    this.buildHud();
    this.resetState();
    this.buildBoard();
    this.buildSkills();
    this.setupInputHandlers();
    this.updateHud();
  }

  private resetState() {
    this.bossHp = BOSS_HP_MAX;
    this.playerHp = PLAYER_HP_MAX;
    this.mana = 0;
    this.ultimateCharges = 0;
    this.currentTurn = "player";
    this.gameOver = false;
    this.board = new Match3Board(BOARD_SIZE, BOARD_SIZE);
    this.rebuildPositionMap();
  }

  private buildHud() {
    this.add
      .text(24, 20, "Lv. 30", {
        fontSize: "20px",
        color: "#ffffff",
        fontFamily: "Arial, sans-serif",
      })
      .setDepth(2);

    const bossX = GAME_WIDTH / 2;
    const bossY = 110;

    this.bossImage = this.add
      .image(bossX, bossY, ASSET_KEYS.boss.stage100)
      .setDisplaySize(180, 180)
      .setOrigin(0.5);

    this.bossHpBar = new Meter(
      this,
      GAME_WIDTH / 2 - 140,
      bossY + 90,
      280,
      14,
      "Boss HP",
      0xde3e3e
    );

    this.playerHpBar = new Meter(
      this,
      24,
      GAME_HEIGHT - 170,
      160,
      14,
      "HP",
      0x4caf50
    );
    this.manaBar = new Meter(
      this,
      24,
      GAME_HEIGHT - 145,
      160,
      14,
      "Mana",
      0x3b82f6
    );
  }

  private buildBoard() {
    const sizePx = BOARD_SIZE * CELL_SIZE;
    const bg = this.add
      .rectangle(
        this.boardOrigin.x - BOARD_PADDING,
        this.boardOrigin.y - BOARD_PADDING,
        sizePx + BOARD_PADDING * 2,
        sizePx + BOARD_PADDING * 2,
        0x161820,
        0.9
      )
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0xffffff, 0.08);
    bg.setDepth(0);

    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        const tile = this.board.getTile({ x, y });
        if (tile) {
          this.spawnTileSprite(tile, { x, y });
        }
      }
    }
  }

  private buildSkills() {
    const btnSize = 80;
    const spacing = 8;
    const totalWidth = btnSize * 4 + spacing * 3;
    const startX = GAME_WIDTH / 2 - totalWidth / 2;
    const y = GAME_HEIGHT - 100;
    const titles: [SkillId, string, string][] = [
      ["skill1", "Attack", `${SKILL_CONFIG.skill1.cost} MP`],
      ["skill2", "Blast", `${SKILL_CONFIG.skill2.cost} MP`],
      ["skill3", "Heal", `${SKILL_CONFIG.skill3.cost} MP`],
      ["skill4", "Ult", "Charge"],
    ];

    titles.forEach(([id, title, subtitle], idx) => {
      const btn = new SkillButton(
        this,
        startX + idx * (btnSize + spacing),
        y,
        btnSize,
        btnSize,
        title,
        subtitle,
        () => this.activateSkill(id)
      );
      btn.setDepth(2);
      this.skillButtons[id] = btn;
    });
  }

  private setupInputHandlers() {
    this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      if (
        !this.dragStart ||
        this.busy ||
        this.bossHp <= 0 ||
        this.playerHp <= 0 ||
        this.currentTurn !== "player" ||
        this.gameOver
      )
        return;
      const start = this.dragStart;
      const dx = pointer.x - start.point.x;
      const dy = pointer.y - start.point.y;
      const isTap = Math.abs(dx) < 10 && Math.abs(dy) < 10;
      if (isTap) {
        this.handleTap(start.pos);
      } else {
        const dir =
          Math.abs(dx) > Math.abs(dy)
            ? { x: Math.sign(dx), y: 0 }
            : { x: 0, y: Math.sign(dy) };
        const target = { x: start.pos.x + dir.x, y: start.pos.y + dir.y };
        this.attemptSwap(start.pos, target);
      }
      this.dragStart = null;
    });
  }

  private handleTap(pos: Position) {
    const tile = this.board.getTile(pos);
    if (
      tile &&
      this.board.isSpecial(tile.kind) &&
      this.currentTurn === "player" &&
      !this.gameOver
    ) {
      this.busy = true;
      this.resolveBoard([], [pos], [], true).finally(() => {
        if (!this.gameOver && this.currentTurn === "player") {
          this.busy = false;
        }
      });
    }
  }

  private attemptSwap(a: Position, b: Position) {
    if (
      this.busy ||
      !this.board.inBounds(a) ||
      !this.board.inBounds(b) ||
      this.currentTurn !== "player" ||
      this.gameOver
    ) {
      return;
    }
    const tileA = this.board.getTile(a);
    const tileB = this.board.getTile(b);
    if (!tileA || !tileB) return;
    this.busy = true;

    this.board.swap(a, b);
    this.rebuildPositionMap();
    this.animateSwap(tileA.id, tileB.id)
      .then(() => {
        const specials: Position[] = [];
        const tileAfterA = this.board.getTile(a);
        const tileAfterB = this.board.getTile(b);
        if (tileAfterA && this.board.isSpecial(tileAfterA.kind)) {
          specials.push({ ...a });
        }
        if (tileAfterB && this.board.isSpecial(tileAfterB.kind)) {
          specials.push({ ...b });
        }
        const matches = this.board.findMatches();
        if (!matches.length && !specials.length) {
          // invalid swap, revert
          this.board.swap(a, b);
          this.rebuildPositionMap();
          return this.animateSwap(tileA.id, tileB.id);
        }
        return this.resolveBoard(matches, specials, [a, b], true);
      })
      .finally(() => {
        if (!this.gameOver && this.currentTurn === "player") {
          this.busy = false;
        }
      });
  }

  private async resolveBoard(
    matches: Match[],
    manualSpecials: Position[],
    swapTargets: Position[],
    endTurnAfter = false
  ) {
    const totals: CountTotals = baseCountTemplate();
    let loopMatches = matches;
    let loopSpecials = manualSpecials;
    let extraUltimate = 0;

    while (loopMatches.length || loopSpecials.length) {
      const outcome = this.board.computeClearOutcome(
        loopMatches,
        loopSpecials,
        swapTargets
      );
      if (!outcome.cleared.length && !outcome.transforms.length) break;

      outcome.transforms.forEach((t) => {
        if (t.kind === TileKind.Ultimate) {
          extraUltimate += 1;
        }
      });

      await this.animateClear(outcome);
      const collapse = this.board.applyClearOutcome(outcome);
      this.rebuildPositionMap();
      await this.animateCollapse(collapse);

      // merge counts
      (Object.keys(outcome.counts) as BaseTileKind[]).forEach((key) => {
        totals[key] += outcome.counts[key];
      });

      loopMatches = this.board.findMatches();
      loopSpecials = [];
      swapTargets = [];
    }

    if (
      loopMatches.length === 0 &&
      loopSpecials.length === 0 &&
      Object.values(totals).every((v) => v === 0)
    ) {
      if (endTurnAfter) {
        await this.finishPlayerTurn();
      }
      return;
    }

    this.ultimateCharges = Math.min(
      this.ultimateCharges + extraUltimate,
      3
    );

    this.applyMatchResults(totals);

    if (endTurnAfter) {
      await this.finishPlayerTurn();
    }
  }

  private applyMatchResults(totals: CountTotals) {
    const damage =
      totals[TileKind.Sword] * DAMAGE_PER_TILE[TileKind.Sword] +
      totals[TileKind.Star] * DAMAGE_PER_TILE[TileKind.Star];
    const manaGain = totals[TileKind.Mana] * MATCH_GAINS.mana;
    const healGain = totals[TileKind.Heal] * MATCH_GAINS.heal;

    this.bossHp = Math.max(0, this.bossHp - damage);
    this.mana = clamp(this.mana + manaGain, 0, PLAYER_MANA_MAX);
    this.playerHp = clamp(this.playerHp + healGain, 0, PLAYER_HP_MAX);

    this.updateHud();
    if (this.bossHp <= 0) {
      this.showVictory();
    }
  }

  private getTileTexture(tile: Tile) {
    return ASSET_KEYS.tiles[tile.kind] ?? tile.kind;
  }

  private spawnTileSprite(tile: Tile, pos: Position, startY?: number) {
    const world = this.toWorld(pos);
    const sprite = this.add
      .image(world.x, startY ?? world.y, this.getTileTexture(tile))
      .setDisplaySize(CELL_SIZE - 6, CELL_SIZE - 6)
      .setInteractive({ useHandCursor: true });
    sprite.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (this.busy || this.bossHp <= 0) return;
      const current = this.tilePositions.get(tile.id) ?? pos;
      this.dragStart = {
        pos: { ...current },
        point: new Phaser.Math.Vector2(pointer.x, pointer.y),
      };
    });
    sprite.setDepth(1);
    this.tileSprites.set(tile.id, sprite);
    return sprite;
  }

  private rebuildPositionMap() {
    this.tilePositions.clear();
    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        const tile = this.board.getTile({ x, y });
        if (tile) {
          this.tilePositions.set(tile.id, { x, y });
        }
      }
    }
  }

  private animateSwap(idA: number, idB: number) {
    const spriteA = this.tileSprites.get(idA);
    const spriteB = this.tileSprites.get(idB);
    const posA = spriteA ? this.tilePositions.get(idA) : null;
    const posB = spriteB ? this.tilePositions.get(idB) : null;
    if (!spriteA || !spriteB || !posA || !posB) {
      return Promise.resolve();
    }
    const worldA = this.toWorld(posA);
    const worldB = this.toWorld(posB);
    return Promise.all([
      new Promise<void>((resolve) => {
        this.tweens.add({
          targets: spriteA,
          x: worldA.x,
          y: worldA.y,
          duration: 140,
          ease: "Quad.easeOut",
          onComplete: () => resolve(),
        });
      }),
      new Promise<void>((resolve) => {
        this.tweens.add({
          targets: spriteB,
          x: worldB.x,
          y: worldB.y,
          duration: 140,
          ease: "Quad.easeOut",
          onComplete: () => resolve(),
        });
      }),
    ]).then(() => {});
  }

  private animateClear(outcome: {
    cleared: Array<{ pos: Position; tile: Tile }>;
    transforms: Array<{ tile: Tile | null; kind: TileKind; pos: Position }>;
  }) {
    const tweens: Promise<void>[] = [];

    // Update textures for new specials
    outcome.transforms.forEach((transform) => {
      const tile = this.board.getTile(transform.pos);
      if (!tile) return;
      const sprite = this.tileSprites.get(tile.id);
      if (sprite) {
        sprite.setTexture(this.getTileTexture(tile));
        this.tweens.add({
          targets: sprite,
          scale: 1.08,
          duration: 80,
          yoyo: true,
          ease: "Sine.easeInOut",
        });
      }
    });

    outcome.cleared.forEach(({ tile }) => {
      const sprite = this.tileSprites.get(tile.id);
      if (!sprite) return;
      tweens.push(
        new Promise<void>((resolve) => {
          this.tweens.add({
            targets: sprite,
            alpha: 0,
            scale: 0.2,
            duration: 140,
            ease: "Quad.easeIn",
            onComplete: () => {
              sprite.destroy();
              this.tileSprites.delete(tile.id);
              resolve();
            },
          });
        })
      );
    });

    return Promise.all(tweens);
  }

  private animateCollapse(collapse: {
    moves: Array<{ tile: Tile; to: Position }>;
    newTiles: Array<{ tile: Tile; pos: Position }>;
  }) {
    const tweens: Promise<void>[] = [];

    collapse.moves.forEach(({ tile, to }) => {
      const sprite = this.tileSprites.get(tile.id);
      if (!sprite) return;
      const target = this.toWorld(to);
      tweens.push(
        new Promise<void>((resolve) => {
          this.tweens.add({
            targets: sprite,
            x: target.x,
            y: target.y,
            duration: 160,
            ease: "Quad.easeIn",
            onComplete: () => resolve(),
          });
        })
      );
    });

    collapse.newTiles.forEach(({ tile, pos }) => {
      const target = this.toWorld(pos);
      const sprite = this.spawnTileSprite(
        tile,
        pos,
        this.boardOrigin.y - CELL_SIZE
      );
      sprite.setPosition(target.x, this.boardOrigin.y - CELL_SIZE);
      tweens.push(
        new Promise<void>((resolve) => {
          this.tweens.add({
            targets: sprite,
            x: target.x,
            y: target.y,
            duration: 200,
            ease: "Quad.easeIn",
            onComplete: () => resolve(),
          });
        })
      );
    });

    return Promise.all(tweens);
  }

  private updateHud() {
    this.bossHpBar?.setValue(this.bossHp, BOSS_HP_MAX);
    this.playerHpBar?.setValue(this.playerHp, PLAYER_HP_MAX);
    this.manaBar?.setValue(this.mana, PLAYER_MANA_MAX);
    this.updateBossArt();

    const skill1Enabled = this.mana >= SKILL_CONFIG.skill1.cost;
    const skill2Enabled = this.mana >= SKILL_CONFIG.skill2.cost;
    const skill3Enabled = this.mana >= SKILL_CONFIG.skill3.cost;
    const skill4Enabled = this.ultimateCharges >= ULT_CHARGE_REQUIRED;

    this.skillButtons.skill1?.applyState({
      enabled: skill1Enabled,
      ready: skill1Enabled,
      info: `${this.mana}/${SKILL_CONFIG.skill1.cost}`,
    });
    this.skillButtons.skill2?.applyState({
      enabled: skill2Enabled,
      ready: skill2Enabled,
      info: `${this.mana}/${SKILL_CONFIG.skill2.cost}`,
    });
    this.skillButtons.skill3?.applyState({
      enabled: skill3Enabled,
      ready: skill3Enabled,
      info: `${this.mana}/${SKILL_CONFIG.skill3.cost}`,
    });
    this.skillButtons.skill4?.applyState({
      enabled: skill4Enabled,
      ready: skill4Enabled,
      info: `${this.ultimateCharges}/${ULT_CHARGE_REQUIRED}`,
    });
  }

  private updateBossArt() {
    if (!this.bossImage) return;
    const ratio = this.bossHp / BOSS_HP_MAX;
    let key = ASSET_KEYS.boss.stage100;
    if (ratio <= 0.25) key = ASSET_KEYS.boss.stage25;
    else if (ratio <= 0.5) key = ASSET_KEYS.boss.stage50;
    else if (ratio <= 0.75) key = ASSET_KEYS.boss.stage75;
    this.bossImage.setTexture(key);
  }

  private activateSkill(id: SkillId) {
    if (
      this.busy ||
      this.bossHp <= 0 ||
      this.playerHp <= 0 ||
      this.currentTurn !== "player" ||
      this.gameOver
    )
      return;
    switch (id) {
      case "skill1":
        if (this.mana < SKILL_CONFIG.skill1.cost) return;
        this.mana -= SKILL_CONFIG.skill1.cost;
        this.bossHp = Math.max(0, this.bossHp - 120);
        this.updateHud();
        if (this.bossHp <= 0) {
          this.showVictory();
          return;
        }
        this.finishPlayerTurn();
        break;
      case "skill2":
        if (this.mana < SKILL_CONFIG.skill2.cost) return;
        this.mana -= SKILL_CONFIG.skill2.cost;
        this.castRowClear();
        break;
      case "skill3":
        if (this.mana < SKILL_CONFIG.skill3.cost) return;
        this.mana -= SKILL_CONFIG.skill3.cost;
        this.playerHp = clamp(this.playerHp + 30, 0, PLAYER_HP_MAX);
        this.updateHud();
        this.finishPlayerTurn();
        break;
      case "skill4":
        if (this.ultimateCharges < ULT_CHARGE_REQUIRED) return;
        this.ultimateCharges -= ULT_CHARGE_REQUIRED;
        this.castRandomCells();
        break;
    }
  }

  private castRowClear() {
    const row = Phaser.Math.Between(0, BOARD_SIZE - 1);
    const positions = Array.from({ length: BOARD_SIZE }, (_, x) => ({
      x,
      y: row,
    }));
    this.busy = true;
    this.resolveManualClear(positions).finally(() => {
      if (!this.gameOver && this.currentTurn === "player") {
        this.busy = false;
      }
    });
  }

  private castRandomCells() {
    const positions: Position[] = [];
    for (let i = 0; i < 5; i++) {
      positions.push({
        x: Phaser.Math.Between(0, BOARD_SIZE - 1),
        y: Phaser.Math.Between(0, BOARD_SIZE - 1),
      });
    }
    this.busy = true;
    this.resolveManualClear(positions).finally(() => {
      if (!this.gameOver && this.currentTurn === "player") {
        this.busy = false;
      }
    });
  }

  private async resolveManualClear(positions: Position[]) {
    const outcome = this.board.clearPositions(positions);
    if (!outcome.cleared.length) {
      this.updateHud();
      return;
    }
    await this.animateClear(outcome);
    const collapse = this.board.applyClearOutcome(outcome);
    this.rebuildPositionMap();
    await this.animateCollapse(collapse);
    const totals: CountTotals = baseCountTemplate();
    (Object.keys(outcome.counts) as BaseTileKind[]).forEach((key) => {
      totals[key] += outcome.counts[key];
    });
    this.applyMatchResults(totals);
    const nextMatches = this.board.findMatches();
    if (nextMatches.length) {
      await this.resolveBoard(nextMatches, [], [], false);
    }
    await this.finishPlayerTurn();
  }

  private showVictory() {
    if (this.victoryContainer) {
      this.victoryContainer.setVisible(true);
      return;
    }
    this.busy = true;
    this.gameOver = true;
    const overlay = this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.65)
      .setOrigin(0, 0)
      .setDepth(999);
    const text = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 40, "Victory!", {
        fontSize: "36px",
        color: "#ffffff",
        fontFamily: "Arial, sans-serif",
      })
      .setOrigin(0.5)
      .setDepth(999);
    const btn = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 20, "Restart", {
        fontSize: "20px",
        backgroundColor: "#2d5bff",
        padding: { x: 16, y: 8 },
        color: "#ffffff",
        fontFamily: "Arial, sans-serif",
      })
      .setOrigin(0.5)
      .setDepth(999)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => {
        this.scene.restart();
      });

    this.victoryContainer = this.add
      .container(0, 0, [overlay, text, btn])
      .setDepth(999);
  }

  private toWorld(pos: Position) {
    return {
      x: this.boardOrigin.x + pos.x * CELL_SIZE + CELL_SIZE / 2,
      y: this.boardOrigin.y + pos.y * CELL_SIZE + CELL_SIZE / 2,
    };
  }

  private async finishPlayerTurn() {
    if (this.gameOver) return;
    if (this.bossHp <= 0) {
      this.showVictory();
      return;
    }
    if (this.playerHp <= 0) {
      this.showDefeat();
      return;
    }
    this.currentTurn = "boss";
    this.busy = true;
    await wait(this, 350);
    await this.executeBossTurn();
    await wait(this, 200);
    if (this.playerHp <= 0) {
      this.showDefeat();
      return;
    }
    this.currentTurn = "player";
    this.busy = false;
  }

  private async executeBossTurn() {
    const move = this.findBossMove();
    if (!move) {
      // fallback damage if no move found
      this.cameras.main.shake(120, 0.004);
      this.playerHp = clamp(
        this.playerHp - BOSS_ATTACK_DAMAGE,
        0,
        PLAYER_HP_MAX
      );
      this.updateHud();
      return;
    }
    const { a, b } = move;
    const tileA = this.board.getTile(a);
    const tileB = this.board.getTile(b);
    if (!tileA || !tileB) return;

    this.board.swap(a, b);
    this.rebuildPositionMap();
    const specials: Position[] = [];
    const tileAfterA = this.board.getTile(a);
    const tileAfterB = this.board.getTile(b);
    if (tileAfterA && this.board.isSpecial(tileAfterA.kind)) specials.push(a);
    if (tileAfterB && this.board.isSpecial(tileAfterB.kind)) specials.push(b);
    const matches = this.board.findMatches();
    // Animate then resolve
    await this.animateSwap(tileA.id, tileB.id);
    await this.resolveBoard(matches, specials, [a, b], false);
    this.updateHud();
  }

  private findBossMove():
    | { a: Position; b: Position }
    | null {
    const dirs = [
      { x: 1, y: 0 },
      { x: 0, y: 1 },
    ];
    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        for (const dir of dirs) {
          const a = { x, y };
          const b = { x: x + dir.x, y: y + dir.y };
          if (!this.board.inBounds(b)) continue;
          this.board.swap(a, b);
          const matches = this.board.findMatches();
          this.board.swap(a, b);
          if (matches.length) {
            return { a, b };
          }
        }
      }
    }
    return null;
  }

  private showDefeat() {
    if (this.defeatContainer) {
      this.defeatContainer.setVisible(true);
      return;
    }
    this.busy = true;
    this.gameOver = true;
    const overlay = this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.7)
      .setOrigin(0, 0)
      .setDepth(999);
    const text = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 40, "Defeat", {
        fontSize: "36px",
        color: "#ffb4b4",
        fontFamily: "Arial, sans-serif",
      })
      .setOrigin(0.5)
      .setDepth(999);
    const btn = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 20, "Retry", {
        fontSize: "20px",
        backgroundColor: "#2d5bff",
        padding: { x: 16, y: 8 },
        color: "#ffffff",
        fontFamily: "Arial, sans-serif",
      })
      .setOrigin(0.5)
      .setDepth(999)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => {
        this.scene.restart();
      });

    this.defeatContainer = this.add
      .container(0, 0, [overlay, text, btn])
      .setDepth(999);
  }
}

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const wait = (scene: Phaser.Scene, ms: number) =>
  new Promise<void>((resolve) => {
    scene.time.delayedCall(ms, () => resolve());
  });
