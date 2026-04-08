/**
 * Content validator — runtime check of all v2 content registries for dangling
 * references and authoring mistakes. Aggregates ALL errors and warnings into
 * one ValidationResult; never fail-fast. Pure function, zero Phaser deps.
 *
 * Per DECISIONS.md R5 (extended ValidationResult shape) and R11 (runtime, not
 * Vite plugin). Called from `registerV2Scenes` BEFORE the scene loop — on
 * `ok === false` the caller throws with the aggregated error list so authors
 * see the full picture instead of fixing one issue at a time.
 *
 * Errors block boot. Warnings only log via `console.warn` and do NOT affect
 * `ok` — they capture content smells (orphan nodes, duplicate choice ids)
 * that the engine can survive but authors should know about.
 *
 * RISK-8 hardening: every content/* import is `import type` so this module
 * stays a pure leaf — no runtime cycles back into the registries.
 *
 * Phase 2+ tech-debt: gate behind `import.meta.env.DEV` when content registry
 * exceeds ~50 dialogues so production tree-shakes the validator out.
 */

import { CHARACTERS } from "./characters";
import { DIALOGUES } from "./dialogues";
import { ENCOUNTERS } from "./encounters";
import { ITEMS } from "./items";
import { LOCATIONS } from "./locations";
import type {
  DialogueChoice,
  DialogueGraph,
  DialogueNode,
  EncounterDef,
  ItemDef,
  ItemSlot,
  LocationDef,
} from "./types";

/**
 * Result of `validateContent()`. `ok` is `false` IFF `errors.length > 0`;
 * `warnings` is informational only and never affects `ok`.
 */
export interface ValidationResult {
  ok: boolean;
  /** Authoring issues that block boot — caller throws on these. */
  errors: string[];
  /** Authoring smells — logged via console.warn, do NOT throw. */
  warnings: string[];
}

const VALID_ITEM_SLOTS: readonly ItemSlot[] = ["weapon", "armor", "accessory"];

/**
 * Validate every content registry. Aggregates all problems before returning;
 * never short-circuits. Safe to call multiple times — pure read.
 */
export function validateContent(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const graph of Object.values(DIALOGUES)) {
    validateDialogueGraph(graph, errors, warnings);
  }

  for (const encounter of Object.values(ENCOUNTERS)) {
    validateEncounter(encounter, errors);
  }

  for (const location of Object.values(LOCATIONS)) {
    validateLocation(location, errors);
  }

  for (const item of Object.values(ITEMS)) {
    validateItem(item, errors);
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

// ─── DialogueGraph ────────────────────────────────────────────────────────

function validateDialogueGraph(
  graph: DialogueGraph,
  errors: string[],
  warnings: string[],
): void {
  // ERROR: startNode must exist in graph.nodes (DECISIONS R5/B11).
  if (!graph.nodes[graph.startNode]) {
    errors.push(
      `DialogueGraph '${graph.id}': startNode '${graph.startNode}' not in graph.nodes`,
    );
  }

  // Track which nodes are referenced (for orphan detection). The startNode
  // is implicitly referenced — seed the set with it.
  const referenced = new Set<string>([graph.startNode]);

  for (const node of Object.values(graph.nodes)) {
    validateDialogueNode(graph, node, errors, warnings, referenced);
  }

  // WARNING: orphan nodes (defined but never referenced).
  for (const nodeId of Object.keys(graph.nodes)) {
    if (!referenced.has(nodeId)) {
      warnings.push(
        `DialogueGraph '${graph.id}': orphaned node '${nodeId}' (not referenced by any other node)`,
      );
    }
  }
}

function validateDialogueNode(
  graph: DialogueGraph,
  node: DialogueNode,
  errors: string[],
  warnings: string[],
  referenced: Set<string>,
): void {
  switch (node.type) {
    case "line": {
      if (node.next !== undefined) {
        if (!graph.nodes[node.next]) {
          errors.push(
            `DialogueGraph '${graph.id}': node '${node.id}' next references missing node '${node.next}'`,
          );
        } else {
          referenced.add(node.next);
        }
      }
      return;
    }
    case "choice": {
      validateChoiceNode(graph, node.id, node.choices, errors, warnings, referenced);
      return;
    }
    case "battle": {
      if (!graph.nodes[node.onVictory]) {
        errors.push(
          `DialogueGraph '${graph.id}': battle node '${node.id}' onVictory references missing node '${node.onVictory}'`,
        );
      } else {
        referenced.add(node.onVictory);
      }
      if (!graph.nodes[node.onDefeat]) {
        errors.push(
          `DialogueGraph '${graph.id}': battle node '${node.id}' onDefeat references missing node '${node.onDefeat}'`,
        );
      } else {
        referenced.add(node.onDefeat);
      }
      if (!ENCOUNTERS[node.encounterId]) {
        errors.push(
          `DialogueGraph '${graph.id}': battle node '${node.id}' encounterId '${node.encounterId}' not in ENCOUNTERS registry`,
        );
      }
      return;
    }
    case "end":
      // No outgoing references — `end` terminates the graph.
      return;
  }
}

function validateChoiceNode(
  graph: DialogueGraph,
  nodeId: string,
  choices: DialogueChoice[],
  errors: string[],
  warnings: string[],
  referenced: Set<string>,
): void {
  const seenChoiceIds = new Set<string>();
  for (const choice of choices) {
    // WARNING: duplicate choice ids within one node — first wins per
    // REFINEMENT 5, but flag the smell.
    if (seenChoiceIds.has(choice.id)) {
      warnings.push(
        `DialogueGraph '${graph.id}': duplicate choice id '${choice.id}' on node '${nodeId}' — first occurrence wins`,
      );
    } else {
      seenChoiceIds.add(choice.id);
    }

    // ERROR: choice.next must exist.
    if (!graph.nodes[choice.next]) {
      errors.push(
        `DialogueGraph '${graph.id}': choice '${choice.id}' on node '${nodeId}' references missing node '${choice.next}'`,
      );
    } else {
      referenced.add(choice.next);
    }
  }
}

// ─── EncounterDef ─────────────────────────────────────────────────────────

function validateEncounter(encounter: EncounterDef, errors: string[]): void {
  if (!CHARACTERS[encounter.characterId]) {
    errors.push(
      `EncounterDef '${encounter.id}': characterId '${encounter.characterId}' not in CHARACTERS registry`,
    );
  }
  if (encounter.rewards.loot) {
    for (const drop of encounter.rewards.loot) {
      if (!ITEMS[drop.itemDefId]) {
        errors.push(
          `EncounterDef '${encounter.id}': loot itemDefId '${drop.itemDefId}' not in ITEMS registry`,
        );
      }
    }
  }
}

// ─── LocationDef ──────────────────────────────────────────────────────────

function validateLocation(location: LocationDef, errors: string[]): void {
  for (const hotspot of location.hotspots) {
    for (const option of hotspot.dialogues) {
      if (!DIALOGUES[option.dialogueId]) {
        errors.push(
          `LocationDef '${location.id}': hotspot '${hotspot.id}' dialogue id '${option.dialogueId}' not in DIALOGUES registry`,
        );
      }
    }
  }
}

// ─── ItemDef ──────────────────────────────────────────────────────────────

function validateItem(item: ItemDef, errors: string[]): void {
  if (!VALID_ITEM_SLOTS.includes(item.slot)) {
    errors.push(
      `ItemDef '${item.id}': invalid slot '${item.slot}' (expected weapon|armor|accessory)`,
    );
  }
}
