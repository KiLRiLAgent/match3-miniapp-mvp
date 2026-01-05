import Phaser from "phaser";
import { ASSET_KEYS } from "../game/assets";
import {
  BOARD_PADDING,
  BOARD_WIDTH,
  BOARD_HEIGHT,
  BOSS_HP_MAX,
  BOSS_DAMAGED_HP_THRESHOLD,
  CELL_SIZE,
  GAME_HEIGHT,
  GAME_WIDTH,
  MATCH_GAINS,
  PLAYER_HP_MAX,
  PLAYER_MANA_MAX,
  PLAYER_MAG_DAMAGE_MULTIPLIER,
  SKILL_CONFIG,
  DAMAGE_PER_TILE,
  UI_LAYOUT,
  INPUT_THRESHOLD,
  DAMAGE_TILES,
  RESOURCE_TILES,
} from "../game/config";
import {
  ANIMATION_DURATIONS,
  ANIMATION_EASING,
  VISUAL_EFFECTS,
} from "../game/animations";
import type { SkillId } from "../game/config";
import { Match3Board } from "../match3/Board";
import { TileKind } from "../match3/types";
import type { Match, Position, Tile, CountTotals } from "../match3/types";
import { Meter } from "../ui/Meter";
import { SkillButton } from "../ui/SkillButton";
import { CooldownIcon } from "../ui/CooldownIcon";
import { showDamageNumber } from "../ui/DamageNumber";
import { BossAbility } from "../game/BossAbility";
import { flyTilesToTarget } from "../ui/FlyingTile";
import type { FlyTarget } from "../ui/FlyingTile";
import { initTelegram } from "../telegram/telegram";
import { clamp, wait } from "../utils/helpers";

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

  private bossImage?: Phaser.GameObjects.Image;
  private bossHpBar?: Meter;
  private playerHpBar?: Meter;
  private manaBar?: Meter;
  private skillButtons: Partial<Record<SkillId, SkillButton>> = {};

  private bossAbility!: BossAbility;
  private cooldownIcon?: CooldownIcon;
  private playerAvatar?: Phaser.GameObjects.Rectangle;

  private boardOrigin = { x: 0, y: 0 };
  private currentTurn: "player" | "boss" = "player";
  private gameOver = false;
  private turnText?: Phaser.GameObjects.Text;

  constructor() {
    super("GameScene");
  }

  create() {
    initTelegram();
    this.cameras.main.setBackgroundColor("#0d0f1a");
    const boardWidth = BOARD_WIDTH * CELL_SIZE;
    this.boardOrigin = {
      x: (GAME_WIDTH - boardWidth) / 2,
      y: UI_LAYOUT.boardOriginY,
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
    this.currentTurn = "player";
    this.gameOver = false;
    this.busy = false;
    this.board = new Match3Board(BOARD_WIDTH, BOARD_HEIGHT);
    this.bossAbility = BossAbility.createPowerStrike();
    this.tileSprites.clear();
    this.tilePositions.clear();
    this.rebuildPositionMap();
  }

  private buildHud() {
    const topPanel = this.add
      .rectangle(
        GAME_WIDTH / 2,
        90,
        GAME_WIDTH - 32,
        150,
        0x131a2d,
        0.9
      )
      .setStrokeStyle(2, 0xffffff, 0.1)
      .setDepth(1);
    topPanel.setOrigin(0.5, 0.5);

    this.add
      .text(20, 28, "Lv. 30", {
        fontSize: "20px",
        color: "#9fb7ff",
        fontFamily: "Arial, sans-serif",
      })
      .setDepth(3);

    const bossX = GAME_WIDTH / 2;
    const bossY = 90;

    this.bossImage = this.add
      .image(bossX, bossY, ASSET_KEYS.boss.normal)
      .setDisplaySize(180, 180)
      .setOrigin(0.5)
      .setDepth(3);

    this.bossHpBar = new Meter(
      this,
      GAME_WIDTH / 2 - 150,
      bossY + 110,
      300,
      16,
      "Boss HP",
      0xde3e3e
    ).setDepth(4);

    // Иконка кулдауна способности босса
    this.cooldownIcon = new CooldownIcon(
      this,
      GAME_WIDTH / 2 + 180,
      bossY + 110,
      48
    );
    this.cooldownIcon.setDepth(4);

    const bottomPanel = this.add
      .rectangle(
        GAME_WIDTH / 2,
        GAME_HEIGHT - 95,
        GAME_WIDTH - 32,
        70,
        0x111726,
        0.92
      )
      .setStrokeStyle(2, 0xffffff, 0.08)
      .setDepth(1);
    bottomPanel.setOrigin(0.5, 0.5);

    // Аватар игрока слева
    this.playerAvatar = this.add
      .rectangle(45, GAME_HEIGHT - 95, 44, 44, 0x4caf50, 0.8)
      .setStrokeStyle(2, 0xffffff, 0.5)
      .setDepth(4);

    // HP бар справа от аватара (зелёный)
    this.playerHpBar = new Meter(
      this,
      80,
      GAME_HEIGHT - 110,
      170,
      12,
      "HP",
      0x4caf50
    ).setDepth(4);

    // Mana бар под HP (синий)
    this.manaBar = new Meter(
      this,
      80,
      GAME_HEIGHT - 82,
      170,
      12,
      "MP",
      0x3b82f6
    ).setDepth(4);

    this.turnText = this.add
      .text(GAME_WIDTH - 32, 26, "Ваш ход", {
        fontSize: "18px",
        color: "#ffffff",
        fontFamily: "Arial, sans-serif",
      })
      .setOrigin(1, 0)
      .setDepth(4);
  }

  private buildBoard() {
    const widthPx = BOARD_WIDTH * CELL_SIZE;
    const heightPx = BOARD_HEIGHT * CELL_SIZE;
    const bg = this.add
      .rectangle(
        this.boardOrigin.x - BOARD_PADDING,
        this.boardOrigin.y - BOARD_PADDING,
        widthPx + BOARD_PADDING * 2,
        heightPx + BOARD_PADDING * 2,
        0x161820,
        0.9
      )
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0xffffff, 0.08);
    bg.setDepth(0);

    for (let y = 0; y < BOARD_HEIGHT; y++) {
      for (let x = 0; x < BOARD_WIDTH; x++) {
        const tile = this.board.getTile({ x, y });
        if (tile) {
          this.spawnTileSprite(tile, { x, y });
        }
      }
    }
  }

  private buildSkills() {
    const btnSize = 70;
    const spacing = 8;
    const totalWidth = btnSize * 4 + spacing * 3;
    const startX = GAME_WIDTH / 2 - totalWidth / 2;
    const y = GAME_HEIGHT - 45;
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
        btnSize - 10,
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
      const start = this.dragStart;
      this.dragStart = null;

      if (!start || !this.canPlayerAct()) return;

      const dx = pointer.x - start.point.x;
      const dy = pointer.y - start.point.y;
      const isTap = Math.abs(dx) < INPUT_THRESHOLD.tapDistance && Math.abs(dy) < INPUT_THRESHOLD.tapDistance;

      if (isTap) {
        this.handleTap(start.pos);
      } else {
        const dir = this.getSwipeDirection(dx, dy);
        const target = { x: start.pos.x + dir.x, y: start.pos.y + dir.y };
        this.attemptSwap(start.pos, target);
      }
    });
  }

  private canPlayerAct(): boolean {
    return !this.busy && !this.gameOver && this.currentTurn === "player" && this.playerHp > 0 && this.bossHp > 0;
  }

  private getSwipeDirection(dx: number, dy: number): Position {
    return Math.abs(dx) > Math.abs(dy)
      ? { x: Math.sign(dx), y: 0 }
      : { x: 0, y: Math.sign(dy) };
  }

  private handleTap(pos: Position) {
    const tile = this.board.getTile(pos);
    if (!tile || !this.board.isSpecial(tile.kind)) return;

    this.busy = true;
    this.resolveBoard([], [pos], [], true, "player").finally(() => {
      if (!this.gameOver && this.currentTurn === "player") {
        this.busy = false;
      }
    });
  }

  private attemptSwap(a: Position, b: Position) {
    if (!this.board.inBounds(a) || !this.board.inBounds(b)) return;
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
        return this.resolveBoard(matches, specials, [a, b], true, "player");
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
    endTurnAfter = false,
    actor: "player" | "boss" = "player"
  ) {
    let loopMatches = matches;
    let loopSpecials = manualSpecials;

    while (loopMatches.length || loopSpecials.length) {
      const outcome = this.board.computeClearOutcome(
        loopMatches,
        loopSpecials,
        swapTargets
      );
      if (!outcome.cleared.length && !outcome.transforms.length) break;

      await this.animateClear(outcome, actor);

      // Применяем эффекты СРАЗУ после полёта фишек (не в конце!)
      this.applyMatchResults(outcome.counts, actor);

      // Если игра закончилась - прекращаем цикл
      if (this.gameOver) break;

      const collapse = this.board.applyClearOutcome(outcome);
      this.rebuildPositionMap();
      await this.animateCollapse(collapse);

      loopMatches = this.board.findMatches();
      loopSpecials = [];
      swapTargets = [];
    }

    if (endTurnAfter && !this.gameOver) {
      await this.finishPlayerTurn();
    }
  }

  private applyMatchResults(totals: CountTotals, actor: "player" | "boss") {
    const physDamage = totals[TileKind.Sword] * DAMAGE_PER_TILE[TileKind.Sword];
    const magDamage = totals[TileKind.Star] * DAMAGE_PER_TILE[TileKind.Star];
    const damage = physDamage + Math.floor(magDamage * PLAYER_MAG_DAMAGE_MULTIPLIER);
    const manaGain = totals[TileKind.Mana] * MATCH_GAINS.mana;
    const healGain = totals[TileKind.Heal] * MATCH_GAINS.heal;

    if (actor === "player") {
      this.applyDamageToBoss(damage);
      this.applyManaToPlayer(manaGain);
      this.applyHealToPlayer(healGain);
    } else {
      this.applyDamageToPlayer(damage);
      this.applyHealToBoss(healGain);
    }

    this.updateHud();
    this.checkGameOver();
  }

  private applyDamageToBoss(damage: number) {
    if (damage <= 0) return;

    this.bossHp = Math.max(0, this.bossHp - damage);
    if (this.bossImage) {
      this.flashBoss();
      showDamageNumber(this, this.bossImage.x, this.bossImage.y + 60, damage, "damage");
      this.shakeTarget(this.bossImage, VISUAL_EFFECTS.damageShakeOffset);
    }
  }

  private applyDamageToPlayer(damage: number) {
    if (damage <= 0) return;

    this.playerHp = clamp(this.playerHp - damage, 0, PLAYER_HP_MAX);
    if (this.playerAvatar) {
      showDamageNumber(this, this.playerAvatar.x, this.playerAvatar.y - 30, damage, "damage");
    }
  }

  private applyManaToPlayer(manaGain: number) {
    if (manaGain <= 0) return;

    const oldMana = this.mana;
    this.mana = clamp(this.mana + manaGain, 0, PLAYER_MANA_MAX);
    const actualGain = this.mana - oldMana;

    if (actualGain > 0 && this.playerAvatar) {
      showDamageNumber(this, this.playerAvatar.x, this.playerAvatar.y - 20, actualGain, "mana");
    }
  }

  private applyHealToPlayer(healGain: number) {
    if (healGain <= 0) return;

    const oldHp = this.playerHp;
    this.playerHp = clamp(this.playerHp + healGain, 0, PLAYER_HP_MAX);
    const actualHeal = this.playerHp - oldHp;

    if (actualHeal > 0 && this.playerAvatar) {
      showDamageNumber(this, this.playerAvatar.x, this.playerAvatar.y - 40, actualHeal, "heal");
    }
  }

  private applyHealToBoss(healGain: number) {
    if (healGain <= 0) return;
    this.bossHp = clamp(this.bossHp + healGain, 0, BOSS_HP_MAX);
  }

  private shakeTarget(target: Phaser.GameObjects.Image, offset: number) {
    this.tweens.add({
      targets: target,
      x: target.x + offset,
      duration: ANIMATION_DURATIONS.shakeDuration,
      yoyo: true,
      repeat: 2,
    });
  }

  private flashBoss() {
    if (!this.bossImage) return;
    this.bossImage.setTint(0xffffff);
    this.time.delayedCall(ANIMATION_DURATIONS.flashDuration, () => {
      this.bossImage?.clearTint();
    });
  }

  private checkGameOver() {
    if (this.bossHp <= 0) {
      this.showVictory();
    } else if (this.playerHp <= 0) {
      this.showDefeat();
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
    for (let y = 0; y < BOARD_HEIGHT; y++) {
      for (let x = 0; x < BOARD_WIDTH; x++) {
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

    const animateToPosition = (sprite: Phaser.GameObjects.Image, pos: Position): Promise<void> => {
      const world = this.toWorld(pos);
      return new Promise<void>((resolve) => {
        this.tweens.add({
          targets: sprite,
          x: world.x,
          y: world.y,
          duration: ANIMATION_DURATIONS.swap,
          ease: ANIMATION_EASING.swap,
          onComplete: () => resolve(),
        });
      });
    };

    return Promise.all([
      animateToPosition(spriteA, posA),
      animateToPosition(spriteB, posB),
    ]).then(() => {});
  }

  private animateClear(
    outcome: {
      cleared: Array<{ pos: Position; tile: Tile }>;
      transforms: Array<{ tile: Tile | null; kind: TileKind; pos: Position }>;
    },
    actor: "player" | "boss" = "player"
  ) {
    const tweens: Promise<void>[] = [];

    this.animateTransforms(outcome.transforms);

    const { tilesToBoss, tilesToPlayer } = this.groupTilesByTarget(outcome.cleared, tweens, actor);

    const bossTarget: FlyTarget = this.bossImage
      ? { x: this.bossImage.x, y: this.bossImage.y + 40 }
      : { x: GAME_WIDTH / 2, y: 100 };

    const playerTarget: FlyTarget = this.playerAvatar
      ? { x: this.playerAvatar.x, y: this.playerAvatar.y }
      : { x: GAME_WIDTH - 60, y: GAME_HEIGHT - 175 };

    if (tilesToBoss.length > 0) {
      tweens.push(flyTilesToTarget(this, tilesToBoss, bossTarget, ANIMATION_DURATIONS.tileFly));
    }
    if (tilesToPlayer.length > 0) {
      tweens.push(flyTilesToTarget(this, tilesToPlayer, playerTarget, ANIMATION_DURATIONS.tileFly));
    }

    return Promise.all(tweens);
  }

  private animateTransforms(transforms: Array<{ tile: Tile | null; kind: TileKind; pos: Position }>) {
    transforms.forEach((transform) => {
      // Получаем тайл на позиции (ещё не трансформирован в Board)
      const tile = this.board.getTile(transform.pos);
      if (!tile) return;
      const sprite = this.tileSprites.get(tile.id);
      if (sprite) {
        // Используем kind из transform, а не из tile (tile ещё не обновлён)
        const textureKey = ASSET_KEYS.tiles[transform.kind] ?? transform.kind;
        sprite.setTexture(textureKey);
        // ВАЖНО: пересчитываем размер после смены текстуры
        sprite.setDisplaySize(CELL_SIZE - 6, CELL_SIZE - 6);
        const baseScale = sprite.scaleX;
        this.tweens.add({
          targets: sprite,
          scaleX: baseScale * VISUAL_EFFECTS.transformScaleFactor,
          scaleY: baseScale * VISUAL_EFFECTS.transformScaleFactor,
          duration: 150,
          yoyo: true,
          ease: ANIMATION_EASING.scale,
        });
      }
    });
  }

  private isDamageTile(kind: TileKind): boolean {
    return DAMAGE_TILES.includes(kind as typeof DAMAGE_TILES[number]);
  }

  private isResourceTile(kind: TileKind): boolean {
    return RESOURCE_TILES.includes(kind as typeof RESOURCE_TILES[number]);
  }

  private groupTilesByTarget(
    cleared: Array<{ pos: Position; tile: Tile }>,
    tweens: Promise<void>[],
    actor: "player" | "boss" = "player"
  ): {
    tilesToBoss: Array<{ x: number; y: number; kind: TileKind }>;
    tilesToPlayer: Array<{ x: number; y: number; kind: TileKind }>;
  } {
    const tilesToBoss: Array<{ x: number; y: number; kind: TileKind }> = [];
    const tilesToPlayer: Array<{ x: number; y: number; kind: TileKind }> = [];

    cleared.forEach(({ pos, tile }) => {
      const sprite = this.tileSprites.get(tile.id);
      if (!sprite) return;

      const worldPos = this.toWorld(pos);
      const tileData = { x: worldPos.x, y: worldPos.y, kind: tile.kind };

      const isDamage = this.isDamageTile(tile.base);
      const isResource = this.isResourceTile(tile.base);

      // Damage tiles fly to opponent, resource tiles fly to self
      const toOpponent = actor === "player" ? tilesToBoss : tilesToPlayer;
      const toSelf = actor === "player" ? tilesToPlayer : tilesToBoss;

      if (isDamage) {
        toOpponent.push(tileData);
      } else if (isResource) {
        toSelf.push(tileData);
      }

      tweens.push(this.fadeOutTile(sprite, tile.id));
    });

    return { tilesToBoss, tilesToPlayer };
  }

  private fadeOutTile(sprite: Phaser.GameObjects.Image, tileId: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const baseScale = sprite.scaleX;
      this.tweens.add({
        targets: sprite,
        alpha: VISUAL_EFFECTS.tileFadeAlpha,
        scaleX: baseScale * VISUAL_EFFECTS.tileScaleReduction,
        scaleY: baseScale * VISUAL_EFFECTS.tileScaleReduction,
        duration: ANIMATION_DURATIONS.tileFade,
        ease: ANIMATION_EASING.fade,
        onComplete: () => {
          sprite.destroy();
          this.tileSprites.delete(tileId);
          resolve();
        },
      });
    });
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
      tweens.push(this.createTween(sprite, target, ANIMATION_DURATIONS.tileCollapse));
    });

    collapse.newTiles.forEach(({ tile, pos }) => {
      const target = this.toWorld(pos);
      const sprite = this.spawnTileSprite(tile, pos, this.boardOrigin.y - CELL_SIZE);
      sprite.setPosition(target.x, this.boardOrigin.y - CELL_SIZE);
      tweens.push(this.createTween(sprite, target, ANIMATION_DURATIONS.newTileDrop));
    });

    return Promise.all(tweens);
  }

  private createTween(
    target: Phaser.GameObjects.Image,
    position: { x: number; y: number },
    duration: number
  ): Promise<void> {
    return new Promise<void>((resolve) => {
      this.tweens.add({
        targets: target,
        x: position.x,
        y: position.y,
        duration,
        ease: ANIMATION_EASING.collapse,
        onComplete: () => resolve(),
      });
    });
  }

  private updateHud() {
    this.bossHpBar?.setValue(this.bossHp, BOSS_HP_MAX);
    this.playerHpBar?.setValue(this.playerHp, PLAYER_HP_MAX);
    this.manaBar?.setValue(this.mana, PLAYER_MANA_MAX);
    this.updateBossArt();

    // Обновляем иконку кулдауна босса
    this.cooldownIcon?.setCooldown(this.bossAbility.currentCooldown);

    if (this.turnText) {
      this.turnText.setText(
        this.currentTurn === "player" ? "Ваш ход" : "Ход босса"
      );
      this.turnText.setColor(
        this.currentTurn === "player" ? "#9ef7a5" : "#ffb347"
      );
    }

    // Обновляем состояние всех 4 кнопок способностей
    (["skill1", "skill2", "skill3", "skill4"] as SkillId[]).forEach((id) => {
      const cfg = SKILL_CONFIG[id];
      const canUse = this.mana >= cfg.cost && this.currentTurn === "player" && !this.busy;
      this.skillButtons[id]?.applyState({
        enabled: canUse,
        ready: canUse,
        info: `${cfg.cost} MP`,
      });
    });
  }

  private updateBossArt() {
    if (!this.bossImage) return;
    const ratio = this.bossHp / BOSS_HP_MAX;
    const key = ratio >= BOSS_DAMAGED_HP_THRESHOLD ? ASSET_KEYS.boss.normal : ASSET_KEYS.boss.damaged;
    this.bossImage.setTexture(key);
  }

  private activateSkill(id: SkillId) {
    if (!this.canPlayerAct()) return;

    const cfg = SKILL_CONFIG[id];
    if (this.mana < cfg.cost) return;

    this.mana -= cfg.cost;

    if (cfg.damage > 0) {
      this.applyDamageToBoss(cfg.damage);
      this.flashBoss();
      if (this.bossImage) {
        this.shakeTarget(this.bossImage, VISUAL_EFFECTS.bossShakeOffset);
      }
    }

    if (cfg.heal > 0) {
      this.applyHealToPlayer(cfg.heal);
    }

    this.updateHud();

    if (this.bossHp <= 0) {
      this.showVictory();
      return;
    }
    // Скилл НЕ заканчивает ход - игрок может ещё сделать match
  }

  private showVictory() {
    if (this.gameOver) return;
    this.gameOver = true;
    this.busy = true;
    this.showGameEndModal("Victory!", "#44ff66", "Restart");
  }

  private toWorld(pos: Position) {
    return {
      x: this.boardOrigin.x + pos.x * CELL_SIZE + CELL_SIZE / 2,
      y: this.boardOrigin.y + pos.y * CELL_SIZE + CELL_SIZE / 2,
    };
  }

  private async finishPlayerTurn() {
    if (this.gameOver) return;

    this.checkGameOver();
    if (this.gameOver) return;

    // Тикаем кулдаун абилки босса
    const abilityReady = this.bossAbility.tick();
    this.updateHud();

    if (abilityReady) {
      this.currentTurn = "boss";
      this.busy = true;
      this.updateHud();
      await wait(this, 200);

      await this.executeBossAbility();
      this.bossAbility.reset();
      this.updateHud();

      if (this.playerHp <= 0) {
        this.showDefeat();
        return;
      }

      await wait(this, 300);
    }

    this.currentTurn = "player";
    this.busy = false;
    this.updateHud();
  }

  private async executeBossAbility() {
    const damage = this.bossAbility.damage;
    const { overlay, fullscreenBoss, abilityText } = this.createAbilityCutscene();

    await this.showAbilityCutscene(overlay, fullscreenBoss, abilityText);
    await wait(this, 600);

    this.cameras.main.shake(200, 0.01);
    this.applyDamageToPlayer(damage);
    this.flashPlayerAvatar();
    this.updateHud();

    await wait(this, 400);
    await this.hideAbilityCutscene(overlay, fullscreenBoss, abilityText);
  }

  private createAbilityCutscene() {
    const overlay = this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0)
      .setOrigin(0, 0)
      .setDepth(500);

    const fullscreenBoss = this.add
      .image(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 50, ASSET_KEYS.boss.ulta)
      .setDisplaySize(300, 300)
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(501);

    const abilityText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 120, this.bossAbility.name, {
        fontSize: "32px",
        fontFamily: "Arial, sans-serif",
        color: "#ff4444",
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(501);

    return { overlay, fullscreenBoss, abilityText };
  }

  private showAbilityCutscene(
    overlay: Phaser.GameObjects.Rectangle,
    fullscreenBoss: Phaser.GameObjects.Image,
    abilityText: Phaser.GameObjects.Text
  ): Promise<void> {
    return new Promise<void>((resolve) => {
      this.tweens.add({
        targets: overlay,
        alpha: 0.7,
        duration: ANIMATION_DURATIONS.abilityOverlay,
        ease: ANIMATION_EASING.ability,
      });
      this.tweens.add({
        targets: [fullscreenBoss, abilityText],
        alpha: 1,
        duration: ANIMATION_DURATIONS.abilityFadeIn,
        delay: 100,
        ease: ANIMATION_EASING.ability,
        onComplete: () => resolve(),
      });
    });
  }

  private hideAbilityCutscene(
    overlay: Phaser.GameObjects.Rectangle,
    fullscreenBoss: Phaser.GameObjects.Image,
    abilityText: Phaser.GameObjects.Text
  ): Promise<void> {
    return new Promise<void>((resolve) => {
      this.tweens.add({
        targets: [overlay, fullscreenBoss, abilityText],
        alpha: 0,
        duration: ANIMATION_DURATIONS.abilityFadeOut,
        ease: ANIMATION_EASING.fade,
        onComplete: () => {
          if (overlay.scene) overlay.destroy();
          if (fullscreenBoss.scene) fullscreenBoss.destroy();
          if (abilityText.scene) abilityText.destroy();
          resolve();
        },
      });
    });
  }

  private flashPlayerAvatar() {
    if (!this.playerAvatar) return;

    const originalColor = 0x4caf50;
    this.playerAvatar.setFillStyle(0xffffff, 1);
    this.time.delayedCall(ANIMATION_DURATIONS.flashDuration, () => {
      this.playerAvatar?.setFillStyle(originalColor, 0.8);
    });
  }

  private showDefeat() {
    if (this.gameOver) return;
    this.gameOver = true;
    this.busy = true;
    this.showGameEndModal("Defeat", "#ff6666", "Retry");
  }

  private showGameEndModal(message: string, textColor: string, buttonText: string) {
    const overlay = this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.7)
      .setOrigin(0, 0)
      .setDepth(999);

    const text = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 40, message, {
        fontSize: "36px",
        color: textColor,
        fontFamily: "Arial, sans-serif",
      })
      .setOrigin(0.5)
      .setDepth(999);

    const btn = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 20, buttonText, {
        fontSize: "20px",
        backgroundColor: "#2d5bff",
        padding: { x: 16, y: 8 },
        color: "#ffffff",
        fontFamily: "Arial, sans-serif",
      })
      .setOrigin(0.5)
      .setDepth(999)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.scene.restart());

    this.add.container(0, 0, [overlay, text, btn]).setDepth(999);
  }
}
