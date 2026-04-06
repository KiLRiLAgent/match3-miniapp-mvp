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

// NOTE: Phase 1A test swap — character ID stays "lilana" internally to keep
// dialogue/encounter/location references stable, but display name and visual
// assets are swapped to Safira (12 existing portraits) to skip art generation.
// Dialogue text still references the Lilana arc — this is a SYSTEM TEST, not
// a narrative-coherent run. Real Lilana art will land in a follow-up patch.
export const lilana: CharacterDef = {
  id: "lilana",
  name: "Сафира",
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
  // Phase 1A test swap → maps to existing Safira textures preloaded in
  // BootScene v1 (`src/scenes/BootScene.ts:63-74`). Front layer only — _back
  // variants are GameScene-specific glow layers, not portrait-friendly.
  assets: {
    portraitNeutral: "safira_main",      // calm, composed
    portraitCold: "safira_intro",        // judging, distant
    portraitAngry: "safira_attack",      // aggressive, focused
    portraitSurprised: "safira_lowhp",   // vulnerable, off-balance
    portraitSeductive: "safira_intro",   // alluring (reuse intro pose)
    portraitHappy: "safira_intro",       // pleased
    portraitSad: "safira_lowhp",         // hurt, withdrawn
    demonForm: "safira_ulta",            // ultimate / true form
  },
  defaultDialogueId: "lilana-act1",
};
