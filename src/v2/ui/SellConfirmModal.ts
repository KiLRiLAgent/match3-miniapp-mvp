/**
 * SellConfirmModal — blocking confirmation modal for selling an item.
 *
 * Singleton pattern mirrors ItemCardModal. Uses modalChrome.ts for backdrop,
 * panel, and close button. Depth 2100 (blocking modal layer).
 *
 * v2-isolation: imports from phaser, ../../game/config (DPR), ./modalChrome,
 * ./theme, ./itemFormat, ../content/types (type-only).
 */

import Phaser from "phaser";
import { DPR } from "../../game/config";
import {
  createModalBackdrop,
  createModalPanel,
  createModalCloseButton,
} from "./modalChrome";
import { V2_COLORS, V2_FONTS } from "./theme";
import { RARITY_COLOR_BY_TIER } from "./itemFormat";
import type { ItemDef } from "../content/types";

const MODAL_DEPTH = 2100;
const PANEL_WIDTH_DP = 300;
const PADDING_Y = 20;
const BUTTON_GAP = 12;
const BUTTON_WIDTH_DP = 120;
const BUTTON_HEIGHT_DP = 40;

export interface SellConfirmOptions {
  item: ItemDef;
  sellPrice: number;
  onConfirm: () => void;
  onCancel?: () => void;
}

export class SellConfirmModal {
  private layer?: Phaser.GameObjects.Container;
  private onCancelCb?: () => void;

  open(scene: Phaser.Scene, opts: SellConfirmOptions): void {
    if (this.isOpen()) this.close();

    this.onCancelCb = opts.onCancel;

    const d = DPR;
    const camW = scene.cameras.main.width;
    const camH = scene.cameras.main.height;
    const cx = camW / 2;
    const cy = camH / 2;

    const layer = scene.add.container(0, 0);
    layer.setDepth(MODAL_DEPTH);

    const backdrop = createModalBackdrop(scene, () => this.close());
    layer.add(backdrop);

    // Measure content height to size the panel.
    const panelWidth = PANEL_WIDTH_DP * d;
    const innerWidth = panelWidth - 40 * d;

    // Title.
    const titleText = scene.add
      .text(cx, 0, "Продать предмет?", {
        fontSize: `${18 * d}px`,
        color: V2_COLORS.titleColor,
        fontFamily: V2_FONTS.primary,
        fontStyle: "bold",
      })
      .setOrigin(0.5, 0);

    // Item name in rarity color.
    const nameText = scene.add
      .text(cx, 0, opts.item.name, {
        fontSize: `${16 * d}px`,
        color: RARITY_COLOR_BY_TIER[opts.item.rarity],
        fontFamily: V2_FONTS.primary,
        fontStyle: "bold",
        wordWrap: { width: innerWidth },
        align: "center",
      })
      .setOrigin(0.5, 0);

    // Sell price.
    const priceText = scene.add
      .text(cx, 0, `+${opts.sellPrice} золота`, {
        fontSize: `${16 * d}px`,
        color: V2_COLORS.bonusColor,
        fontFamily: V2_FONTS.primary,
        fontStyle: "bold",
      })
      .setOrigin(0.5, 0);

    // Compute panel height.
    const contentHeight =
      PADDING_Y * d +
      titleText.height +
      12 * d +
      nameText.height +
      10 * d +
      priceText.height +
      18 * d +
      BUTTON_HEIGHT_DP * d +
      PADDING_Y * d;

    const panelHeight = contentHeight;

    // Panel.
    const panel = createModalPanel(scene, cx, cy, {
      width: panelWidth,
      height: panelHeight,
    });
    layer.add(panel);

    // Position content elements.
    let y = cy - panelHeight / 2 + PADDING_Y * d;

    titleText.setY(y);
    layer.add(titleText);
    y += titleText.height + 12 * d;

    nameText.setY(y);
    layer.add(nameText);
    y += nameText.height + 10 * d;

    priceText.setY(y);
    layer.add(priceText);
    y += priceText.height + 18 * d;

    // Buttons row.
    const buttonY = y + (BUTTON_HEIGHT_DP * d) / 2;
    const halfGap = (BUTTON_GAP * d) / 2;

    // "Продать" button (left).
    const sellBtn = createModalCloseButton(
      scene,
      cx - BUTTON_WIDTH_DP * d / 2 - halfGap,
      buttonY,
      () => {
        const confirmCb = opts.onConfirm;
        this.close();
        confirmCb();
      },
      { label: "Продать", widthDp: BUTTON_WIDTH_DP, heightDp: BUTTON_HEIGHT_DP },
    );
    layer.add(sellBtn.bg);
    layer.add(sellBtn.text);

    // "Отмена" button (right).
    const cancelBtn = createModalCloseButton(
      scene,
      cx + BUTTON_WIDTH_DP * d / 2 + halfGap,
      buttonY,
      () => this.close(),
      { label: "Отмена", widthDp: BUTTON_WIDTH_DP, heightDp: BUTTON_HEIGHT_DP },
    );
    layer.add(cancelBtn.bg);
    layer.add(cancelBtn.text);

    this.layer = layer;

    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.close();
    });
  }

  close(): void {
    if (!this.isOpen()) return;
    const cb = this.onCancelCb;
    try {
      this.layer?.destroy(true);
    } catch {
      /* layer already dead */
    }
    this.layer = undefined;
    this.onCancelCb = undefined;
    try {
      cb?.();
    } catch (e) {
      console.warn("[SellConfirmModal] onCancel callback threw", e);
    }
  }

  isOpen(): boolean {
    if (!this.layer) return false;
    if (!this.layer.scene || !this.layer.active) {
      this.layer = undefined;
      this.onCancelCb = undefined;
      return false;
    }
    return true;
  }
}

export const sellConfirmModal = new SellConfirmModal();
