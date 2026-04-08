/**
 * ShopScene — Phase 2A magazin opened from HubScene's «🛒 Магазин» button.
 *
 * Layout:
 *   Title «🛒 Магазин» + gold counter
 *   6 offer cards (rendered top-to-bottom): rarity-coloured name, stat
 *   summary, slot label, price, Buy interaction. Tap a card to purchase.
 *   Back button «← В Hub» pops to HubScene.
 *
 * Purchase contract: routes through `shopSystem.purchase()` which validates
 * gold + backpack capacity and atomically credits the inventory. On success
 * we restart the scene so the gold counter and (eventually) any sold-out
 * affordances refresh; on failure we surface the discriminated `reason`
 * code as a Russian toast.
 *
 * Daily assortment is cached on the instance — `getCurrentAssortment()`
 * is deterministic per UTC day so a refresh inside the same day returns
 * identical offers.
 *
 * RISK-7: `gameState.ensureLoaded()` runs before any save read.
 * R14 v2-isolation: imports only from `src/v2/*` + `src/game/config`.
 * R10: shared `createButton` factory mirrors ArenaScene; task #18 will
 * lift both into `src/v2/ui/SceneChrome.ts` and delete the duplicates.
 */

import Phaser from "phaser";
import { DPR, SAFE_AREA } from "../../game/config";
import { gameState } from "../core/GameState";
import { sceneRouter } from "../core/SceneRouter";
import { shopSystem } from "../systems/ShopSystem";
import type { ShopOffer } from "../systems/ShopSystem";
import { toast } from "../ui/Toast";
import type { ItemDef, ItemRarity } from "../content/types";

const BG_COLOR = 0x1a0f2e;
const TITLE_COLOR = "#e6c068";
const SUBTITLE_COLOR = "#9f7fc7";
const BODY_COLOR = "#d4b8e8";
const FONT = "'Exo 2', Arial, sans-serif";

const CARD_BG = 0x231436;
const CARD_BG_HOVER = 0x33224c;

const SECONDARY_BG = 0x2a1845;
const SECONDARY_BG_HOVER = 0x3a2358;
const SECONDARY_STROKE = 0x9f7fc7;
const SECONDARY_TEXT = "#b8a8d0";
const SECONDARY_TEXT_HOVER = "#e6c068";

const RARITY_COLORS: Record<ItemRarity, string> = {
  common: "#9f8a7a",
  rare: "#5b8fe6",
  epic: "#a070d8",
  legendary: "#e6c068",
};

const RARITY_BORDER: Record<ItemRarity, number> = {
  common: 0x9f8a7a,
  rare: 0x5b8fe6,
  epic: 0xa070d8,
  legendary: 0xe6c068,
};

const SLOT_LABELS: Record<ItemDef["slot"], string> = {
  weapon: "Оружие",
  armor: "Броня",
  accessory: "Аксессуар",
};

const PURCHASE_FAILURE_MESSAGES: Record<
  "not_enough_gold" | "backpack_full" | "unknown_item",
  string
> = {
  not_enough_gold: "Недостаточно золота",
  backpack_full: "Рюкзак переполнен",
  unknown_item: "Неизвестный предмет",
};

const CARD_WIDTH = 320;
const CARD_HEIGHT = 78;
const CARD_GAP = 10;

const BACK_BUTTON_WIDTH = 180;
const BACK_BUTTON_HEIGHT = 44;

/** Drag-threshold for scroll vs tap disambiguation. */
const SCROLL_DRAG_THRESHOLD = 6;

interface ShopSceneData {
  /**
   * Toast message to surface immediately after a successful purchase.
   * scene.restart() destroys the previous toast container before it can be
   * read (B13/FE-7), so the success message hops via init data and is
   * re-rendered on the fresh scene instance.
   */
  pendingSuccessToast?: string;
}

export class ShopScene extends Phaser.Scene {
  /**
   * Cached daily assortment. Lives on the instance so re-renders within the
   * scene (e.g. after a successful purchase via scene.restart) can rebind
   * to the same 6 offers without re-rolling. ShopSystem itself is also
   * deterministic per UTC day, so re-fetching would yield the same set —
   * the cache just avoids the seeded RNG round-trip.
   */
  private offersCache: ShopOffer[] = [];

  /**
   * Carry-over success toast from the previous scene instance. Set in
   * `init()` from `scene.restart` data, consumed in `create()` after Toast
   * scaffolding is ready, then cleared so a navigation that doesn't pass
   * data starts clean.
   */
  private pendingSuccessToast?: string;

  /** Scrollable container holding all offer cards. Drag-scroll in Y. */
  private cardsLayer?: Phaser.GameObjects.Container;
  private scrollY = 0;
  private scrollMinY = 0;

  constructor() {
    super("ShopScene");
  }

  init(data?: ShopSceneData): void {
    this.pendingSuccessToast = data?.pendingSuccessToast;
  }

  create(): void {
    const camW = this.cameras.main.width;
    const camH = this.cameras.main.height;
    const cx = camW / 2;
    const d = DPR;

    gameState.ensureLoaded();

    this.add.rectangle(0, 0, camW, camH, BG_COLOR).setOrigin(0);

    this.add
      .text(cx, 90 * d + SAFE_AREA.top * d, "🛒 Магазин", {
        fontSize: `${32 * d}px`,
        color: TITLE_COLOR,
        fontFamily: FONT,
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 4 * d,
      })
      .setOrigin(0.5);

    const gold = gameState.get().inventory.gold;
    this.add
      .text(cx, 130 * d + SAFE_AREA.top * d, `Золото: ${gold}`, {
        fontSize: `${16 * d}px`,
        color: TITLE_COLOR,
        fontFamily: FONT,
      })
      .setOrigin(0.5);

    if (this.offersCache.length === 0) {
      this.offersCache = shopSystem.getCurrentAssortment();
    }

    if (this.offersCache.length === 0) {
      this.add
        .text(cx, 200 * d + SAFE_AREA.top * d, "Магазин пуст. Зайди позже.", {
          fontSize: `${14 * d}px`,
          color: SUBTITLE_COLOR,
          fontFamily: FONT,
          fontStyle: "italic",
        })
        .setOrigin(0.5);
    } else {
      // Cards live inside a Container so we can drag-scroll the whole group
      // without moving the fixed title / gold counter / back button above.
      const cardsLayer = this.add.container(0, 0);
      this.cardsLayer = cardsLayer;

      const cardHpx = CARD_HEIGHT * d;
      const cardGapPx = CARD_GAP * d;
      const startY = 168 * d + SAFE_AREA.top * d;

      for (let i = 0; i < this.offersCache.length; i++) {
        const cy = startY + i * (cardHpx + cardGapPx) + cardHpx / 2;
        this.createOfferCard(cx, cy, this.offersCache[i], gold, cardsLayer);
      }

      // Compute scroll bounds — overflow between last card bottom and the
      // viewport bottom (above the back button) becomes the negative Y range.
      const viewportBottom = camH - 100 * d - SAFE_AREA.bottom * d;
      const contentBottom =
        startY + this.offersCache.length * (cardHpx + cardGapPx);
      const overflow = Math.max(0, contentBottom - viewportBottom);
      this.scrollMinY = -overflow;
      this.scrollY = Phaser.Math.Clamp(this.scrollY, this.scrollMinY, 0);
      cardsLayer.setY(this.scrollY);

      this.setupScroll();
    }

    const backY = camH - 70 * d - SAFE_AREA.bottom * d;
    this.createButton(
      cx,
      backY,
      BACK_BUTTON_WIDTH,
      BACK_BUTTON_HEIGHT,
      18,
      "← В Hub",
      SECONDARY_BG,
      SECONDARY_BG_HOVER,
      SECONDARY_STROKE,
      SECONDARY_TEXT,
      SECONDARY_TEXT_HOVER,
      2,
      () => sceneRouter.pop(this),
    );

    // B13/FE-7 fix: surface the carry-over success toast from a prior
    // scene.restart() AFTER the new scene has its own Toast scaffolding
    // attached. The previous instance's container was destroyed at scene
    // shutdown, so we re-render here on the fresh instance.
    if (this.pendingSuccessToast) {
      toast.show(this, {
        message: this.pendingSuccessToast,
        type: "info",
      });
      this.pendingSuccessToast = undefined;
    }
  }

  private createOfferCard(
    cx: number,
    cy: number,
    offer: ShopOffer,
    currentGold: number,
    layer: Phaser.GameObjects.Container,
  ): void {
    const d = DPR;
    const w = CARD_WIDTH * d;
    const h = CARD_HEIGHT * d;
    const canAfford = currentGold >= offer.price;
    const borderColor = RARITY_BORDER[offer.item.rarity];

    const bg = this.add
      .rectangle(cx, cy, w, h, CARD_BG, 0.95)
      .setStrokeStyle(2 * d, borderColor)
      .setInteractive({ useHandCursor: true });

    const nameText = this.add
      .text(cx - w / 2 + 14 * d, cy - 22 * d, offer.item.name, {
        fontSize: `${15 * d}px`,
        color: RARITY_COLORS[offer.item.rarity],
        fontFamily: FONT,
        fontStyle: "bold",
      })
      .setOrigin(0, 0.5);

    const statsText = this.add
      .text(cx - w / 2 + 14 * d, cy - 2 * d, this.buildStatsSummary(offer.item), {
        fontSize: `${11 * d}px`,
        color: BODY_COLOR,
        fontFamily: FONT,
      })
      .setOrigin(0, 0.5);

    const slotText = this.add
      .text(cx - w / 2 + 14 * d, cy + 18 * d, SLOT_LABELS[offer.item.slot], {
        fontSize: `${10 * d}px`,
        color: SUBTITLE_COLOR,
        fontFamily: FONT,
        fontStyle: "italic",
      })
      .setOrigin(0, 0.5);

    const priceColor = canAfford ? TITLE_COLOR : "#a85454";
    const priceText = this.add
      .text(cx + w / 2 - 14 * d, cy - 8 * d, `${offer.price}`, {
        fontSize: `${17 * d}px`,
        color: priceColor,
        fontFamily: FONT,
        fontStyle: "bold",
      })
      .setOrigin(1, 0.5);

    const priceLabel = this.add
      .text(cx + w / 2 - 14 * d, cy + 14 * d, "золота", {
        fontSize: `${10 * d}px`,
        color: priceColor,
        fontFamily: FONT,
      })
      .setOrigin(1, 0.5);

    bg.on("pointerover", () => bg.setFillStyle(CARD_BG_HOVER, 1));
    bg.on("pointerout", () => bg.setFillStyle(CARD_BG, 0.95));
    bg.on("pointerdown", () => {
      if (this.scrollDraggedThisGesture) return;
      this.handlePurchase(offer);
    });

    layer.add([bg, nameText, statsText, slotText, priceText, priceLabel]);
  }

  /**
   * True iff the current pointer gesture exceeded the drag threshold — used
   * to suppress card taps that actually were scroll attempts.
   */
  private scrollDraggedThisGesture = false;

  /**
   * Install scene-wide pointer handlers for drag-scroll of `cardsLayer`.
   * Uses a threshold to distinguish tap vs drag: small movements still let
   * card `pointerdown` handlers fire purchases normally.
   */
  private setupScroll(): void {
    let dragStartY = 0;
    let dragStartScrollY = 0;
    let dragging = false;

    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      dragStartY = p.y;
      dragStartScrollY = this.scrollY;
      dragging = false;
      this.scrollDraggedThisGesture = false;
    });

    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (!p.isDown || !this.cardsLayer) return;
      const delta = p.y - dragStartY;
      if (!dragging && Math.abs(delta) < SCROLL_DRAG_THRESHOLD) return;
      dragging = true;
      this.scrollDraggedThisGesture = true;
      const newY = Phaser.Math.Clamp(
        dragStartScrollY + delta,
        this.scrollMinY,
        0,
      );
      this.scrollY = newY;
      this.cardsLayer.setY(newY);
    });
  }

  /**
   * Compact stat summary for an item card. Joins non-zero baseStats with
   * Russian abbreviations. `crit` is shown last so the eye lands on big
   * legendary affordances.
   */
  private buildStatsSummary(item: ItemDef): string {
    const parts: string[] = [];
    const s = item.baseStats;
    if (s.hp) parts.push(`+${s.hp} HP`);
    if (s.mp) parts.push(`+${s.mp} MP`);
    if (s.physAttack) parts.push(`+${s.physAttack} физ`);
    if (s.magAttack) parts.push(`+${s.magAttack} маг`);
    if (s.crit) parts.push(`+${s.crit} крит`);
    return parts.join(", ");
  }

  private handlePurchase(offer: ShopOffer): void {
    const result = shopSystem.purchase(offer.item.id);
    if (result.ok) {
      // B13/FE-7: scene.restart() destroys the current scene's Toast
      // container before any tween can run, so calling toast.show() here
      // would render the success message for ~0ms. Instead, hop the message
      // through scene-restart data and re-render it in init/create on the
      // fresh instance, where the new Toast scaffolding is intact.
      this.scene.restart({
        pendingSuccessToast: `Куплено: ${offer.item.name}`,
      } satisfies ShopSceneData);
      return;
    }
    toast.show(this, {
      message: PURCHASE_FAILURE_MESSAGES[result.reason],
      type: result.reason === "backpack_full" ? "warn" : "error",
    });
  }

  /**
   * Shared button factory — mirrors ArenaScene to keep Phase 2A bundle lean.
   * Task #18 will extract this into `src/v2/ui/SceneChrome.ts` and delete
   * both inline copies.
   */
  private createButton(
    x: number,
    y: number,
    widthDp: number,
    heightDp: number,
    fontDp: number,
    label: string,
    bgColor: number,
    bgHover: number,
    strokeColor: number,
    textColor: string,
    textHover: string,
    strokeDp: number,
    onClick: () => void,
  ): void {
    const d = DPR;
    const bg = this.add
      .rectangle(x, y, widthDp * d, heightDp * d, bgColor, 0.95)
      .setStrokeStyle(strokeDp * d, strokeColor)
      .setInteractive({ useHandCursor: true });

    const text = this.add
      .text(x, y, label, {
        fontSize: `${fontDp * d}px`,
        color: textColor,
        fontFamily: FONT,
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    bg.on("pointerover", () => {
      bg.setFillStyle(bgHover, 1);
      text.setColor(textHover);
    });
    bg.on("pointerout", () => {
      bg.setFillStyle(bgColor, 0.95);
      text.setColor(textColor);
    });
    bg.on("pointerdown", onClick);
  }
}
