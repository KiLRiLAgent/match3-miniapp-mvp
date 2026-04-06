import Phaser from "phaser";
import { ANIMATION_DURATIONS } from "../game/animations";
import { tweenPromise } from "../utils/helpers";
import type { Chain, ChainVariant, Position } from "../match3/types";

const CHAIN_COLORS: Record<ChainVariant, number> = {
  iron: 0x808088,
  thorn: 0x4a2d6e,
  gold: 0xe6c068,
};

const CHAIN_DEPTH = 1.2;
const SPRITE_SCALE = 0.85;
const STROKE_WIDTH = 2;
const STROKE_COLOR = 0xffffff;
const STROKE_ALPHA = 0.5;
const FILL_ALPHA = 0.7;
const FLASH_DIM_ALPHA = 0.3;
const BROKEN_END_SCALE = 1.4;
const HP_TEXT_SIZE = "18px";
const HP_TEXT_COLOR = "#ffffff";
const HP_TEXT_STROKE = "#000000";
const HP_TEXT_STROKE_THICKNESS = 2;
const HP_TEXT_FONT = "'Exo 2', Arial, sans-serif";
const HP_TEXT_DEPTH_OFFSET = 0.01;

interface ChainSpriteEntry {
  pos: Position;
  bgRect: Phaser.GameObjects.Rectangle;
  hpText: Phaser.GameObjects.Text;
}

/**
 * Plain manager class (NOT a Container) that renders Chain overlay state on
 * top of a Match3 board. Lives in `src/ui/` (neutral location, REFINEMENT 3
 * — GameScene needs runtime constructor access). Owns scene-direct rectangles
 * + texts and exposes parallel batched-tween animations that satisfy
 * MITIGATION-5 CRIT-1..6 (O(1) wall-clock, ≤200ms damage, ≤300ms broken).
 */
export class ChainOverlay {
  private scene: Phaser.Scene;
  private boardOriginX: number;
  private boardOriginY: number;
  private cellSize: number;
  private spriteByKey: Map<string, ChainSpriteEntry> = new Map();

  constructor(
    scene: Phaser.Scene,
    boardOriginX: number,
    boardOriginY: number,
    cellSize: number,
  ) {
    this.scene = scene;
    this.boardOriginX = boardOriginX;
    this.boardOriginY = boardOriginY;
    this.cellSize = cellSize;
  }

  /** Initial render. Called by GameScene after Board.placeChains. */
  setChains(chains: Chain[]): void {
    this.clear();
    for (const chain of chains) this.createSprite(chain);
  }

  /**
   * Animate damage flash on all damaged chains in PARALLEL.
   * CRIT-1: O(1) wall-clock — single batched tween, NOT serial.
   * CRIT-3: Pattern A (single tweenPromise with `targets: array`).
   * CRIT-4: ≤ flashDuration × 2 (yoyo) = 200ms total.
   * ADD-2: idempotent — silently skips already-destroyed sprites via .active guard.
   */
  async animateDamage(damaged: Chain[]): Promise<void> {
    if (damaged.length === 0) return;

    const targets: Phaser.GameObjects.Rectangle[] = [];
    for (const chain of damaged) {
      const entry = this.spriteByKey.get(this.key(chain.pos));
      if (entry && entry.bgRect.active) targets.push(entry.bgRect);
    }
    if (targets.length === 0) return;

    for (const chain of damaged) {
      const entry = this.spriteByKey.get(this.key(chain.pos));
      if (entry && entry.hpText.active) {
        entry.hpText.setText(`${Math.max(0, chain.hp - 1)}`);
      }
    }

    await tweenPromise(this.scene, {
      targets,
      alpha: { from: 1, to: FLASH_DIM_ALPHA },
      duration: ANIMATION_DURATIONS.flashDuration,
      yoyo: true,
      ease: "Quad.easeOut",
    });
  }

  /**
   * Animate broken chains fading out + scaling up in PARALLEL.
   * CRIT-2: O(1) wall-clock — single batched tween over rects + texts.
   * CRIT-3: Pattern A (single tweenPromise).
   * CRIT-5: ≤ abilityFadeOut (300ms).
   * ADD-2: idempotent — silently skips already-destroyed sprites.
   */
  async animateBroken(broken: Chain[]): Promise<void> {
    if (broken.length === 0) return;

    const rects: Phaser.GameObjects.Rectangle[] = [];
    const texts: Phaser.GameObjects.Text[] = [];
    const entries: ChainSpriteEntry[] = [];
    for (const chain of broken) {
      const entry = this.spriteByKey.get(this.key(chain.pos));
      if (entry && entry.bgRect.active && entry.hpText.active) {
        rects.push(entry.bgRect);
        texts.push(entry.hpText);
        entries.push(entry);
      }
    }
    if (entries.length === 0) return;

    await tweenPromise(this.scene, {
      targets: [...rects, ...texts],
      alpha: 0,
      scale: BROKEN_END_SCALE,
      duration: ANIMATION_DURATIONS.abilityFadeOut,
      ease: "Quad.easeIn",
    });

    for (const entry of entries) {
      const k = this.key(entry.pos);
      if (entry.bgRect.active) entry.bgRect.destroy();
      if (entry.hpText.active) entry.hpText.destroy();
      this.spriteByKey.delete(k);
    }
  }

  clear(): void {
    for (const entry of this.spriteByKey.values()) {
      if (entry.bgRect.active) entry.bgRect.destroy();
      if (entry.hpText.active) entry.hpText.destroy();
    }
    this.spriteByKey.clear();
  }

  destroy(): void {
    this.clear();
  }

  private createSprite(chain: Chain): void {
    const px = this.boardOriginX + chain.pos.x * this.cellSize + this.cellSize / 2;
    const py = this.boardOriginY + chain.pos.y * this.cellSize + this.cellSize / 2;
    const color = CHAIN_COLORS[chain.variant] ?? CHAIN_COLORS.iron;
    const spriteSize = this.cellSize * SPRITE_SCALE;

    const bgRect = this.scene.add
      .rectangle(px, py, spriteSize, spriteSize, color, FILL_ALPHA)
      .setStrokeStyle(STROKE_WIDTH, STROKE_COLOR, STROKE_ALPHA)
      .setDepth(CHAIN_DEPTH);

    const hpText = this.scene.add
      .text(px, py, `${chain.hp}`, {
        fontSize: HP_TEXT_SIZE,
        color: HP_TEXT_COLOR,
        fontFamily: HP_TEXT_FONT,
        fontStyle: "bold",
        stroke: HP_TEXT_STROKE,
        strokeThickness: HP_TEXT_STROKE_THICKNESS,
      })
      .setOrigin(0.5)
      .setDepth(CHAIN_DEPTH + HP_TEXT_DEPTH_OFFSET);

    this.spriteByKey.set(this.key(chain.pos), { pos: chain.pos, bgRect, hpText });
  }

  private key(pos: Position): string {
    return `${pos.x},${pos.y}`;
  }
}
