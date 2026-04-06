/**
 * Atrium — главная (и единственная для Phase 1A) локация Университета Падших.
 *
 * Phase 1A LocationScene рендерит её как сплошной тёмно-фиолетовый
 * прямоугольник (#2a1f4e) с лейблом — реальный фон подставляется в
 * Phase 1B без изменения content data.
 *
 * Hotspot Лиланы использует декларативный массив `dialogues` с приоритетами
 * (REFINEMENT 4): LocationScene фильтрует по `condition`, сортирует по
 * `priority` desc и берёт первый матч. Это даёт цепочку:
 *   `lilana:act2:done` → Act 4 (priority 4)
 *   `lilana:act1:done` → Act 2 (priority 2)
 *   default            → Act 1 (priority 1)
 */

import type { LocationDef } from "../types";

export const atrium: LocationDef = {
  id: "atrium",
  name: "Атриум",
  description:
    "Тёмно-фиолетовый зал с гаргульями и витражами. Высокие колонны с трещинами, разбитые витражи, выцветшая пастельная палитра. Эхо шагов гуляет здесь так, словно само пространство прислушивается.",
  backgroundKey: "location_atrium",
  unlockedByDefault: true,
  hotspots: [
    {
      id: "lilana-hotspot",
      label: "Лилана",
      characterId: "lilana",
      position: { x: 0.35, y: 0.55 },
      dialogues: [
        {
          dialogueId: "lilana-act4",
          condition: { flag: "lilana:act2:done", flagEquals: true },
          priority: 4,
        },
        {
          dialogueId: "lilana-act2",
          condition: { flag: "lilana:act1:done", flagEquals: true },
          priority: 2,
        },
        {
          dialogueId: "lilana-act1",
          priority: 1,
        },
      ],
    },
  ],
};
