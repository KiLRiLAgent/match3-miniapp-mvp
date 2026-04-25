import Phaser from "phaser";
import {
  GAME_WIDTH,
  GAME_HEIGHT,
  GAME_PARAMS,
  SKILL_CONFIG,
  saveGameParams,
  SAFE_AREA,
  ABILITY_NAMES,
  recalcBossHpMax,
  getBossLayerHpArray,
} from "../game/config";
import type { SkillId } from "../game/config";
import { getActiveMode, setActiveMode } from "../game/version";
import type { GameMode } from "../game/version";

// Layout constants
const PANEL_MARGIN_X = 24;
const PANEL_MARGIN_Y_TOP = 30;
const PANEL_MARGIN_Y_BOTTOM = 30;
const HEADER_HEIGHT = 55;
const FOOTER_HEIGHT = 70;
const ROW_HEIGHT = 44;
const BUTTON_SIZE = 36;
const SCROLL_TOP_PADDING = 10;
const SCROLL_BOTTOM_PADDING = 20;
const MODE_BLOCK_HEIGHT = 74;
const MODE_BUTTON_HEIGHT = 30;
const PREVIEW_ROW_HEIGHT = 22;
const PREVIEW_TOP_GAP = 16;
const PREVIEW_BOTTOM_GAP = 16;
const PREVIEW_PADDING = 12;
const SCROLL_DRAG_THRESHOLD_PX = 5;
const WHEEL_SCROLL_SCALE = 0.5;

// Visual constants
const PANEL_BG_COLOR = 0x1a1a2e;
const PANEL_BG_ALPHA = 0.98;
const PANEL_STROKE_COLOR = 0x4a4a6e;
const PANEL_STROKE_WIDTH = 2;
const OVERLAY_COLOR = 0x000000;
const OVERLAY_ALPHA = 0.85;
const PREVIEW_BG_COLOR = 0x111122;
const PREVIEW_BG_ALPHA = 0.85;
const PREVIEW_STROKE_COLOR = 0x553a78;
const PREVIEW_STROKE_WIDTH = 1;
const SCROLLBAR_COLOR = 0x666666;
const SCROLLBAR_ALPHA = 0.5;
const SCROLLBAR_WIDTH = 3;

// Button colors
const MINUS_BG_COLOR = 0x442222;
const MINUS_BG_HOVER_COLOR = 0x553333;
const MINUS_STROKE_COLOR = 0x663333;
const PLUS_BG_COLOR = 0x224422;
const PLUS_BG_HOVER_COLOR = 0x335533;
const PLUS_STROKE_COLOR = 0x336633;
const APPLY_BG_COLOR = 0x2a4a2e;
const APPLY_BG_HOVER_COLOR = 0x3a5a3e;
const APPLY_STROKE_COLOR = 0x4a8a4e;
const MODE_BG_COLOR = 0x2a2358;
const MODE_BG_HOVER_COLOR = 0x3a3078;
const MODE_STROKE_COLOR = 0x6e4ac8;

// Depth
const PANEL_DEPTH = 100;

type ParamRow = {
  label: string;
  getValue: () => number;
  setValue: (v: number) => void;
  min: number;
  max: number;
  step: number;
  isPattern?: boolean;
  format?: (v: number) => string;
};

type Row = {
  label: Phaser.GameObjects.Text;
  value: Phaser.GameObjects.Text;
  minus: Phaser.GameObjects.Text;
  minusBg: Phaser.GameObjects.Rectangle;
  plus: Phaser.GameObjects.Text;
  plusBg: Phaser.GameObjects.Rectangle;
  param: ParamRow;
};

/**
 * Settings panel for editing GAME_PARAMS at runtime. Uses a top-level scene
 * Container for scrollable content (R-T1-2): geometry masks ONLY work on
 * top-level objects, not on Container children — so `scrollContainer` lives
 * directly on the scene, not as a child of this SettingsPanel. We hold a
 * reference and destroy it manually in `close()` to keep teardown atomic.
 *
 * See `.conventions/anti-patterns/avoid-container-mask.md` for the rule.
 */
export class SettingsPanel extends Phaser.GameObjects.Container {
  private overlay: Phaser.GameObjects.Rectangle;
  private panel: Phaser.GameObjects.Rectangle;
  private scrollContainer: Phaser.GameObjects.Container;
  private scrollMaskGfx: Phaser.GameObjects.Graphics;
  private scrollbar: Phaser.GameObjects.Rectangle | null = null;
  private rows: Row[] = [];
  private onClose: () => void;
  private scrollY = 0;
  private maxScrollY = 0;
  private scrollAreaTop = 0;
  private scrollAreaHeight = 0;
  private contentHeight = 0;
  private panelX = 0;
  private panelWidth = 0;

  // Live HP preview
  private hpPreviewText: Phaser.GameObjects.Text | null = null;
  private hpPreviewBg: Phaser.GameObjects.Rectangle | null = null;

  // Scroll state
  private dragStartY = 0;
  private scrollStartY = 0;
  private isDragging = false;
  private dragArmed = false;
  private pointerDownHandler: ((pointer: Phaser.Input.Pointer) => void) | null = null;
  private pointerMoveHandler: ((pointer: Phaser.Input.Pointer) => void) | null = null;
  private pointerUpHandler: ((pointer: Phaser.Input.Pointer) => void) | null = null;
  private wheelHandler: ((pointer: Phaser.Input.Pointer, gameObjects: Phaser.GameObjects.GameObject[], deltaX: number, deltaY: number) => void) | null = null;

  constructor(scene: Phaser.Scene, onClose: () => void) {
    super(scene, 0, 0);
    this.onClose = onClose;

    this.panelWidth = GAME_WIDTH - PANEL_MARGIN_X;
    const panelHeight = GAME_HEIGHT - PANEL_MARGIN_Y_TOP - PANEL_MARGIN_Y_BOTTOM - SAFE_AREA.top - SAFE_AREA.bottom;
    this.panelX = PANEL_MARGIN_X / 2;
    const panelY = PANEL_MARGIN_Y_TOP + SAFE_AREA.top;

    this.overlay = scene.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, OVERLAY_COLOR, OVERLAY_ALPHA)
      .setOrigin(0)
      .setInteractive();

    this.panel = scene.add
      .rectangle(this.panelX, panelY, this.panelWidth, panelHeight, PANEL_BG_COLOR, PANEL_BG_ALPHA)
      .setOrigin(0)
      .setStrokeStyle(PANEL_STROKE_WIDTH, PANEL_STROKE_COLOR);

    const title = scene.add
      .text(GAME_WIDTH / 2, panelY + 25, "⚙️ Настройки", {
        fontSize: "24px",
        color: "#ffffff",
        fontFamily: "'Exo 2', Arial, sans-serif",
        fontStyle: "bold",
        resolution: 2,
      })
      .setOrigin(0.5);

    const closeBtn = scene.add
      .text(this.panelX + this.panelWidth - 20, panelY + 15, "✕", {
        fontSize: "28px",
        color: "#ff6666",
        fontFamily: "'Exo 2', Arial, sans-serif",
        resolution: 2,
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.close());

    this.add([this.overlay, this.panel, title, closeBtn]);

    // Scroll bounds
    this.scrollAreaTop = panelY + HEADER_HEIGHT;
    this.scrollAreaHeight = panelHeight - HEADER_HEIGHT - FOOTER_HEIGHT;

    // Geometry mask shape — used to clip scrollContainer (which is top-level)
    this.scrollMaskGfx = scene.add.graphics();
    this.scrollMaskGfx.fillStyle(0xffffff);
    this.scrollMaskGfx.fillRect(this.panelX, this.scrollAreaTop, this.panelWidth, this.scrollAreaHeight);
    this.scrollMaskGfx.setVisible(false);

    // R-T1-2: scrollContainer is a TOP-LEVEL scene child, NOT a child of this
    // SettingsPanel. Geometry masks only work correctly on top-level objects.
    // We hold a reference and destroy it manually in `close()`.
    this.scrollContainer = scene.add.container(0, 0);
    this.scrollContainer.setDepth(PANEL_DEPTH);
    this.scrollContainer.setMask(new Phaser.Display.Masks.GeometryMask(scene, this.scrollMaskGfx));

    // Build params + populate scrollContainer
    const params = this.buildParamList();
    const startY = this.scrollAreaTop + SCROLL_TOP_PADDING;

    this.createModeToggleBlock(scene, this.panelX, this.panelWidth, startY);
    const paramsStartY = startY + MODE_BLOCK_HEIGHT;

    let nextY = paramsStartY;
    const lastMultIdx = this.findLastMultiplierIdx(params);

    params.forEach((param, idx) => {
      this.createParamRow(scene, param, nextY);
      nextY += ROW_HEIGHT;

      if (idx === lastMultIdx) {
        nextY += PREVIEW_TOP_GAP;
        this.createHpPreviewBlock(scene, this.panelX, this.panelWidth, nextY);
        nextY += this.computeHpPreviewHeight();
        nextY += PREVIEW_BOTTOM_GAP;
      }
    });

    this.contentHeight = nextY - startY + SCROLL_BOTTOM_PADDING;
    this.maxScrollY = Math.max(0, this.contentHeight - this.scrollAreaHeight + SCROLL_TOP_PADDING);

    // Scrollbar — sits on this Container (above panel chrome)
    if (this.maxScrollY > 0) {
      const scrollbarHeight = (this.scrollAreaHeight / this.contentHeight) * this.scrollAreaHeight;
      this.scrollbar = scene.add
        .rectangle(this.panelX + this.panelWidth - 4, this.scrollAreaTop, SCROLLBAR_WIDTH, scrollbarHeight, SCROLLBAR_COLOR, SCROLLBAR_ALPHA)
        .setOrigin(0.5, 0);
      this.add(this.scrollbar);
    }

    // Apply button — drawn on this Container (overlays scrollContainer because
    // this.depth = PANEL_DEPTH but PANEL_DEPTH equals scrollContainer's depth.
    // Phaser draws within-depth in z-order = creation order, so apply button
    // created LAST overlays the scroll content correctly).
    const applyBtnBg = scene.add
      .rectangle(GAME_WIDTH / 2, panelY + panelHeight - 35, this.panelWidth - 40, 50, APPLY_BG_COLOR, 1)
      .setOrigin(0.5)
      .setStrokeStyle(2, APPLY_STROKE_COLOR)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.applyAndRestart())
      .on("pointerover", () => applyBtnBg.setFillStyle(APPLY_BG_HOVER_COLOR))
      .on("pointerout", () => applyBtnBg.setFillStyle(APPLY_BG_COLOR));

    const applyBtn = scene.add
      .text(GAME_WIDTH / 2, panelY + panelHeight - 35, "💾 Сохранить и перезапустить", {
        fontSize: "18px",
        color: "#88ff88",
        fontFamily: "'Exo 2', Arial, sans-serif",
        fontStyle: "bold",
        resolution: 2,
      })
      .setOrigin(0.5);

    this.add([applyBtnBg, applyBtn]);

    this.setupScrollHandlers(scene);
    this.updateValues();

    scene.add.existing(this);
    this.setDepth(PANEL_DEPTH + 1); // overlay/panel chrome above scrollContainer
  }

  // ───────────────────────────────────────────────────────────────────────
  // Param list construction
  // ───────────────────────────────────────────────────────────────────────

  private buildParamList(): ParamRow[] {
    const params: ParamRow[] = [
      // === ИГРОК ===
      { label: "❤️ HP игрока", getValue: () => GAME_PARAMS.player.hpMax, setValue: (v) => GAME_PARAMS.player.hpMax = v, min: 50, max: 1000, step: 10 },
      { label: "💧 MP игрока", getValue: () => GAME_PARAMS.player.manaMax, setValue: (v) => GAME_PARAMS.player.manaMax = v, min: 50, max: 500, step: 10 },
      { label: "⚔️ Физ. атака", getValue: () => GAME_PARAMS.player.physAttack, setValue: (v) => GAME_PARAMS.player.physAttack = v, min: 1, max: 50, step: 1 },
      { label: "✨ Маг. атака", getValue: () => GAME_PARAMS.player.magAttack, setValue: (v) => GAME_PARAMS.player.magAttack = v, min: 1, max: 50, step: 1 },

      // === БОСС ===
      // R-T1-1: renamed from «Баз. HP слоя» to disambiguate the per-layer base
      // input from the resulting total HP (which Иван misread as the layer 1 value).
      { label: "👿 ХП одной полоски (база)", getValue: () => GAME_PARAMS.boss.baseHpPerLayer, setValue: (v) => { GAME_PARAMS.boss.baseHpPerLayer = v; recalcBossHpMax(); }, min: 10, max: 5000, step: 10 },
      { label: "🔢 Кол-во полосок", getValue: () => GAME_PARAMS.boss.layerCount, setValue: (v) => {
        GAME_PARAMS.boss.layerCount = v;
        while (GAME_PARAMS.boss.layerMultipliers.length < v) GAME_PARAMS.boss.layerMultipliers.push(1.0);
        GAME_PARAMS.boss.layerMultipliers.length = v;
        recalcBossHpMax();
      }, min: 1, max: 20, step: 1 },
      { label: "👊 Атака босса", getValue: () => GAME_PARAMS.boss.physAttack, setValue: (v) => GAME_PARAMS.boss.physAttack = v, min: 1, max: 50, step: 1 },
    ];

    // Layer multipliers (dynamic count)
    for (let i = 0; i < GAME_PARAMS.boss.layerCount; i++) {
      const idx = i;
      params.push({
        label: `📊 K${idx + 1} (полоска ${idx + 1})`,
        getValue: () => Math.round(GAME_PARAMS.boss.layerMultipliers[idx] * 10) / 10,
        setValue: (v) => { GAME_PARAMS.boss.layerMultipliers[idx] = Math.round(v * 10) / 10; recalcBossHpMax(); },
        min: 0.1,
        max: 10.0,
        step: 0.1,
        format: (v) => `x${v.toFixed(1)}`,
      });
    }

    params.push(
      // === ТАЙЛЫ ===
      { label: "💚 HP за тайл", getValue: () => GAME_PARAMS.tiles.hpPerTile, setValue: (v) => GAME_PARAMS.tiles.hpPerTile = v, min: 1, max: 50, step: 1 },
      { label: "💙 MP за тайл", getValue: () => GAME_PARAMS.tiles.mpPerTile, setValue: (v) => GAME_PARAMS.tiles.mpPerTile = v, min: 1, max: 50, step: 1 },
      { label: "🗡️ Урон меча", getValue: () => GAME_PARAMS.tiles.swordDamage, setValue: (v) => GAME_PARAMS.tiles.swordDamage = v, min: 1, max: 50, step: 1 },
      { label: "⭐ Урон звезды", getValue: () => GAME_PARAMS.tiles.starDamage, setValue: (v) => GAME_PARAMS.tiles.starDamage = v, min: 1, max: 50, step: 1 },

      // === СПОСОБНОСТИ БОССА ===
      { label: "🔴 Урон атаки", getValue: () => GAME_PARAMS.bossAbilities.attackDamage, setValue: (v) => GAME_PARAMS.bossAbilities.attackDamage = v, min: 10, max: 200, step: 10 },
      { label: "🔴 КД атаки", getValue: () => GAME_PARAMS.bossAbilities.attackCooldown, setValue: (v) => GAME_PARAMS.bossAbilities.attackCooldown = v, min: 1, max: 10, step: 1 },
      { label: "💣 Кол-во бомб", getValue: () => GAME_PARAMS.bossAbilities.bombCount, setValue: (v) => GAME_PARAMS.bossAbilities.bombCount = v, min: 1, max: 10, step: 1 },
      { label: "💣 Таймер бомб", getValue: () => GAME_PARAMS.bossAbilities.bombCooldown, setValue: (v) => GAME_PARAMS.bossAbilities.bombCooldown = v, min: 1, max: 10, step: 1 },
      { label: "💣 Урон бомбы", getValue: () => GAME_PARAMS.bossAbilities.bombDamage, setValue: (v) => GAME_PARAMS.bossAbilities.bombDamage = v, min: 10, max: 200, step: 10 },
      { label: "💣 КД бомб", getValue: () => GAME_PARAMS.bossAbilities.bombsAbilityCooldown, setValue: (v) => GAME_PARAMS.bossAbilities.bombsAbilityCooldown = v, min: 1, max: 10, step: 1 },
      { label: "🛡️ Длит. щита", getValue: () => GAME_PARAMS.bossAbilities.shieldDuration, setValue: (v) => GAME_PARAMS.bossAbilities.shieldDuration = v, min: 1, max: 10, step: 1 },
      { label: "🛡️ КД щита", getValue: () => GAME_PARAMS.bossAbilities.shieldCooldown, setValue: (v) => GAME_PARAMS.bossAbilities.shieldCooldown = v, min: 1, max: 10, step: 1 },
      { label: "⚡ Мощн. удар", getValue: () => GAME_PARAMS.bossAbilities.powerStrikeDamage, setValue: (v) => GAME_PARAMS.bossAbilities.powerStrikeDamage = v, min: 50, max: 500, step: 25 },
      { label: "⚡ КД удара", getValue: () => GAME_PARAMS.bossAbilities.powerStrikeCooldown, setValue: (v) => GAME_PARAMS.bossAbilities.powerStrikeCooldown = v, min: 1, max: 10, step: 1 },
      { label: "🌀 Слив маны", getValue: () => GAME_PARAMS.bossAbilities.powerStrikeManaDrain, setValue: (v) => GAME_PARAMS.bossAbilities.powerStrikeManaDrain = v, min: 0, max: 100, step: 10 },

      // === ПУЛ СПОСОБНОСТЕЙ БОССА (рандом) ===
      { label: "⚔️ Атак в пуле", getValue: () => this.countInPool(1), setValue: (v) => this.setPoolCount(1, v), min: 0, max: 6, step: 1 },
      { label: "💣 Бомб в пуле", getValue: () => this.countInPool(2), setValue: (v) => this.setPoolCount(2, v), min: 0, max: 4, step: 1 },
      { label: "🛡 Щитов в пуле", getValue: () => this.countInPool(3), setValue: (v) => this.setPoolCount(3, v), min: 0, max: 3, step: 1 },
      { label: "⚡ Ульт в пуле", getValue: () => this.countInPool(4), setValue: (v) => this.setPoolCount(4, v), min: 0, max: 3, step: 1 },
    );

    // Player skill costs
    const skillIds: SkillId[] = ["powerStrike", "stun", "heal", "hammer"];
    skillIds.forEach((id) => {
      const cfg = SKILL_CONFIG[id];
      params.push({
        label: `${cfg.icon} ${cfg.name}`,
        getValue: () => cfg.cost,
        setValue: (v) => (cfg as { cost: number }).cost = v,
        min: 0,
        max: 200,
        step: 5,
      });
    });

    return params;
  }

  /**
   * Find the index of the last layer-multiplier param. The HP preview block
   * is inserted immediately AFTER this row so users see the live computed
   * HP array right under the K-coefficient inputs.
   */
  private findLastMultiplierIdx(params: ParamRow[]): number {
    let idx = -1;
    params.forEach((p, i) => {
      if (p.label.startsWith("📊 K")) idx = i;
    });
    return idx;
  }

  // ───────────────────────────────────────────────────────────────────────
  // Row creation (rows are added to scrollContainer, NOT to `this`)
  // ───────────────────────────────────────────────────────────────────────

  private createParamRow(scene: Phaser.Scene, param: ParamRow, y: number) {
    const label = scene.add
      .text(this.panelX + 15, y, param.label, {
        fontSize: "16px",
        color: "#ffffff",
        fontFamily: "'Exo 2', Arial, sans-serif",
        resolution: 2,
      })
      .setOrigin(0, 0.5);

    const minusBg = scene.add
      .rectangle(this.panelX + this.panelWidth - 115, y, BUTTON_SIZE, BUTTON_SIZE, MINUS_BG_COLOR, 1)
      .setOrigin(0.5)
      .setStrokeStyle(1, MINUS_STROKE_COLOR)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.adjustParam(param, -1))
      .on("pointerover", () => minusBg.setFillStyle(MINUS_BG_HOVER_COLOR))
      .on("pointerout", () => minusBg.setFillStyle(MINUS_BG_COLOR));

    const minus = scene.add
      .text(this.panelX + this.panelWidth - 115, y, "−", {
        fontSize: "24px",
        color: "#ff8888",
        fontFamily: "'Exo 2', Arial, sans-serif",
        fontStyle: "bold",
        resolution: 2,
      })
      .setOrigin(0.5);

    const displayValue = this.formatParamValue(param);
    const value = scene.add
      .text(this.panelX + this.panelWidth - 65, y, displayValue, {
        fontSize: (param.isPattern || param.format) ? "12px" : "16px",
        color: "#ffffff",
        fontFamily: "'Exo 2', Arial, sans-serif",
        fontStyle: "bold",
        resolution: 2,
      })
      .setOrigin(0.5);

    const plusBg = scene.add
      .rectangle(this.panelX + this.panelWidth - 20, y, BUTTON_SIZE, BUTTON_SIZE, PLUS_BG_COLOR, 1)
      .setOrigin(0.5)
      .setStrokeStyle(1, PLUS_STROKE_COLOR)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.adjustParam(param, 1))
      .on("pointerover", () => plusBg.setFillStyle(PLUS_BG_HOVER_COLOR))
      .on("pointerout", () => plusBg.setFillStyle(PLUS_BG_COLOR));

    const plus = scene.add
      .text(this.panelX + this.panelWidth - 20, y, "+", {
        fontSize: "24px",
        color: "#88ff88",
        fontFamily: "'Exo 2', Arial, sans-serif",
        fontStyle: "bold",
        resolution: 2,
      })
      .setOrigin(0.5);

    this.rows.push({ label, value, minus, minusBg, plus, plusBg, param });
    this.scrollContainer.add([label, minusBg, minus, value, plusBg, plus]);
  }

  // ───────────────────────────────────────────────────────────────────────
  // HP preview block — live recompute on every input change
  // ───────────────────────────────────────────────────────────────────────

  private buildHpPreviewLines(): string[] {
    const arr = getBossLayerHpArray();
    const total = arr.reduce((s, v) => s + v, 0);
    const lines: string[] = [];
    arr.forEach((hp, i) => {
      lines.push(`Полоска ${i + 1}: ${hp} HP`);
    });
    lines.push(`Итого: ${total} HP`);
    return lines;
  }

  private computeHpPreviewHeight(): number {
    const lines = this.buildHpPreviewLines();
    return lines.length * PREVIEW_ROW_HEIGHT + PREVIEW_PADDING * 2;
  }

  private createHpPreviewBlock(
    scene: Phaser.Scene,
    panelX: number,
    panelWidth: number,
    blockY: number,
  ) {
    const lines = this.buildHpPreviewLines();
    const blockHeight = lines.length * PREVIEW_ROW_HEIGHT + PREVIEW_PADDING * 2;
    const blockWidth = panelWidth - 30;
    const blockX = panelX + 15;

    this.hpPreviewBg = scene.add
      .rectangle(blockX, blockY, blockWidth, blockHeight, PREVIEW_BG_COLOR, PREVIEW_BG_ALPHA)
      .setOrigin(0)
      .setStrokeStyle(PREVIEW_STROKE_WIDTH, PREVIEW_STROKE_COLOR);

    this.hpPreviewText = scene.add
      .text(blockX + PREVIEW_PADDING, blockY + PREVIEW_PADDING, lines.join("\n"), {
        fontSize: "14px",
        color: "#e6c068",
        fontFamily: "'Exo 2', Arial, sans-serif",
        fontStyle: "bold",
        resolution: 2,
        lineSpacing: PREVIEW_ROW_HEIGHT - 14,
      })
      .setOrigin(0, 0);

    this.scrollContainer.add([this.hpPreviewBg, this.hpPreviewText]);
  }

  private updateHpPreview(): void {
    if (!this.hpPreviewText || !this.hpPreviewBg) return;
    const lines = this.buildHpPreviewLines();
    this.hpPreviewText.setText(lines.join("\n"));
    const newHeight = lines.length * PREVIEW_ROW_HEIGHT + PREVIEW_PADDING * 2;
    this.hpPreviewBg.setSize(this.hpPreviewBg.width, newHeight);
  }

  // ───────────────────────────────────────────────────────────────────────
  // Scroll handlers
  // ───────────────────────────────────────────────────────────────────────

  private setupScrollHandlers(scene: Phaser.Scene) {
    // Logic-2: drag is "armed" on pointerdown but only starts shifting content
    // after pointer moves >= SCROLL_DRAG_THRESHOLD_PX. This prevents accidental
    // scroll on slow taps over +/- buttons.
    this.pointerDownHandler = (pointer: Phaser.Input.Pointer) => {
      if (!this.visible) return;
      this.dragArmed = true;
      this.isDragging = false;
      this.dragStartY = pointer.y;
      this.scrollStartY = this.scrollY;
    };

    this.pointerMoveHandler = (pointer: Phaser.Input.Pointer) => {
      if (!this.visible || !this.dragArmed) return;
      const deltaY = pointer.y - this.dragStartY;
      if (!this.isDragging) {
        if (Math.abs(deltaY) < SCROLL_DRAG_THRESHOLD_PX) return;
        this.isDragging = true;
      }
      this.scrollY = Phaser.Math.Clamp(this.scrollStartY - deltaY, 0, this.maxScrollY);
      this.updateScrollPosition();
    };

    this.pointerUpHandler = (_pointer: Phaser.Input.Pointer) => {
      this.isDragging = false;
      this.dragArmed = false;
    };

    this.wheelHandler = (_pointer, _gameObjects, _deltaX, deltaY) => {
      if (!this.visible) return;
      this.scrollY = Phaser.Math.Clamp(this.scrollY + deltaY * WHEEL_SCROLL_SCALE, 0, this.maxScrollY);
      this.updateScrollPosition();
    };

    scene.input.on("pointerdown", this.pointerDownHandler);
    scene.input.on("pointermove", this.pointerMoveHandler);
    scene.input.on("pointerup", this.pointerUpHandler);
    scene.input.on("wheel", this.wheelHandler);
  }

  private updateScrollPosition() {
    this.scrollContainer.y = -this.scrollY;

    if (this.scrollbar && this.maxScrollY > 0) {
      const scrollbarHeight = (this.scrollAreaHeight / this.contentHeight) * this.scrollAreaHeight;
      const scrollProgress = this.scrollY / this.maxScrollY;
      this.scrollbar.y = this.scrollAreaTop + scrollProgress * (this.scrollAreaHeight - scrollbarHeight);
    }
  }

  // ───────────────────────────────────────────────────────────────────────
  // Param value handling
  // ───────────────────────────────────────────────────────────────────────

  private adjustParam(param: ParamRow, direction: number) {
    const current = param.getValue();
    const raw = current + param.step * direction;
    const precision = param.step < 1 ? 10 : 1;
    const rounded = Math.round(raw * precision) / precision;
    // Logic-1: NaN guard — if for any reason `current` or `raw` is NaN
    // (corrupted localStorage that bypassed loadGameParams sanitization),
    // fall back to the current value to keep the UI stable.
    const safeRaw = Number.isFinite(rounded) ? rounded : current;
    const newVal = Phaser.Math.Clamp(safeRaw, param.min, param.max);
    param.setValue(newVal);
    this.updateValues();
  }

  private countInPool(abilityNum: number): number {
    return GAME_PARAMS.bossPattern.filter((n: number) => n === abilityNum).length;
  }

  private setPoolCount(abilityNum: number, count: number): void {
    GAME_PARAMS.bossPattern = GAME_PARAMS.bossPattern.filter((n: number) => n !== abilityNum);
    for (let i = 0; i < count; i++) {
      GAME_PARAMS.bossPattern.push(abilityNum);
    }
  }

  private formatParamValue(param: ParamRow): string {
    const val = param.getValue();
    if (param.format) return param.format(val);
    if (param.isPattern) return ABILITY_NAMES[val] || val.toString();
    return val.toString();
  }

  private updateValues() {
    this.rows.forEach((row) => {
      row.value.setText(this.formatParamValue(row.param));
    });
    this.updateHpPreview();
  }

  private applyAndRestart() {
    saveGameParams();
    const sceneRef = this.scene;
    this.close();
    sceneRef.scene.stop("GameScene");
    sceneRef.scene.start("IntroScene");
  }

  // ───────────────────────────────────────────────────────────────────────
  // Mode toggle block (added inside scrollContainer at the top)
  // ───────────────────────────────────────────────────────────────────────

  private createModeToggleBlock(
    scene: Phaser.Scene,
    panelX: number,
    panelWidth: number,
    blockY: number,
  ) {
    const currentMode: GameMode = getActiveMode();
    const targetMode: GameMode = currentMode === "v1" ? "v2" : "v1";
    const currentLabel = currentMode === "v1" ? "v1 Классика" : "v2 Университет (β)";
    const buttonLabel =
      targetMode === "v2"
        ? "⟳ Переключить на v2 Университет (β)"
        : "⟳ Переключить на v1 Классика";

    const label = scene.add
      .text(panelX + 15, blockY + 6, "🔮 Режим игры", {
        fontSize: "16px",
        color: "#ffffff",
        fontFamily: "'Exo 2', Arial, sans-serif",
        fontStyle: "bold",
        resolution: 2,
      })
      .setOrigin(0, 0);

    const valueText = scene.add
      .text(panelX + panelWidth - 15, blockY + 6, currentLabel, {
        fontSize: "14px",
        color: "#e6c068",
        fontFamily: "'Exo 2', Arial, sans-serif",
        fontStyle: "bold",
        resolution: 2,
      })
      .setOrigin(1, 0);

    const btnY = blockY + 42;
    const btnWidth = panelWidth - 30;
    const btnX = panelX + panelWidth / 2;

    const btnBg = scene.add
      .rectangle(btnX, btnY, btnWidth, MODE_BUTTON_HEIGHT, MODE_BG_COLOR, 1)
      .setOrigin(0.5)
      .setStrokeStyle(2, MODE_STROKE_COLOR)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => {
        setActiveMode(targetMode);
        window.location.reload();
      })
      .on("pointerover", () => btnBg.setFillStyle(MODE_BG_HOVER_COLOR))
      .on("pointerout", () => btnBg.setFillStyle(MODE_BG_COLOR));

    const btnText = scene.add
      .text(btnX, btnY, buttonLabel, {
        fontSize: "14px",
        color: "#e6d4ff",
        fontFamily: "'Exo 2', Arial, sans-serif",
        fontStyle: "bold",
        resolution: 2,
      })
      .setOrigin(0.5);

    this.scrollContainer.add([label, valueText, btnBg, btnText]);
  }

  // ───────────────────────────────────────────────────────────────────────
  // Cleanup
  // ───────────────────────────────────────────────────────────────────────

  private close() {
    if (this.pointerDownHandler) {
      this.scene.input.off("pointerdown", this.pointerDownHandler);
    }
    if (this.pointerMoveHandler) {
      this.scene.input.off("pointermove", this.pointerMoveHandler);
    }
    if (this.pointerUpHandler) {
      this.scene.input.off("pointerup", this.pointerUpHandler);
    }
    if (this.wheelHandler) {
      this.scene.input.off("wheel", this.wheelHandler);
    }

    // R-T1-2: scrollContainer + maskGfx are top-level scene children, NOT
    // children of this Container. Destroy them explicitly so they don't
    // outlive the panel.
    this.scrollContainer.destroy();
    this.scrollMaskGfx.destroy();

    this.destroy();
    this.onClose();
  }
}
