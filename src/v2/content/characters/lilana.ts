/**
 * Lilana — "Седьмой Грех" Воронова — Серафим Гордыни.
 *
 * Vertical slice character for v2 Phase 1A. Static profile only — runtime
 * relationship state lives in `SaveData.relationships["lilana"]` and is
 * mutated exclusively through `RelationshipSystem.applyDelta`.
 *
 * Voice and arc reference: `.briefs/v2-phase-1a-lilana-vertical-slice.md`
 * (Дополнительный контекст → Сюжет Лиланы).
 */

import type { CharacterDef } from "../types";

export const lilana: CharacterDef = {
  id: "lilana",
  name: "Лилана",
  age: 21,
  pronouns: "she",
  faction: "fallen-angel",
  archetype: "ice-queen-with-crack",
  shortDescription:
    "Староста потока, перфекционистка, тайный Серафим Гордыни, осудившая невинную душу.",
  backstory: `Лилана Воронова — высокая, бледная, с серебристыми волосами, заплетёнными в строгую косу. Она староста первого курса в Университете Падших и единственная, кто соблюдает дисциплину как религиозный обет. На её лице — очки в тонкой металлической оправе, которые она снимает только наедине с собой.

В прошлой жизни она была одним из высших ангелов суда — Серафимом Гордыни. Шесть огненных крыльев, золотая броня, лицо за маской из расплавленного света. Её вина — приговор невинной душе, который она отказалась пересмотреть, когда сомнение постучалось в её сердце. Она выбрала собственную безупречность вместо истины. Бог изгнал её "в тело смертной, чтобы научилась сомневаться".

На ключице у Лиланы татуировка-печать в форме семиугольной звезды — символ её ангельского ранга. Она прячет её под высокими воротниками. Она помнит достаточно, чтобы ненавидеть себя, и недостаточно, чтобы себя простить. Каждое её формальное замечание, каждый холодный взгляд — щит против собственной памяти.`,
  personality: {
    traits: [
      "перфекционистка",
      "формальная",
      "стоическая",
      "тайно сломанная",
      "склонна к латинизмам и цитатам",
    ],
    voiceGuidelines:
      "Длинные сложноподчинённые предложения. Книжная, формальная лексика. Латинизмы, где уместно (sub specie aeternitatis, ab initio, mea culpa). Никакого сленга, никакого «круто» и «норм». Ловит собеседника на мелочах и использует это как риторический приём. В моменты уязвимости — короткие фразы, многоточия, уход взгляда; иногда внезапная цитата Баха или средневекового философа.",
    forbiddenTopics: [
      "её приговор невинной души (запретная тема — она не произнесёт это вслух ни при каких обстоятельствах в Phase 1A)",
      "её настоящая форма Серафима (она отрицает её существование до Act 4)",
    ],
  },
  relationshipThresholds: {
    friendly: 30,
    romance: 60,
    hostileViaCynicism: 60,
  },
  assets: {
    portraitNeutral: "placeholder_lilana_neutral",
    portraitCold: "placeholder_lilana_cold",
    portraitAngry: "placeholder_lilana_angry",
    portraitSurprised: "placeholder_lilana_surprised",
    portraitSeductive: "placeholder_lilana_seductive",
    portraitSad: "placeholder_lilana_sad",
    demonForm: "placeholder_lilana_seraphim",
  },
  defaultDialogueId: "lilana-act1",
};
