/**
 * GOLD STANDARD: Language-specific Text Hyphenation (pure helper)
 *
 * When game text needs to fit inside a fixed-width UI panel (skill
 * descriptions, toast bodies, card copy) and the language has long
 * compound words that overflow the box, a pure-logic hyphenation
 * helper lets the consumer break words at syllable boundaries instead
 * of either ellipsis-truncating or overflowing the container.
 *
 * Authoritative source: `src/utils/ruHyphenate.ts` (Russian, Phase 2B
 * feature-skill-card-polish). The pattern below generalises to any
 * language with well-defined syllable rules (Ukrainian, Belarusian,
 * etc.); locale-specific rules go in separate helpers per locale, not
 * behind a runtime flag in one file.
 *
 * Cross-refs:
 *  - `./ui-component.ts` (consumers build wrapped Text via this helper)
 *  - `./confirmation-overlay.ts` §2 (SkillApplyOverlay uses hyphenation
 *    for long descriptions; CARD_H bumped 120→150 after wrap)
 *
 * 1. LOCATION: `src/utils/<locale>Hyphenate.ts`, NOT `src/ui/`
 *
 *    The helper is pure text manipulation — zero Phaser, zero DOM,
 *    zero scene state. It lives under `src/utils/` so it can be
 *    imported from both v1 and v2 without crossing the boundary and
 *    so unit tests (when added) don't need a Phaser mock.
 *
 * 2. CONSUMER-DRIVEN WIDTH MEASUREMENT (callback pattern)
 *
 *    Do NOT import Phaser into the helper to measure text width. The
 *    caller already has a `Phaser.GameObjects.Text` (or the equivalent
 *    in whichever UI framework) — it passes a `measureTextWidth`
 *    callback that returns the rendered width in pixels for an input
 *    string.
 *
 *      export function hyphenateRu(
 *        text: string,
 *        maxWidth: number,
 *        measureTextWidth: (s: string) => number,
 *      ): string[]
 *
 *    Benefits:
 *    - Helper is 100% framework-agnostic — no Phaser import, no DOM.
 *    - Consumer uses the same style / font / resolution as the Text
 *      it will eventually render, so the measurement is exact.
 *    - Unit-testable with a trivial stub (`(s) => s.length * 10`).
 *
 *    Consumer pattern (Phaser) — PREFERRED form: reuse a single probe
 *    Text object across all measure() calls rather than creating a new
 *    one per measurement. Each call to `hyphenateRu` may invoke
 *    `measureTextWidth` many times (per candidate split), so per-call
 *    object creation is wasteful vs a single reused probe:
 *
 *      const probe = new Phaser.GameObjects.Text(scene, 0, 0, "", {
 *        fontSize: "16px", fontFamily: "'Exo 2', Arial, sans-serif",
 *        resolution: 2,
 *      });
 *      const measure = (s: string) => {
 *         probe.setText(s);
 *         return probe.width;
 *      };
 *      const lines = hyphenateRu(description, maxWidth, measure);
 *      probe.destroy();
 *      const textBlock = scene.add.text(x, y, lines.join("\n"), style);
 *
 *    Acceptable-but-wasteful alternative (current
 *    `src/ui/SkillApplyOverlay.ts`): create a new `scene.make.text({...
 *    add: false })` inside the closure per call, read `.width`, destroy.
 *    Functionally correct but slower — when the helper calls
 *    `measureTextWidth` many times per hyphenation, the reused-probe
 *    form avoids repeated Text construction/teardown. Migrate to the
 *    reused-probe form when touching the relevant file.
 *
 * 3. DoS / STACK-OVERFLOW GUARD (MAX_INPUT_LENGTH)
 *
 *    The splitter recurses on each hyphen break (`placeSegment` calls
 *    itself on the tail). Recursion depth ≈ word.length / 2. For
 *    in-game content (≤ 60 chars), this is safe, but cap the input to
 *    defend against future callers passing user-generated text:
 *
 *      const MAX_INPUT_LENGTH = 500;
 *      if (text.length > MAX_INPUT_LENGTH) return [text];
 *
 *    Above the cap, return the original string unchanged (caller can
 *    detect overflow post-hoc via its measure callback). Better than
 *    throwing — never wedge the UI because a translation key got too
 *    long. Same rationale applies to v2 if user-entered dialogue or
 *    chat text ever lands in a hyphenation consumer.
 *
 * 4. RUSSIAN RULE SET (ruHyphenate.ts)
 *
 *    1. MIN_LEADING_CHARS = 2 — at least 2 letters on either side of
 *       the hyphen. «Ра-корно» (1 letter head) is illegal.
 *    2. MIN_WORD_LENGTH = 4 — words shorter than 4 letters are never
 *       split. «Бог», «на», «и» pass through whole.
 *    3. Soft marks (ъ, ь, й) never start the next line. The split
 *       candidate list filters out any position where the tail begins
 *       with a soft mark, so «конь-ки» is legal but «ко-ньки» is not.
 *    4. Doubled consonants split BETWEEN the pair, not before.
 *       «ван-на», not «-ванна».
 *    5. Each half of a split must contain at least one vowel
 *       (`hasVowel` filter) — prevents stranded consonant clusters.
 *
 *    Rules live as module-level sets + classification helpers
 *    (`isVowel`, `isSoftMark`, `isLetter`), called from
 *    `collectBreakIndices(word)` which returns legal break positions.
 *
 * 5. GREEDY LONGEST-HEAD SELECTION
 *
 *    When multiple break candidates fit within `maxWidth`, pick the
 *    LONGEST legal head. This matches LaTeX / browser hyphenation
 *    defaults and leaves as little as possible for the next line:
 *
 *      for (const i of candidates) {
 *        const head = word.slice(0, i) + HYPHEN;
 *        if (measureTextWidth(head) <= maxWidth) {
 *          bestHead = head;
 *          bestTail = word.slice(i);
 *        }
 *      }
 *
 *    The loop overwrites `bestHead` on each successful wider fit so
 *    the last accepted value is the widest.
 *
 * 6. OVERFLOW FALLBACK: ACCEPT THE WIDE LINE
 *
 *    If NO legal split produces a head that fits `maxWidth`, push the
 *    segment on its own line as-is and let the caller clip or scroll.
 *    NEVER hard-wrap mid-syllable — that reads worse than an overflow
 *    one-off. The caller can detect overflow post-hoc via its own
 *    measure callback on the final line set.
 *
 * 7. WHOLE-WORD PACKING BEFORE HYPHENATION
 *
 *    The line-builder greedily packs whole words onto the current
 *    line first. Hyphenation is attempted ONLY when the incoming word
 *    would overflow the remaining line budget. This keeps the output
 *    human — «Мощный удар» stays on one line even if the budget
 *    technically allows «Мо-щный удар» to fit.
 *
 * 8. NAMING + LOCALE EXTENSIBILITY
 *
 *    Exported entry point per locale — `hyphenateRu`, `hyphenateUk`,
 *    `hyphenateEn` (when needed). Do NOT route through a single
 *    `hyphenate(text, locale, ...)` dispatcher; the locale-specific
 *    rule set is the interesting bit and inlining it per entry avoids
 *    a switch statement + rule table indirection.
 *
 *    Constants at module level UPPER_SNAKE_CASE:
 *      RU_VOWELS, RU_SOFT_MARKS, MIN_WORD_LENGTH, MIN_LEADING_CHARS,
 *      HYPHEN, MAX_INPUT_LENGTH
 *
 * 9. WHEN NOT TO USE HYPHENATION
 *
 *    - Short, fixed-width labels (button text, menu entries). If the
 *      string is too long, shorten the source text, not the layout.
 *    - Text that does not wrap at all (e.g., single-line score HUD).
 *      Overflow should clip or ellipsize, not split.
 *    - Latin-script languages with short words — default word-wrap is
 *      usually fine, and incorrect hyphenation in English looks worse
 *      than a long line.
 *
 *    For Russian skill descriptions / dialogue paragraphs where a
 *    single word like «физического» overflows a 270 px card at 16 px
 *    font, hyphenation is the right primitive.
 */
