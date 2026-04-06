/**
 * Lilana — Act 1 — «Холодная встреча».
 *
 * Setting: Atrium, утро первого дня. Лилана отчитывает игрока за опоздание
 * на лекцию. Три варианта ответа: empathy / dominance / cynicism. Каждая
 * ветка получает 1 ответную реплику Лиланы и сходится в общий end-нод.
 *
 * Voice notes: формальная, книжная, латинизмы; ловит игрока на мелочах.
 * См. brief → «Сюжет Лиланы → Act 1».
 */

import type { DialogueGraph } from "../types";

export const lilanaAct1: DialogueGraph = {
  id: "lilana-act1",
  characterId: "lilana",
  startNode: "intro",
  nodes: {
    intro: {
      type: "line",
      id: "intro",
      lines: [
        {
          speaker: "narrator",
          text: "Главный Атриум. Утро первого дня. Гулкое эхо шагов отражается от треснувших колонн, и в этой тишине каждое запоздалое движение звучит как преступление.",
        },
        {
          speaker: "lilana",
          emotion: "cold",
          text: "Опоздание. На пятой минуте лекции. В первый день, {{playerName}}. Скажи мне, ты вообще понимаешь, куда тебя занесла эта... любопытная случайность?",
          highlights: [
            { word: "Опоздание", color: "#9b59b6" },
            { word: "пятой", color: "#9b59b6" },
          ],
        },
        {
          speaker: "lilana",
          emotion: "cold",
          text: "Я — Лилана Воронова, староста потока. Не «местная», не «та девушка с первого ряда». Староста. Это значит, что я отвечаю за порядок на этой кафедре, и это значит, что у тебя есть ровно один шанс объяснить, почему я должна терпеть твоё присутствие в моей аудитории.",
          highlights: [
            { word: "староста", color: "#9b59b6" },
            { word: "один", color: "#e74c3c" },
          ],
        },
      ],
      next: "choice",
    },
    choice: {
      type: "choice",
      id: "choice",
      prompt: "Лилана ждёт ответа. Её взгляд режет, как страница, обрезающая палец.",
      choices: [
        {
          id: "empathy",
          text: "Искренне извиниться: «Прошу прощения. Я виноват, я не должен был заставлять вас ждать.»",
          delta: { empathy: 5, cynicism: -2 },
          next: "branch_empathy",
        },
        {
          id: "dominance",
          text: "Огрызнуться: «Пять минут. Не неделя. Прекрати делать из этого спектакль.»",
          delta: { empathy: -3, dominance: 6 },
          next: "branch_dominance",
        },
        {
          id: "cynicism",
          text: "Отмахнуться: «Слушай, у меня тут не курсы по этикету. Мы будем диктант писать или нравоучения?»",
          delta: { empathy: -5, cynicism: 5 },
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
          emotion: "surprised",
          text: "...Извинение. Произнесённое без оговорок и без той маленькой иронической паузы, которая обычно превращает сожаление в насмешку. Любопытно. Я... запомнила.",
          highlights: [
            { word: "Извинение", color: "#9b59b6" },
            { word: "запомнила", color: "#9b59b6" },
          ],
        },
        {
          speaker: "lilana",
          emotion: "cold",
          text: "Сядь. И не повторяй эту ошибку. Disciplina — мать всех добродетелей; без неё даже талант становится распущенностью.",
          highlights: [{ word: "Disciplina", color: "#f1c40f" }],
        },
      ],
      next: "parting_question",
    },
    branch_dominance: {
      type: "line",
      id: "branch_dominance",
      lines: [
        {
          speaker: "lilana",
          emotion: "angry",
          text: "Спектакль. Любопытный выбор слова для того, кто только что вошёл в чужой храм с грязью на подошвах. Знаешь, в чём твоя проблема, {{playerName}}? Ты путаешь дерзость с характером.",
          highlights: [{ word: "дерзость", color: "#e74c3c" }],
        },
        {
          speaker: "lilana",
          emotion: "cold",
          text: "Сядь. Я запомню эту маленькую сцену. Поверь — у меня хорошая память на такие вещи.",
        },
      ],
      next: "parting_question",
    },
    branch_cynicism: {
      type: "line",
      id: "branch_cynicism",
      lines: [
        {
          speaker: "lilana",
          emotion: "cold",
          text: "Ah. Профанация. Самый дешёвый способ казаться выше ситуации, в которой ты, по сути, проиграл ещё до того, как открыл рот. Знаешь, что говорил Бах о тех, кто играет фальшиво и громко? «Они слышат только себя, и это — единственная мелодия, которой они достойны.»",
          highlights: [
            { word: "Профанация", color: "#9b59b6" },
            { word: "Бах", color: "#f1c40f" },
          ],
        },
        {
          speaker: "lilana",
          emotion: "cold",
          text: "Сядь. Мы оба знаем, что ты сел бы и без моего разрешения. Но мне приятно произнести это вслух.",
        },
      ],
      next: "parting_question",
    },
    parting_question: {
      type: "choice",
      id: "parting_question",
      prompt: "Лилана уже отвернулась к доске, но останавливается и, не оборачиваясь, добавляет вопрос — словно нехотя.",
      choices: [
        {
          id: "parting_serious",
          text: "Серьёзно: «Хочу попробовать. По-настоящему. Без условий.»",
          delta: { empathy: 3, cynicism: -1 },
          next: "parting_response_serious",
        },
        {
          id: "parting_cool",
          text: "Холодно: «Посмотрим, что у вас тут за порядок. И стоит ли он того.»",
          delta: { dominance: 3, empathy: -1 },
          next: "parting_response_cool",
        },
      ],
    },
    parting_response_serious: {
      type: "line",
      id: "parting_response_serious",
      lines: [
        {
          speaker: "lilana",
          emotion: "neutral",
          text: "«По-настоящему». Самое опасное обещание, какое можно дать. Что ж — посмотрим, выдержит ли оно встречу с реальностью. Я буду наблюдать.",
          highlights: [{ word: "наблюдать", color: "#9b59b6" }],
        },
      ],
      next: "end",
    },
    parting_response_cool: {
      type: "line",
      id: "parting_response_cool",
      lines: [
        {
          speaker: "lilana",
          emotion: "cold",
          text: "Стоит ли он того. Хороший вопрос, {{playerName}}. Я задаю его себе каждый день — и до сих пор не нашла ответа, который бы меня устроил. Поделишься, если найдёшь.",
        },
      ],
      next: "end",
    },
    end: {
      type: "end",
      id: "end",
      effects: [{ type: "setFlag", key: "lilana:act1:done", value: true }],
    },
  },
};
