/**
 * Character registry — single source of truth for all CharacterDef instances
 * loaded into v2. Keyed by `CharacterDef.id`. Add new characters by importing
 * them here.
 *
 * Phase 2A: arena enemies are registered via `ARENA_ENEMIES` spread. They are
 * synthetic combat-only CharacterDefs (no story, no dialogue) and share the
 * same registry so `CombatBridgeScene` / `RelationshipSystem` lookups work
 * uniformly for story and arena encounters.
 */

import type { CharacterDef } from "../types";
import { lilana } from "./lilana";
import { ARENA_ENEMIES } from "./arena-enemies";

export const CHARACTERS: Record<string, CharacterDef> = {
  lilana,
  ...ARENA_ENEMIES,
};
