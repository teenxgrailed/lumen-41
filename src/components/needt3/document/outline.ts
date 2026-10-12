import type { DocOutlineRow } from "@/store/needt3-ui";

/** The editor's content element inside the document sheet. */
export const EDITOR_SELECTOR = "[data-doc-sheet] .needt-page-editor";
const HEADINGS = "h1, h2, h3";

/**
 * The document rail's Contents (prototype `outlineOf`): the title, then every
 * heading of the page as drawn. The page's own heading levels are ranked, so a
 * page that only uses Heading 2 and 3 indents by one step, not two.
 */
export function outlineOf(
  editor: ParentNode | null,
  title: string
): DocOutlineRow[] {
  const heads = Array.from(editor?.querySelectorAll(HEADINGS) ?? [])
    .map((el) => ({
      text: (el.textContent ?? "").trim(),
      depth: Number(el.tagName.slice(1)),
    }))
    .filter((h) => h.text);
  const depths = Array.from(new Set(heads.map((h) => h.depth))).sort(
    (a, b) => a - b
  );
  return [
    { text: title || "Untitled", level: 0 },
    ...heads.map((h) => ({
      text: h.text,
      level: depths.indexOf(h.depth) + 1,
    })),
  ];
}

/** Scroll the page to the row: the title is the top, the rest are headings in order. */
export function scrollToOutline(
  page: Element | null,
  editor: ParentNode | null,
  index: number
) {
  if (!page) return;
  const behavior: ScrollBehavior =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth";
  if (index === 0) {
    page.scrollTo({ top: 0, behavior });
    return;
  }
  const el =
    editor?.querySelectorAll(HEADINGS)[
      // Empty headings are not rows, so count only the ones that are.
      nthNonEmpty(editor, index - 1)
    ];
  el?.scrollIntoView({ block: "start", behavior });
}

function nthNonEmpty(editor: ParentNode, n: number) {
  let seen = -1;
  const all = editor.querySelectorAll(HEADINGS);
  for (let i = 0; i < all.length; i++) {
    if ((all[i].textContent ?? "").trim()) seen++;
    if (seen === n) return i;
  }
  return -1;
}

/**
 * Every place `query` occurs in the page's text, one Range each (a match
 * never spans two text nodes). Empty query, no ranges.
 */
export function findRanges(
  root: Element | null,
  query: string,
  cased: boolean
): Range[] {
  if (!root || !query) return [];
  const needle = cased ? query : query.toLowerCase();
  const out: Range[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const original = n.nodeValue ?? "";
    for (const at of occurrences(original, needle, cased)) {
      const r = document.createRange();
      r.setStart(n, at);
      r.setEnd(n, at + needle.length);
      out.push(r);
    }
  }
  return out;
}

/** What the page holds, read from the editor's own text (prototype Info → Numbers). */
export interface PageStats {
  words: number;
  characters: number;
  blocks: number;
}
export const NO_STATS: PageStats = { words: 0, characters: 0, blocks: 0 };

export function statsOf(editor: HTMLElement | null): PageStats {
  if (!editor) return NO_STATS;
  const text = editor.innerText ?? editor.textContent ?? "";
  return {
    words: text.split(/\s+/).filter(Boolean).length,
    characters: text.replace(/[\r\n]/g, "").length,
    blocks: editor.children.length,
  };
}

/**
 * Offsets in `text` where `needle` (already lower-cased unless `cased`) starts.
 * Lower-casing can change a string's length ("İ" becomes two code units), and
 * the offsets must be the original node's, so a text whose lower-case form is
 * a different length is compared one window at a time instead.
 */
export function occurrences(text: string, needle: string, cased: boolean) {
  const out: number[] = [];
  if (!needle) return out;
  const hay = cased ? text : text.toLowerCase();
  if (hay.length === text.length) {
    for (
      let at = hay.indexOf(needle);
      at >= 0;
      at = hay.indexOf(needle, at + needle.length)
    )
      out.push(at);
    return out;
  }
  for (let at = 0; at + needle.length <= text.length; ) {
    if (text.slice(at, at + needle.length).toLowerCase() === needle) {
      out.push(at);
      at += needle.length;
    } else at += 1;
  }
  return out;
}
