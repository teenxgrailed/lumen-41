// @ts-check
/**
 * Turns `GET /api/blocking/active` into declarativeNetRequest rules. Pure.
 * BLOCKLIST: every listed host (and its subdomains) is sent to blocked.html.
 * ALLOWLIST: every page is sent there except the listed hosts and Needt.
 */

export const RULE_ID_BASE = 1000;
const MAIN_FRAME = ["main_frame"];
const BLOCKED_PAGE = "/src/pages/blocked.html";

/** "*.reddit.com" and "reddit.com" both mean the domain and its subdomains. */
export function ruleDomain(site) {
  return site.startsWith("*.") ? site.slice(2) : site;
}

/** Whether a host is the site or one of its subdomains. */
export function hostMatches(host, site) {
  const domain = ruleDomain(site);
  return host === domain || host.endsWith(`.${domain}`);
}

/**
 * @param {{ active: boolean, mode: string | null, sites: string[] }} active
 * @param {string} needtHost the host the extension talks to; never blocked
 */
export function rulesFor(active, needtHost) {
  if (!active?.active) return [];
  const domains = [...new Set(active.sites.map(ruleDomain))];
  const redirect = { type: "redirect", redirect: { extensionPath: BLOCKED_PAGE } };
  if (active.mode === "ALLOWLIST") {
    return [
      {
        id: RULE_ID_BASE,
        priority: 1,
        action: redirect,
        condition: { regexFilter: "^https?://", resourceTypes: MAIN_FRAME },
      },
      {
        id: RULE_ID_BASE + 1,
        priority: 2,
        action: { type: "allow" },
        condition: {
          requestDomains: [...new Set([...domains, needtHost])],
          resourceTypes: MAIN_FRAME,
        },
      },
    ];
  }
  const blocked = domains.filter((d) => !hostMatches(needtHost, d));
  if (blocked.length === 0) return [];
  return [
    {
      id: RULE_ID_BASE,
      priority: 1,
      action: redirect,
      condition: { requestDomains: blocked, resourceTypes: MAIN_FRAME },
    },
  ];
}

/** The line the blocked page shows: "Deep work until 15:30 · from your calendar". */
export function reasonLine(active, locale) {
  const first = active?.profiles?.[0];
  if (!first) return "";
  const { reason } = first;
  const source =
    reason.kind === "event"
      ? "from your calendar"
      : reason.kind === "task_block"
        ? "a scheduled task"
        : "a focus session";
  const until = reason.until
    ? ` until ${new Date(reason.until).toLocaleTimeString(locale, {
        hour: "2-digit",
        minute: "2-digit",
      })}`
    : "";
  const title = reason.title || first.name;
  return `${title}${until} · ${source}`;
}
