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

export class ShopScene extends Phaser.Scene {
  /**
   * Cached daily assortment. Lives on the instance so re-renders within the
   * scene (e.g. after a successful purchase via scene.restart) can rebind
   * to the same 6 offers without re-rolling. ShopSystem itself is also
   * deterministic per UTC day, so re-fetching would yield the same set —
   * the cache just avoids the seeded RNG round-trip.
   */
  private offersCache: ShopOffer[] = [];

  constructor() {
    super("ShopScene");
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
      const cardHpx = CARD_HEIGHT * d;
      const cardGapPx = CARD_GAP * d;
      const startY = 168 * d + SAFE_AREA.top * d;

      for (let i = 0; i < this.offersCache.length; i++) {
        const cy = startY + i * (cardHpx + cardGapPx) + cardHpx / 2;
        this.createOfferCard(cx, cy, this.offersCache[i], gold);
      }
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
  }

  private createOfferCard(
    cx: number,
    cy: number,
    offer: ShopOffer,
    currentGold: number,
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

    this.add
      .text(cx - w / 2 + 14 * d, cy - 22 * d, offer.item.name, {
        fontSize: `${15 * d}px`,
        color: RARITY_COLORS[offer.item.rarity],
        fontFamily: FONT,
        fontStyle: "bold",
      })
      .setOrigin(0, 0.5);

    this.add
      .text(cx - w / 2 + 14 * d, cy - 2 * d, this.buildStatsSummary(offer.item), {
        fontSize: `${11 * d}px`,
        color: BODY_COLOR,
        fontFamily: FONT,
      })
      .setOrigin(0, 0.5);

    this.add
      .text(cx - w / 2 + 14 * d, cy + 18 * d, SLOT_LABELS[offer.item.slot], {
        fontSize: `${10 * d}px`,
        color: SUBTITLE_COLOR,
        fontFamily: FONT,
        fontStyle: "italic",
      })
      .setOrigin(0, 0.5);

    const priceColor = canAfford ? TITLE_COLOR : "#a85454";
    this.add
      .text(cx + w / 2 - 14 * d, cy - 8 * d, `${offer.price}`, {
        fontSize: `${17 * d}px`,
        color: priceColor,
        fontFamily: FONT,
        fontStyle: "bold",
      })
      .setOrigin(1, 0.5);

    this.add
      .text(cx + w / 2 - 14 * d, cy + 14 * d, "золота", {
        fontSize: `${10 * d}px`,
        color: priceColor,
        fontFamily: FONT,
      })
      .setOrigin(1, 0.5);

    bg.on("pointerover", () => bg.setFillStyle(CARD_BG_HOVER, 1));
    bg.on("pointerout", () => bg.setFillStyle(CARD_BG, 0.95));
    bg.on("pointerdown", () => this.handlePurchase(offer));
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
      toast.show(this, {
        message: `Куплено: ${offer.item.name}`,
        type: "info",
      });
      // Restart to refresh the gold counter. ShopSystem caches assortment
      // by UTC day so the offer list stays stable across restarts.
      this.scene.restart();
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
