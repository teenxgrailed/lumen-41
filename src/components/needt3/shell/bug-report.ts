/**
 * What "Report a problem" sends to `POST /api/bug-reports`. The sheet asks two
 * questions (what happened, what was expected); the rest is what the app
 * already knows, shown in the sheet before it is sent.
 */

const TITLE_MAX = 80;

export interface BugContext {
  /** The route under the sheet, e.g. "/today". */
  route: string;
  theme: string;
  /** "1440 × 900". */
  window: string;
  version: string;
  browser: string;
}

/** The report's title: the first line of what happened, cut at a word. */
export function bugTitle(what: string): string {
  const line = what.trim().split(/\r?\n/)[0] ?? "";
  if (line.length <= TITLE_MAX) return line;
  const cut = line.slice(0, TITLE_MAX);
  const at = cut.lastIndexOf(" ");
  return `${(at > TITLE_MAX / 2 ? cut.slice(0, at) : cut).trimEnd()}…`;
}

/** The "Sent with it" chips, in the order the prototype shows them. */
export function bugFacts(
  ctx: BugContext
): ReadonlyArray<readonly [string, string]> {
  return [
    ["Screen", ctx.route],
    ["Theme", ctx.theme],
    ["Window", ctx.window],
    ["Version", ctx.version],
  ];
}

export function bugFormData(
  what: string,
  expected: string,
  ctx: BugContext
): FormData {
  const form = new FormData();
  form.set("title", bugTitle(what));
  form.set("description", what.trim());
  if (expected.trim()) form.set("expectedBehavior", expected.trim());
  form.set("route", ctx.route);
  form.set("appVersion", ctx.version);
  form.set("viewport", ctx.window.replace(/\s/g, ""));
  form.set("theme", ctx.theme);
  form.set("browser", ctx.browser);
  return form;
}
