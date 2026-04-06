/**
 * Dialogue registry — single source of truth for all DialogueGraph instances
 * loaded into v2. Keyed by `DialogueGraph.id`. Add new dialogues by importing
 * them here.
 */

import type { DialogueGraph } from "../types";
import { lilanaAct1 } from "./lilana-act1";
import { lilanaAct2 } from "./lilana-act2";
import { lilanaAct4 } from "./lilana-act4";

export const DIALOGUES: Record<string, DialogueGraph> = {
  "lilana-act1": lilanaAct1,
  "lilana-act2": lilanaAct2,
  "lilana-act4": lilanaAct4,
};
