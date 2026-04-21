/**
 * Russian text hyphenation (dictionary-free, rule-based).
 *
 * Public API:
 *   hyphenateRu(text, maxWidth, measureTextWidth) -> string[]
 *
 * Pure TypeScript — zero Phaser dependencies. Consumer supplies a
 * `measureTextWidth` function (usually wrapping Phaser.Text measurement)
 * so the helper stays framework-agnostic.
 *
 * Rules:
 *   1. Minimum 2 letters on either side of a hyphen.
 *   2. Break between a vowel and the next consonant.
 *   3. Letters 'ъ', 'ь', 'й' never start the next line.
 *   4. Between doubled consonants, break after the first.
 *   5. Words shorter than 4 letters are never split.
 *
 * Behavior:
 *   - Whole-word packing first. If a word fits by itself on a line,
 *     it is placed without hyphenation (even if shorter words could
 *     pack with it).
 *   - When a word does not fit the remaining line, we attempt to
 *     split it at an allowed position; the head receives a trailing
 *     '-'. The tail continues on a new line and may itself be split
 *     recursively.
 *   - If no valid split fits, the word is pushed to its own line
 *     (tolerating overflow — caller can detect via measure post-hoc).
 *
 * Examples (illustrative — real widths depend on the measure fn):
 *   hyphenateRu("Восстанавливает здоровье", 100, m)
 *     -> ["Восста-", "навлива-", "ет", "здоровье"]
 *   hyphenateRu("Наносит 100 физического урона", 120, m)
 *     -> ["Наносит 100", "физического", "урона"]
 *   hyphenateRu("Мощный удар", 200, m)
 *     -> ["Мощный удар"]   // fits whole
 */

const RU_VOWELS = "аеёиоуыэюяАЕЁИОУЫЭЮЯ";
const RU_SOFT_MARKS = "ъьйЪЬЙ";
const MIN_WORD_LENGTH = 4;
const MIN_LEADING_CHARS = 2;
const HYPHEN = "-";
// placeSegment recurses on each split — depth ≈ word.length / 2. Skill
// strings are <= ~60 chars today, but capping the input defends against
// stack overflow if callers ever pass user-provided text.
const MAX_INPUT_LENGTH = 500;

const isVowel = (ch: string): boolean => RU_VOWELS.indexOf(ch) !== -1;
const isSoftMark = (ch: string): boolean => RU_SOFT_MARKS.indexOf(ch) !== -1;
const isLetter = (ch: string): boolean => /[А-Яа-яЁё]/.test(ch);

/**
 * Returns all indices `i` in [1, word.length) such that a break between
 * word[i-1] and word[i] is legal by the hyphenation rules.
 * The hyphen is placed after word[i-1].
 *
 * We walk pair-by-pair and classify by rule:
 *   - vowel -> consonant: break BETWEEN them, BUT only if:
 *       * the next char after the consonant is not a soft mark
 *         (rule 3: ъ/ь/й never start the next line — keep CЬ together)
 *       * the consonant is NOT the first of a doubled pair
 *         (rule 4: break BETWEEN doubled consonants, not before them)
 *   - consonant == consonant (doubled): break after the first
 *   - consonant -> vowel: no break (keep onset with vowel)
 *   - anything -> soft mark: no break (mark attaches to previous)
 */
function collectBreakIndices(word: string): number[] {
  const breaks: number[] = [];
  for (let i = 1; i < word.length; i++) {
    const prev = word[i - 1];
    const curr = word[i];
    if (!isLetter(prev) || !isLetter(curr)) continue;
    if (isSoftMark(curr)) continue;
    const prevIsVowel = isVowel(prev);
    const currIsVowel = isVowel(curr);
    // Break AFTER a soft mark — it closes its syllable and the next
    // letter belongs to a new syllable.
    if (isSoftMark(prev)) {
      breaks.push(i);
      continue;
    }
    if (prevIsVowel && !currIsVowel) {
      const next = i + 1 < word.length ? word[i + 1] : "";
      // Rule 3: don't strand a soft mark at the start of the tail —
      // keep the consonant bonded to its soft mark.
      if (next && isSoftMark(next)) continue;
      // Rule 4: prefer a break BETWEEN a doubled consonant pair over
      // a break before the first of the pair.
      if (next && !isVowel(next) && !isSoftMark(next) && curr.toLowerCase() === next.toLowerCase()) continue;
      breaks.push(i);
      continue;
    }
    if (!prevIsVowel && !currIsVowel && prev.toLowerCase() === curr.toLowerCase()) {
      breaks.push(i);
      continue;
    }
  }
  return breaks.filter(
    (i) =>
      i >= MIN_LEADING_CHARS &&
      word.length - i >= MIN_LEADING_CHARS &&
      hasVowel(word.slice(0, i)) &&
      hasVowel(word.slice(i)),
  );
}

function hasVowel(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    if (isVowel(s[i])) return true;
  }
  return false;
}

/**
 * Try to split a word into `[head + '-', tail]` such that `head + '-'`
 * fits within `maxWidth`. Returns null if no valid split exists or the
 * word itself is too short to split.
 *
 * Picks the LONGEST valid head that still fits — this leaves as little
 * as possible for the next line and mimics browser/LaTeX hyphenation
 * greediness.
 */
function splitWord(
  word: string,
  maxWidth: number,
  measureTextWidth: (s: string) => number,
): { head: string; tail: string } | null {
  if (word.length < MIN_WORD_LENGTH) return null;
  const candidates = collectBreakIndices(word);
  if (candidates.length === 0) return null;
  let bestHead: string | null = null;
  let bestTail: string | null = null;
  for (const i of candidates) {
    const head = word.slice(0, i) + HYPHEN;
    if (measureTextWidth(head) <= maxWidth) {
      bestHead = head;
      bestTail = word.slice(i);
    }
  }
  if (bestHead === null || bestTail === null) return null;
  return { head: bestHead, tail: bestTail };
}

/**
 * Hyphenate Russian `text` so each returned line is <= `maxWidth` when
 * measured via `measureTextWidth`. See file header for rules.
 */
export function hyphenateRu(
  text: string,
  maxWidth: number,
  measureTextWidth: (s: string) => number,
): string[] {
  if (text.length === 0) return [""];
  if (text.length > MAX_INPUT_LENGTH) return [text];
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return [""];

  const lines: string[] = [];
  let current = "";

  const pushCurrent = () => {
    if (current.length > 0) {
      lines.push(current);
      current = "";
    }
  };

  const placeSegment = (segment: string): void => {
    // Try to append to the current line (with a space if non-empty).
    const candidate = current.length === 0 ? segment : `${current} ${segment}`;
    if (measureTextWidth(candidate) <= maxWidth) {
      current = candidate;
      return;
    }
    // Segment does not fit next to existing text — flush current first.
    pushCurrent();
    if (measureTextWidth(segment) <= maxWidth) {
      current = segment;
      return;
    }
    // Segment is wider than a whole line on its own — try hyphenation.
    const split = splitWord(segment, maxWidth, measureTextWidth);
    if (split === null) {
      // No legal split — accept the overflow on its own line.
      lines.push(segment);
      return;
    }
    lines.push(split.head);
    placeSegment(split.tail);
  };

  for (const word of words) {
    placeSegment(word);
  }
  pushCurrent();
  return lines;
}
