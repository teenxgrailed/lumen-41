/**
 * Initials for an avatar, safe for any name.
 *
 * Words with no letter or number ("-", "&", an emoji on its own) are skipped,
 * so "Jonas & Weber" is "JW". The first character of a word is a whole
 * grapheme (Intl.Segmenter), so an accented or combined letter, or a letter
 * written as a surrogate pair, is never cut in half. Nothing left is "?".
 */

// Built from a string: the property escapes need ES2018, the project targets ES2017.
const HAS_LETTER_OR_NUMBER = new RegExp("[\\p{L}\\p{N}]", "u");

type Segmenter = {
  segment: (s: string) => Iterable<{ segment: string }>;
};

let segmenter: Segmenter | null | undefined;

function firstGrapheme(word: string): string {
  if (segmenter === undefined) {
    const Seg = (
      Intl as unknown as {
        Segmenter?: new (
          locale?: string,
          options?: { granularity: "grapheme" }
        ) => Segmenter;
      }
    ).Segmenter;
    segmenter = Seg ? new Seg(undefined, { granularity: "grapheme" }) : null;
  }
  if (segmenter) {
    for (const part of segmenter.segment(word)) return part.segment;
    return "";
  }
  return Array.from(word)[0] ?? "";
}

/** Up to `max` initials of `name`, upper-cased; "?" when it has none. */
export function initialsOf(name: string | null | undefined, max = 2): string {
  const words = (name ?? "")
    .split(/\s+/)
    .filter((w) => w && HAS_LETTER_OR_NUMBER.test(w));
  const out = words
    .slice(0, max)
    .map((w) => {
      // the first grapheme that is a letter or a number, not a leading mark
      const chars = Array.from(w);
      const at = chars.findIndex((c) => HAS_LETTER_OR_NUMBER.test(c));
      return firstGrapheme(chars.slice(Math.max(at, 0)).join(""));
    })
    .join("")
    .toUpperCase();
  return out || "?";
}
