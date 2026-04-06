/**
 * Character registry — single source of truth for all CharacterDef instances
 * loaded into v2. Keyed by `CharacterDef.id`. Add new characters by importing
 * them here.
 */

import type { CharacterDef } from "../types";
import { lilana } from "./lilana";

export const CHARACTERS: Record<string, CharacterDef> = {
  lilana,
};
