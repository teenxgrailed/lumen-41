/**
 * Is this an address at a university? Pure: the domain set is a committed
 * snapshot (data/university-domains.json, derived from Hipo's
 * university-domains-list by scripts/refresh-university-domains.ts) plus a
 * short hand-kept allowlist (data/manual-allowlist.json). Nothing here calls
 * the network.
 *
 * An address matches when its domain or one of its parent domains is in the
 * set: name@cs.ethz.ch counts because ethz.ch does. A parent that is a public
 * suffix (edu, ac.uk, edu.au) never matches, whatever the data says, so
 * someone@anything.ac.uk does not pass on the strength of "ac.uk".
 */
import manualAllowlist from "./data/manual-allowlist.json";
import snapshot from "./data/university-domains.json";

/**
 * Second-level labels that registries hand out under a country code
 * (ac.uk, edu.au, com.br, ...). A domain shaped like one of these is a
 * public suffix, not a school.
 */
const PUBLIC_SECOND_LEVEL =
  /^(ac|edu|com|org|net|gov|co|sch|or|ne|go|mil|gob|nic|ed|k12|gouv|govt)\.[a-z]{2}$/;

/** Generic top-level names that must never match on their own. */
const PUBLIC_TOP_LEVEL = new Set(["edu", "ac", "com", "org", "net", "gov"]);

/** Mailbox providers anyone can sign up to; never a school, whatever a list says. */
const FREE_MAIL = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "yahoo.com",
  "icloud.com",
  "me.com",
  "proton.me",
  "protonmail.com",
  "gmx.de",
  "gmx.net",
  "web.de",
  "mail.ru",
  "yandex.ru",
  "qq.com",
  "163.com",
  "aol.com",
]);

export function isPublicSuffix(domain: string): boolean {
  if (!domain.includes(".")) return true;
  if (PUBLIC_TOP_LEVEL.has(domain)) return true;
  return PUBLIC_SECOND_LEVEL.test(domain);
}

/** "Name@CS.ETHZ.ch " → "cs.ethz.ch"; null when it is not an address. */
export function emailDomain(email: string | null | undefined): string | null {
  const value = (email ?? "").trim().toLowerCase();
  const at = value.lastIndexOf("@");
  if (at <= 0 || at === value.length - 1) return null;
  const domain = value.slice(at + 1).replace(/\.$/, "");
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) return null;
  return domain;
}

/** The domain and each parent with at least two labels, longest first. */
export function candidateDomains(domain: string): string[] {
  const labels = domain.split(".");
  const out: string[] = [];
  for (let i = 0; i <= labels.length - 2; i += 1) {
    out.push(labels.slice(i).join("."));
  }
  return out;
}

export type DomainSet = { has(domain: string): boolean };

let cached: Set<string> | null = null;

function defaultDomains(): Set<string> {
  cached ??= new Set<string>([
    ...(snapshot.domains as string[]),
    ...(manualAllowlist.domains as string[]),
  ]);
  return cached;
}

/**
 * The listed domain the address belongs to (its own domain or a parent),
 * or null when it is not a university address we recognise.
 */
export function universityDomainFor(
  email: string | null | undefined,
  domains: DomainSet = defaultDomains()
): string | null {
  const domain = emailDomain(email);
  if (!domain || FREE_MAIL.has(domain)) return null;
  for (const candidate of candidateDomains(domain)) {
    if (isPublicSuffix(candidate) || FREE_MAIL.has(candidate)) continue;
    if (domains.has(candidate)) return candidate;
  }
  return null;
}

export function isUniversityEmail(
  email: string | null | undefined,
  domains?: DomainSet
): boolean {
  return universityDomainFor(email, domains) !== null;
}

/** For the refresh script and its test: the Hipo JSON to the committed set. */
export function deriveUniversityDomains(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    throw new Error("Expected a JSON array of universities.");
  }
  const out = new Set<string>();
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const list = (entry as { domains?: unknown }).domains;
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (typeof item !== "string") continue;
      const domain = item
        .trim()
        .toLowerCase()
        .replace(/^\.+|\.+$/g, "");
      if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) continue;
      if (isPublicSuffix(domain) || FREE_MAIL.has(domain)) continue;
      out.add(domain);
    }
  }
  return [...out].sort();
}
