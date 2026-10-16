/**
 * Ask Needt from code that is not inside the v3 shell's providers (the
 * document editor's context menu lives in a legacy component). The shell's
 * AskProvider listens for this event, opens the panel and sends the line.
 */
export const ASK_EVENT = "needt:ask";

export function askNeedt(line: string) {
  if (typeof window === "undefined" || !line.trim()) return;
  window.dispatchEvent(new CustomEvent<string>(ASK_EVENT, { detail: line }));
}

/** The question for a piece of the page: the text, quoted, and what is wanted of it. */
export function askAbout(text: string, kind: "selection" | "block") {
  const clip = text.length > 1500 ? `${text.slice(0, 1500)}…` : text;
  const lead =
    kind === "selection"
      ? "About this part of the page"
      : "About this block of the page";
  return `${lead}:\n\n“${clip}”\n\n`;
}
