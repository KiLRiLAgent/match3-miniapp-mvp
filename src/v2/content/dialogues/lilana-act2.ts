/**
 * Lilana — Act 2 — «Трещина».
 *
 * Setting: Atrium, дневной свет через витражи. Игрок повторно встречает
 * Лилану и видит, как она роняет старый дневник в кожаном переплёте — и на
 * долю секунды на её лице мелькает паника. Три варианта реакции: empathy
 * (предложить поднять / выслушать), dominance (надавить, потребовать
 * объяснений), cynicism (отшутиться). Каждая ветка приоткрывает чуть-чуть
 * больше её прошлого, не нарушая forbiddenTopics.
 *
 * Voice notes: больше пауз и многоточий, чем в Act 1; короткие фразы там,
 * где её щит даёт трещину. См. brief.
 */

import type { DialogueGraph } from "../types";

export const lilanaAct2: DialogueGraph = {
  id: "lilana-act2",
  characterId: "lilana",
  startNode: "intro",
  nodes: {
    intro: {
      type: "line",
      id: "intro",
      lines: [
        {
          speaker: "narrator",
          text: "Атриум днём. Сквозь разбитые витражи просачивается пыльный свет, и в этом свете Лилана выглядит почти живой — пока из её сумки не выскальзывает потрёпанный дневник в чёрной коже и не падает к ногам игрока.",
        },
        {
          speaker: "lilana",
          emotion: "surprised",
          text: "Не трогай.",
          highlights: [{ word: "Не трогай", color: "#e74c3c" }],
        },
        {
          speaker: "lilana",
          emotion: "cold",
          text: "...Прости. Я была резка. Эта вещь — частная. Старая. Принадлежала... одной знакомой. Очень давней.",
          highlights: [{ word: "знакомой", color: "#9b59b6" }],
        },
        {
          speaker: "lilana",
          emotion: "sad",
          text: "Иногда я ловлю себя на мысли, что мы носим вещи мёртвых людей дольше, чем самих этих людей помним. Это... удручающая арифметика.",
          highlights: [{ word: "арифметика", color: "#9b59b6" }],
        },
      ],
      next: "choice",
    },
    choice: {
      type: "choice",
      id: "choice",
      prompt: "Лилана нагнулась за дневником. Её рука едва заметно дрожит — впервые с тех пор, как ты её увидел.",
      choices: [
        {
          id: "empathy",
          text: "Тихо: «Если хочешь, я выслушаю. Без вопросов и без советов.»",
          delta: { empathy: 6, cynicism: -2 },
          next: "branch_empathy",
        },
        {
          id: "dominance",
          text: "Прямо: «Кто она была? И почему ты до сих пор таскаешь её записи с собой?»",
          delta: { empathy: -2, dominance: 6 },
          next: "branch_dominance",
        },
        {
          id: "cynicism",
          text: "Сухо: «Знаешь, староста, для девушки без эмоций ты подозрительно крепко держишься за реликвии.»",
          delta: { empathy: -4, cynicism: 5 },
          next: "branch_cynicism",
        },
      ],
    },
    branch_empathy: {
      type: "line",
      id: "branch_empathy",
      lines: [
        {
          speaker: "lilana",
          emotion: "sad",
          text: "Без советов. Это... необычно. Большинство людей слушают только для того, чтобы потом ответить — у них уже готов вердикт ещё до того, как ты закончил предложение.",
          highlights: [{ word: "вердикт", color: "#9b59b6" }],
        },
        {
          speaker: "lilana",
          emotion: "sad",
          text: "Она была судьёй. В своём роде. И однажды она вынесла приговор, который не имела права выносить — но не позволила себе усомниться. Я... я думаю об этом каждый день. Не спрашивай большего. Пока.",
          highlights: [
            { word: "судьёй", color: "#f1c40f" },
            { word: "приговор", color: "#e74c3c" },
          ],
        },
      ],
      next: "second_choice",
    },
    branch_dominance: {
      type: "line",
      id: "branch_dominance",
      lines: [
        {
          speaker: "lilana",
          emotion: "angry",
          text: "Кто она была. Какой прямолинейный вопрос. Ab initio честный, я отдам тебе должное — но честность и тактичность редко делят одну скамью.",
          highlights: [{ word: "Ab initio", color: "#f1c40f" }],
        },
        {
          speaker: "lilana",
          emotion: "cold",
          text: "Она была кем-то, кто считал, что её правота — это абсолют. Кем-то, кто за это поплатился. И да — я ношу её записи. Чтобы помнить, чем платят за непогрешимость.",
          highlights: [{ word: "непогрешимость", color: "#9b59b6" }],
        },
      ],
      next: "second_choice",
    },
    branch_cynicism: {
      type: "line",
      id: "branch_cynicism",
      lines: [
        {
          speaker: "lilana",
          emotion: "angry",
          text: "Реликвии. Какое грубое слово для того, что ты не понимаешь. Mea culpa — я надеялась, что ты окажешься хотя бы наблюдательным, раз уж не сумел оказаться вежливым.",
          highlights: [{ word: "Mea culpa", color: "#f1c40f" }],
        },
        {
          speaker: "lilana",
          emotion: "cold",
          text: "Иди. У меня сегодня нет сил на твою иронию. Скажу одно: некоторые вещи мы носим не потому, что любим, а потому, что не имеем права забыть. Подумай об этом, если умеешь.",
        },
      ],
      next: "second_choice",
    },
    second_choice: {
      type: "choice",
      id: "second_choice",
      prompt: "Лилана прижимает дневник к груди. На мгновение её взгляд становится почти просящим — а потом снова закрывается.",
      choices: [
        {
          id: "promise_silence",
          text: "Тихо: «Я никому не скажу о том, что видел. Это твоё.»",
          delta: { empathy: 4, cynicism: -2 },
          next: "second_response_silence",
        },
        {
          id: "demand_meet",
          text: "Прямо: «Я приду снова. И в следующий раз ты расскажешь больше — или я перестану спрашивать.»",
          delta: { dominance: 4, empathy: -1 },
          next: "second_response_meet",
        },
      ],
    },
    second_response_silence: {
      type: "line",
      id: "second_response_silence",
      lines: [
        {
          speaker: "lilana",
          emotion: "surprised",
          text: "...Молчание. Самый редкий из подарков. Большинство людей не понимают, что молчание — это тоже выбор, и что оно стоит дороже большинства слов.",
          highlights: [{ word: "Молчание", color: "#9b59b6" }],
        },
        {
          speaker: "lilana",
          emotion: "sad",
          text: "Спасибо. Я не говорю это часто. Запомни это — потому что не услышишь снова в ближайшее время.",
        },
      ],
      next: "end",
    },
    second_response_meet: {
      type: "line",
      id: "second_response_meet",
      lines: [
        {
          speaker: "lilana",
          emotion: "cold",
          text: "Ультиматум. Произнесённый ровно, без нажима, без театра — это даже изящно. Хорошо. Приходи. Я не обещаю ответов, но и не обещаю, что буду молчать вечно.",
          highlights: [{ word: "Ультиматум", color: "#9b59b6" }],
        },
      ],
      next: "end",
    },
    end: {
      type: "end",
      id: "end",
      effects: [{ type: "setFlag", key: "lilana:act2:done", value: true }],
    },
  },
};
