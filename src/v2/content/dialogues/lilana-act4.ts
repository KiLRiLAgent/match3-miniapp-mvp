/**
 * Lilana — Act 4 — «Кульминация».
 *
 * Setting: Atrium ночью. Лилана наедине с собой; печать на ключице горит
 * сквозь воротник. Память о приговоре наконец прорывается, и Серафим
 * Гордыни просыпается. Игрок присутствует не как ученик, а как свидетель.
 *
 * Узкое горлышко — choice перед `battle` нодом. Две опции: обнять её
 * уязвимость (+8 emp) или приказать ей бороться (+8 dom). После боя:
 * onVictory → короткая эпилог-реплика → end (флаг lilana:act4:done).
 * onDefeat → горькая реплика → end (тоже флаг lilana:act4:done — провал
 * тоже считается завершением арки в этом slice).
 */

import type { DialogueGraph } from "../types";

export const lilanaAct4: DialogueGraph = {
  id: "lilana-act4",
  characterId: "lilana",
  startNode: "intro",
  nodes: {
    intro: {
      type: "line",
      id: "intro",
      lines: [
        {
          speaker: "narrator",
          text: "Атриум. Ночь. Лунный свет ломается о треснувшие витражи и падает на пол семиугольной звездой. Лилана стоит в её центре — без очков, без косы, с распущенными серебряными волосами. На её ключице сквозь ткань пробивается золотое свечение.",
        },
        {
          speaker: "lilana",
          emotion: "sad",
          text: "Ты не должен был это видеть, {{playerName}}. Никто не должен был. Я держала это... тысячу лет. И всё это время — ни одной трещины. Ни одной.",
          highlights: [{ word: "тысячу", color: "#f1c40f" }],
        },
      ],
      next: "approach_choice",
    },
    approach_choice: {
      type: "choice",
      id: "approach_choice",
      prompt: "Лилана не оборачивается. Звезда света на полу пульсирует в такт её дыханию.",
      choices: [
        {
          id: "approach_close",
          text: "Молча подойти ближе. Не сказать ни слова.",
          delta: { empathy: 4 },
          next: "confession",
        },
        {
          id: "approach_steady",
          text: "Остаться на месте: «Я здесь. И никуда не уйду.»",
          delta: { empathy: 2, dominance: 2 },
          next: "confession",
        },
      ],
    },
    confession: {
      type: "line",
      id: "confession",
      lines: [
        {
          speaker: "lilana",
          emotion: "sad",
          text: "Я сказала... ты не понимаешь. Я никогда не сомневалась. Ни разу. И вот результат — тысяча лет в этом теле, и я всё ещё... всё ещё та, что вынесла приговор. Та, что отказалась слушать.",
          highlights: [
            { word: "никогда не сомневалась", color: "#9b59b6" },
            { word: "приговор", color: "#e74c3c" },
          ],
        },
        {
          speaker: "lilana",
          emotion: "angry",
          text: "А теперь оно... оно поднимается. Я чувствую крылья. Шесть. Они помнят свою форму лучше, чем я — свою. И если они выйдут наружу прямо сейчас, я не уверена, что смогу остановить их... до того, как они доберутся до тебя.",
          highlights: [{ word: "Шесть", color: "#f1c40f" }],
        },
      ],
      next: "choice",
    },
    choice: {
      type: "choice",
      id: "choice",
      prompt: "Лилана сжимает кулаки. Золото проступает уже сквозь её рукава.",
      choices: [
        {
          id: "embrace",
          text: "Шагнуть к ней: «Тогда дай им выйти. Я не сбегу. Я хочу видеть тебя такой, какая ты есть.»",
          delta: { empathy: 8 },
          next: "embrace_response",
        },
        {
          id: "command",
          text: "Жёстко: «Тогда борись с ними. Я не позволю тебе спрятаться обратно за щитом — ни сейчас, ни потом.»",
          delta: { dominance: 8 },
          next: "command_response",
        },
      ],
    },
    embrace_response: {
      type: "line",
      id: "embrace_response",
      lines: [
        {
          speaker: "lilana",
          emotion: "surprised",
          text: "...Какой ты странный. Никто никогда не говорил мне «дай им выйти». Меня всегда просили сдерживаться. Соблюдать форму. Быть... приемлемой.",
          highlights: [{ word: "приемлемой", color: "#9b59b6" }],
        },
        {
          speaker: "lilana",
          emotion: "sad",
          text: "Тогда смотри. И если ты выживешь — может быть, мы оба узнаем, кто я на самом деле.",
        },
      ],
      next: "battle",
    },
    command_response: {
      type: "line",
      id: "command_response",
      lines: [
        {
          speaker: "lilana",
          emotion: "angry",
          text: "Бороться. Какая старая команда. Я слышала её ещё до того, как услышала своё имя. Si vis pacem, para bellum — ты, кажется, понимаешь это лучше, чем хочешь признать.",
          highlights: [{ word: "Si vis pacem, para bellum", color: "#f1c40f" }],
        },
        {
          speaker: "lilana",
          emotion: "cold",
          text: "Хорошо. Тогда стой и не уходи. И если ты переживёшь это — у тебя будет право требовать ответа. Но не раньше.",
        },
      ],
      next: "battle",
    },
    battle: {
      type: "battle",
      id: "battle",
      encounterId: "lilana-act4",
      onVictory: "epilogue_victory",
      onDefeat: "epilogue_defeat",
    },
    epilogue_victory: {
      type: "line",
      id: "epilogue_victory",
      lines: [
        {
          speaker: "lilana",
          emotion: "sad",
          text: "Ты разорвал мои цепи... я могу сомневаться. Впервые за тысячу лет — я могу. И это страшнее всего, что я знала.",
          highlights: [
            { word: "сомневаться", color: "#9b59b6" },
            { word: "впервые", color: "#f1c40f" },
          ],
        },
      ],
      next: "end",
    },
    epilogue_defeat: {
      type: "line",
      id: "epilogue_defeat",
      lines: [
        {
          speaker: "lilana",
          emotion: "cold",
          text: "Ты не готов. Уходи, пока я ещё помню, что когда-то была милосердна. И не возвращайся, пока не научишься выдерживать чужой огонь.",
        },
      ],
      next: "end",
    },
    end: {
      type: "end",
      id: "end",
      effects: [{ type: "setFlag", key: "lilana:act4:done", value: true }],
    },
  },
};
