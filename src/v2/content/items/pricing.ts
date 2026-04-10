/**
 * pricing — shop and sell price helpers for items.
 *
 * Shop prices match `PRICE_BY_RARITY` in `ShopSystem.ts`. Sell price is
 * floor(shop / 2). Pure data — zero runtime imports beyond types.
 */

import type { ItemRarity } from "../types";

export const SHOP_PRICE_BY_RARITY: Record<ItemRarity, number> = {
  common: 50,
  rare: 150,
  epic: 400,
  legendary: 1000,
};

export function getShopPrice(rarity: ItemRarity): number {
  return SHOP_PRICE_BY_RARITY[rarity];
}

export function getSellPrice(rarity: ItemRarity): number {
  return Math.floor(SHOP_PRICE_BY_RARITY[rarity] / 2);
}
