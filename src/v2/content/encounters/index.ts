/**
 * Encounter registry — single source of truth for all EncounterDef instances
 * loaded into v2. Keyed by `EncounterDef.id`. Add new encounters by importing
 * them here.
 */

import type { EncounterDef } from "../types";
import { lilanaAct4Encounter } from "./lilana-act4";

export const ENCOUNTERS: Record<string, EncounterDef> = {
  "lilana-act4": lilanaAct4Encounter,
};
