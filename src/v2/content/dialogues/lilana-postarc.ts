/**
 * Lilana — Post-Arc — «После бури».
 *
 * Setting: Atrium, после завершения Act 4. Лилана стоит у колонны и
 * впервые встречает игрока без напряжения — но и без открытости.
 * Короткая реплика, обозначающая, что арка завершена и новый контент
 * будет доступен в Phase 2.
 *
 * Структура: line → end. Без выборов, без боя.
 */

import type { DialogueGraph } from "../types";

export const lilanaPostarc: DialogueGraph = {
  id: "lilana-postarc",
  characterId: "lilana",
  startNode: "greeting",
  nodes: {
    greeting: {
      type: "line",
      id: "greeting",
      lines: [
        {
          speaker: "lilana",
          emotion: "neutral",
          text: "Ты снова здесь, {{playerName}}. Я... не ожидала, что скажу это, но мне почти приятно. Почти. Не привыкай.",
          highlights: [{ word: "Почти", color: "#9b59b6" }],
        },
        {
          speaker: "lilana",
          emotion: "sad",
          text: "Мне нужно время. Цепи разорваны, но следы от них не исчезают за одну ночь. Приходи позже — возможно, к тому времени я найду слова, которых сейчас у меня нет.",
          highlights: [{ word: "Цепи", color: "#f1c40f" }],
        },
      ],
      next: "end",
    },
    end: {
      type: "end",
      id: "end",
    },
  },
};
