// Pure helpers behind scripts/release-prepare.mjs: no file system, no git,
// no clock. Every function takes text and returns text, so the release
// mechanics are unit tested (scripts/lib/__tests__/release.test.ts).
//
// CommonJS so Jest (CommonJS) can load it as is; the .mjs script imports it
// with a default import.

const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const UNRELEASED = /^## \[Unreleased\][^\n]*$/im;
const SOURCE_MARK = /^<!--\s*changelog\.d\/([^\s/]+\.md)\s*-->$/;
const SOURCE_END = /^<!--\s*\/changelog\.d\s*-->$/;

/** "X.Y.Z", nothing else: the Mac release workflow accepts only that. */
function isVersion(v) {
  return typeof v === "string" && VERSION.test(v);
}

/** A real calendar day written as YYYY-MM-DD. */
function isDay(d) {
  const m = typeof d === "string" ? DAY.exec(d) : null;
  if (!m) return false;
  const [y, mo, da] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, da));
  return (
    t.getUTCFullYear() === y &&
    t.getUTCMonth() === mo - 1 &&
    t.getUTCDate() === da
  );
}

/** The heading changelog.d/README.md asks for: `## [1.0.0] — 2026-10-25`. */
function releaseHeading(version, date) {
  return `## [${version}] — ${date}`;
}

/** Whether the changelog already has a `## [<version>]` section. */
function hasRelease(md, version) {
  const escaped = String(version).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^## \\[${escaped}\\]`, "m").test(md);
}

/**
 * Renames `## [Unreleased]` to the release heading and puts a fresh, empty
 * `## [Unreleased]` above it. Returns the new changelog and the released
 * section's body (the text between the release heading and the next `## `).
 * Throws when there is no Unreleased heading, the version is already
 * released, or there is nothing to release.
 */
function cutRelease(md, version, date) {
  if (!isVersion(version))
    throw new Error(`Version "${version}" is not X.Y.Z.`);
  if (!isDay(date)) throw new Error(`Date "${date}" is not YYYY-MM-DD.`);
  const text = md.replace(/\r\n?/g, "\n");
  if (hasRelease(text, version)) {
    throw new Error(`CHANGELOG.md already has a [${version}] section.`);
  }
  const match = UNRELEASED.exec(text);
  if (!match) throw new Error("CHANGELOG.md has no '## [Unreleased]' heading.");
  const start = match.index + match[0].length;
  const nextAt = text.slice(start).search(/^## /m);
  const end = nextAt === -1 ? text.length : start + nextAt;
  const section = text.slice(start, end).replace(/^\n+/, "").trimEnd();
  if (!section.split("\n").some((l) => /^\s*[-*]\s+\S/.test(l))) {
    throw new Error("The [Unreleased] section has no entries to release.");
  }
  const changelog =
    text.slice(0, match.index) +
    `## [Unreleased]\n\n${releaseHeading(version, date)}\n\n` +
    section +
    "\n" +
    (end < text.length ? "\n" + text.slice(end) : "");
  return { changelog, section };
}

/**
 * Sets the top-level `version` of a package.json, and for a lockfile also
 * `packages[""].version`. The file must already be in npm's own layout
 * (two-space JSON plus a newline) so the only diff is the version lines.
 */
function setJsonVersion(text, version, { lockfile = false } = {}) {
  if (!isVersion(version))
    throw new Error(`Version "${version}" is not X.Y.Z.`);
  const data = JSON.parse(text);
  if (`${JSON.stringify(data, null, 2)}\n` !== text) {
    throw new Error(
      "JSON is not in npm's two-space layout; refusing to rewrite it."
    );
  }
  if (typeof data.version !== "string")
    throw new Error("No top-level version.");
  data.version = version;
  if (lockfile) {
    const root = data.packages && data.packages[""];
    if (!root || typeof root.version !== "string") {
      throw new Error('Lockfile has no packages[""].version.');
    }
    root.version = version;
  }
  return `${JSON.stringify(data, null, 2)}\n`;
}

function replaceAll(text, re, to, what) {
  let n = 0;
  const out = text.replace(re, (...m) => {
    n += 1;
    return to(...m);
  });
  if (n === 0) throw new Error(`No ${what} found.`);
  return out;
}

/** `MARKETING_VERSION: "x"` in an XcodeGen project.yml. */
function setXcodegenMarketingVersion(yml, version) {
  if (!isVersion(version))
    throw new Error(`Version "${version}" is not X.Y.Z.`);
  return replaceAll(
    yml,
    /^(\s*MARKETING_VERSION:\s*)("[^"\n]*"|'[^'\n]*'|[^\s#]+)/gm,
    (_, lead) => `${lead}"${version}"`,
    "MARKETING_VERSION in project.yml"
  );
}

/** Every `MARKETING_VERSION = x;` in an Xcode project.pbxproj. */
function setPbxprojMarketingVersion(text, version) {
  if (!isVersion(version))
    throw new Error(`Version "${version}" is not X.Y.Z.`);
  return replaceAll(
    text,
    /^(\s*MARKETING_VERSION = )[^;\n]+;/gm,
    (_, lead) => `${lead}${version};`,
    "MARKETING_VERSION in project.pbxproj"
  );
}

/** Markdown inline marks out (same rules as src/lib/whats-new/compile.ts). */
function plainText(md) {
  return md
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/(^|[\s(])\*([^*\s][^*]*)\*(?=[\s).,;:!?]|$)/g, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * A released section split into its parts: each collected fragment (after a
 * `<!-- changelog.d/<name> -->` marker) and the hand-written rest (name
 * null). Each part lists its top-level bullets as plain text; indented lines
 * continue the bullet above, `###` headings are skipped.
 */
function parseSection(section) {
  const parts = [];
  let part = { name: null, bullets: [] };
  let cur = null;
  const flush = () => {
    if (cur) {
      const line = plainText(cur.join(" "));
      if (line) part.bullets.push(line);
    }
    cur = null;
  };
  const closePart = (name) => {
    flush();
    if (part.bullets.length > 0) parts.push(part);
    part = { name, bullets: [] };
  };
  for (const raw of section.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    const mark = SOURCE_MARK.exec(line.trim());
    if (mark || SOURCE_END.test(line.trim())) {
      closePart(mark ? mark[1] : null);
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    if (/^#{1,6}\s/.test(line)) {
      flush();
      continue;
    }
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      flush();
      cur = [bullet[1]];
    } else if (cur) {
      cur.push(line.trim());
    } else if (part.name !== null) {
      // A fragment written as a paragraph is one entry.
      cur = [line.trim()];
    }
  }
  closePart(null);
  return parts;
}

/** Areas for the release notes, first match wins; tested on prefix + slug + text. */
const AREAS = [
  ["Mac app", /\bmac\b|macos|\bisland\b|menu bar|sparkle/i],
  ["iPhone app", /\biphone\b|\bios\b|live activity|lock screen/i],
  ["Desktop app and browser extension", /desktop app|tauri|extension/i],
  ["Home", /\bhome\b/i],
  [
    "Calendar and scheduling",
    /calendar|schedul|work hours|time zone|energy|caldav|personal time/i,
  ],
  ["Tasks", /\btasks?\b|subtask|quick add|recurring|inbox/i],
  ["Focus", /\bfocus\b|blocking/i],
  [
    "Documents and boards",
    /\bdocs?\b|document|\bpages?\b|moodboard|\bboards?\b|editor/i,
  ],
  ["Ask and AI", /\bask\b|\bai\b|memor|agent|morning brief|learn about/i],
  ["Habits", /habit/i],
  [
    "Mail and connections",
    /\bmail\b|connection|connector|oauth|icloud|google|outlook|\bmcp\b|\bapi\b|\bsync\b/i,
  ],
  [
    "Onboarding and plans",
    /onboarding|first run|first-run|starter|trial|checkout|lifetime|\bpro\b|\bfree\b|waitlist/i,
  ],
  ["Phone", /\bphone\b/i],
  ["Settings, admin and help", /settings|admin|\bhelp\b|what'?s new|app icon/i],
  [
    "Security and reliability",
    /security|ssrf|pkce|\bcsp\b|\berrors?\b|\bcrash|\bhangs?\b|deploy/i,
  ],
];

/** The text before a bullet's first colon, when it reads like a label. */
function labelOf(text) {
  const m = /^([^:.]{1,40}):\s/.exec(text);
  return m ? m[1] : "";
}

function areaOf(name, text) {
  const slug = (name || "").replace(/\.md$/i, "").replace(/-/g, " ");
  const label = labelOf(text);
  for (const probe of [label, slug, text.slice(0, 120)]) {
    if (!probe) continue;
    const hit = AREAS.find(([, re]) => re.test(probe));
    if (hit) return hit[0];
  }
  return "Other";
}

/** First sentence, label removed, at most `max` characters. */
function summarise(text, max = 110) {
  const label = labelOf(text);
  let s = label ? text.slice(label.length + 1).trim() : text;
  const stop = s.search(/[.;](\s|$)/);
  if (stop > 0) s = s.slice(0, stop);
  s = s.replace(/[\s,:–—-]+$/, "");
  if (s.length > max) {
    const cut = s.slice(0, max - 1);
    s = `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max / 2)).replace(/[\s,]+$/, "")}…`;
  }
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Release notes in plain English, grouped by area and at most `maxLines`
 * lines. Built only from collected, user-facing fragments (`chore-*` and
 * hand-written bullets are counted, not summarised); each area heading
 * carries its count and lists its first bullets, shortened.
 */
function releaseNotes({ version, date, section, maxLines = 60 }) {
  const parts = parseSection(section);
  const shown = parts.filter(
    (p) => p.name !== null && !p.name.toLowerCase().startsWith("chore-")
  );
  const chores = parts
    .filter((p) => p.name !== null && p.name.toLowerCase().startsWith("chore-"))
    .reduce((n, p) => n + p.bullets.length, 0);
  const handWritten = parts
    .filter((p) => p.name === null)
    .reduce((n, p) => n + p.bullets.length, 0);

  const groups = new Map();
  for (const p of shown) {
    for (const b of p.bullets) {
      const area = areaOf(p.name, b);
      if (!groups.has(area)) groups.set(area, []);
      groups.get(area).push(b);
    }
  }
  const order = [...AREAS.map(([a]) => a), "Other"].filter((a) =>
    groups.has(a)
  );
  const total = order.reduce((n, a) => n + groups.get(a).length, 0);

  const head = [
    `# Needt ${version} — ${date}`,
    "",
    `${total} user-facing change${total === 1 ? "" : "s"} from ${shown.length} changelog fragment${shown.length === 1 ? "" : "s"}, grouped by area. ` +
      `The full list is in CHANGELOG.md under [${version}].`,
  ];
  const extra = [];
  if (handWritten > 0) {
    extra.push(
      `CHANGELOG.md also carries ${handWritten} hand-written entr${handWritten === 1 ? "y" : "ies"} from before fragments existed; they are not summarised here.`
    );
  }
  if (chores > 0) {
    extra.push(
      `${chores} internal housekeeping entr${chores === 1 ? "y is" : "ies are"} left out.`
    );
  }
  if (extra.length) head.push("", extra.join(" "));

  // Every area gets a blank line, its heading and one bullet, so no area is
  // dropped; the lines left go one bullet at a time in proportion to each
  // area's size (D'Hondt: the highest size / (listed + 1) wins the next one).
  const take = new Map(order.map((a) => [a, 1]));
  const weight = (a) =>
    take.get(a) < groups.get(a).length
      ? groups.get(a).length / (take.get(a) + 1)
      : 0;
  let spare = maxLines - head.length - 3 * order.length;
  while (spare > 0) {
    const next = order.reduce(
      (best, a) => (weight(a) > (best ? weight(best) : 0) ? a : best),
      null
    );
    if (!next) break;
    take.set(next, take.get(next) + 1);
    spare -= 1;
  }
  const lines = [...head];
  for (const area of order) {
    const items = groups.get(area);
    lines.push("", `## ${area} (${items.length})`);
    for (const b of items.slice(0, take.get(area))) {
      lines.push(`- ${summarise(b)}`);
    }
  }
  return `${lines.slice(0, maxLines).join("\n")}\n`;
}

module.exports = {
  AREAS,
  areaOf,
  cutRelease,
  hasRelease,
  isDay,
  isVersion,
  parseSection,
  plainText,
  releaseHeading,
  releaseNotes,
  setJsonVersion,
  setPbxprojMarketingVersion,
  setXcodegenMarketingVersion,
  summarise,
};
