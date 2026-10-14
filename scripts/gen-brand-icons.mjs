#!/usr/bin/env node

/**
 * Regenerates src/components/needt3/brand/data.ts: the brand marks the v3 UI
 * draws (Connections, onboarding, sign-in, Settings, mail), inlined as typed
 * SVG node trees so the app never fetches a logo from a CDN at runtime.
 *
 * Run:  node scripts/gen-brand-icons.mjs
 * Needs network (Iconify API + jsDelivr). The output is committed; this script
 * is how it was made and how a mark is changed or added.
 *
 * Sources and licences of the SOURCE ARTWORK (the marks themselves remain the
 * property of their owners; the owner has cleared using them, see CLAUDE.md):
 *   logos:*          Iconify "SVG Logos" (gilbarbara/logos)   CC0-1.0
 *   simple-icons:*   Simple Icons 16.35.0                     CC0-1.0
 *   thesvg-color:*   theSVG Color                              MIT
 *   devicon:*        Devicon                                   MIT
 *   iconoir:*        Iconoir                                   MIT
 *
 * A mark is drawn one of three ways (see `look`):
 *   tile  - the mark inset on a rounded-square tile (white for full-colour
 *           marks, the brand colour for white marks); `scale` is the mark's
 *           share of the tile.
 *   full  - the artwork is itself an app-icon square; it fills the tile.
 * Apple Calendar and the Needt icon are drawn in code, not listed here.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "src/components/needt3/brand/data.ts");
const SI_VERSION = "16.35.0";
const W = "#FFFFFF";

/* id: [label, source, tile background, mark scale, colour override] */
const SPEC = {
  /* Google */
  google: ["Google", "logos:google-icon", W, 0.56],
  gmail: ["Gmail", "logos:google-gmail-2020", W, 0.6],
  gcal: ["Google Calendar", "logos:google-calendar-2020", W, 0.6],
  gdrive: ["Google Drive", "logos:google-drive-2020", W, 0.6],
  gsheets: ["Google Sheets", "si:googlesheets", W, 0.58, "#34A853"],
  gemini: [
    "Gemini",
    "si:googlegemini",
    W,
    0.62,
    { gradient: ["#4285F4", "#9B72CB", "#D96570"] },
  ],
  /* Microsoft */
  microsoft: ["Microsoft", "logos:microsoft-icon", W, 0.56],
  outlook: ["Outlook", "thesvg-color:microsoft-outlook", W, 0.74],
  ocal: ["Outlook Calendar", "thesvg-color:outlook-calendar", W, 0.72],
  onedrive: ["OneDrive", "logos:microsoft-onedrive", W, 0.68],
  teams: ["Microsoft Teams", "logos:microsoft-teams", W, 0.64],
  /* Apple */
  icloud: ["iCloud", "si:icloud", W, 0.64, "#3693F3"],
  icloudmail: ["iCloud Mail", "si:icloud", "#3693F3", 0.62, W],
  shortcuts: [
    "Apple Shortcuts",
    "iconoir:apple-shortcuts",
    ["#F2577E", "#7A5AF8", "#3D7DF6"],
    0.6,
    W,
  ],
  apple: ["Apple", "si:apple", "#000000", 0.52, W],
  /* Chat, mail, meetings */
  slack: ["Slack", "logos:slack-icon", W, 0.6],
  discord: ["Discord", "si:discord", "#5865F2", 0.6, W],
  telegram: ["Telegram", "si:telegram", "#26A5E4", 0.7, W],
  protonmail: ["Proton Mail", "si:protonmail", W, 0.58, "#6D4AFF"],
  zoom: ["Zoom", "logos:zoom-icon", "#0B5CFF", 1],
  calendly: ["Calendly", "si:calendly", W, 0.6, "#006BFF"],
  /* Tasks, notes, files */
  notion: ["Notion", "logos:notion-icon", W, 0.62],
  linear: ["Linear", "si:linear", "#5E6AD2", 0.54, W],
  jira: ["Jira", "si:jira", "#0052CC", 0.54, W],
  asana: ["Asana", "logos:asana-icon", W, 0.62],
  trello: ["Trello", "si:trello", "#0052CC", 0.56, W],
  clickup: ["ClickUp", "logos:clickup-icon", W, 0.6],
  todoist: ["Todoist", "si:todoist", W, 0.64, "#E44332"],
  obsidian: [
    "Obsidian",
    "si:obsidian",
    "#1E1E2E",
    0.56,
    { gradient: ["#C4B5FD", "#7C3AED"] },
  ],
  evernote: ["Evernote", "si:evernote", W, 0.6, "#00A82D"],
  dropbox: ["Dropbox", "si:dropbox", W, 0.58, "#0061FF"],
  box: ["Box", "si:box", "#0061D5", 0.7, W],
  airtable: ["Airtable", "logos:airtable", W, 0.6],
  figma: ["Figma", "logos:figma", "#1E1E1E", 0.58],
  miro: ["Miro", "si:miro", "#FFD02F", 0.54, "#050038"],
  canva: ["Canva", "devicon:canva", W, 0.82],
  /* Social sign-in */
  x: ["X", "si:x", "#000000", 0.5, W],
  linkedin: ["LinkedIn", "logos:linkedin-icon", W, 0.6],
  pinterest: ["Pinterest", "si:pinterest", "#E60023", 0.66, W],
  spotify: ["Spotify", "si:spotify", "#121212", 0.64, "#1ED760"],
  /* Developer */
  github: ["GitHub", "si:github", "#181717", 0.6, W],
  gitlab: ["GitLab", "logos:gitlab-icon", W, 0.6],
  cursor: ["Cursor", "si:cursor", "#000000", 0.58, W],
  windsurf: ["Windsurf", "si:windsurf", "#0B100F", 0.58, "#58E5BB"],
  raycast: ["Raycast", "si:raycast", "#FF6363", 0.6, W],
  n8n: ["n8n", "si:n8n", W, 0.7, "#EA4B71"],
  make: ["Make", "si:make", "#6D00CC", 0.62, W],
  zapier: ["Zapier", "logos:zapier-icon", W, 0.6],
  curl: ["curl", "si:curl", W, 0.58, "#073551"],
  restapi: ["REST API", "iconoir:code-brackets", "#1C1C1E", 0.58, W],
  /* AI */
  claude: ["Claude", "si:claude", "#D97757", 0.6, W],
  chatgpt: ["ChatGPT", "logos:openai-icon", "#74AA9C", 0.6, W],
  openai: ["OpenAI", "logos:openai-icon", W, 0.6, "#000000"],
  perplexity: ["Perplexity", "si:perplexity", "#091717", 0.56, "#20B8CD"],
};

const SOURCES = {
  logos: (n) => `https://api.iconify.design/logos/${n}.svg`,
  "thesvg-color": (n) => `https://api.iconify.design/thesvg-color/${n}.svg`,
  devicon: (n) => `https://api.iconify.design/devicon/${n}.svg`,
  iconoir: (n) => `https://api.iconify.design/iconoir/${n}.svg`,
  si: (n) =>
    `https://cdn.jsdelivr.net/npm/simple-icons@${SI_VERSION}/icons/${n}.svg`,
};
const LICENCE = {
  logos: "CC0-1.0",
  si: "CC0-1.0",
  "thesvg-color": "MIT",
  devicon: "MIT",
  iconoir: "MIT",
};

const ALLOWED = new Set([
  "path",
  "circle",
  "ellipse",
  "rect",
  "g",
  "defs",
  "linearGradient",
  "radialGradient",
  "stop",
  "clipPath",
  "mask",
  "filter",
  "use",
  "feBlend",
  "feColorMatrix",
  "feFlood",
  "feGaussianBlur",
  "feOffset",
  "feComposite",
  "feMerge",
  "feMergeNode",
]);
const DROP = new Set(["title", "desc", "metadata"]);

/** A small tolerant parser for the plain SVGs these sources serve. */
function parse(svg) {
  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w:-]*)((?:\s+[^<>]*?)?)(\/?)>/g;
  const root = { tag: "#root", attrs: {}, kids: [] };
  const stack = [root];
  let m;
  let skip = 0;
  while ((m = re.exec(svg))) {
    if (m[0].startsWith("<!--")) continue;
    const [, closing, tag, rawAttrs, self] = m;
    if (closing) {
      const top = stack.pop();
      if (DROP.has(top.tag)) skip -= 1;
      continue;
    }
    const attrs = {};
    for (const a of rawAttrs.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g))
      attrs[a[1]] = a[2];
    const node = { tag, attrs, kids: [] };
    if (DROP.has(tag)) {
      if (!self) {
        skip += 1;
        stack.push(node);
      }
      continue;
    }
    if (!skip) stack[stack.length - 1].kids.push(node);
    if (!self) stack.push(node);
  }
  return root.kids.find((k) => k.tag === "svg");
}

const camel = (k) => k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

function clean(node, ink, id) {
  if (!ALLOWED.has(node.tag))
    throw new Error(`${id}: unsupported <${node.tag}>`);
  const attrs = {};
  for (const [k, v0] of Object.entries(node.attrs)) {
    if (k === "xmlns" || k.startsWith("xmlns:")) continue;
    if (["class", "role", "aria-hidden"].includes(k)) continue;
    const v = v0.replace(/currentColor/g, ink);
    if (k === "style") {
      const o = {};
      for (const part of v.split(";")) {
        const [pk, pv] = part.split(":");
        if (pk && pv) o[camel(pk.trim())] = pv.trim();
      }
      attrs.style = o;
    } else if (k === "xlink:href" || k === "href") attrs.href = v;
    else attrs[camel(k)] = v;
  }
  return {
    tag: node.tag,
    attrs,
    kids: node.kids.map((c) => clean(c, ink, id)),
  };
}

function toTuple(n) {
  const kids = n.kids.map(toTuple);
  return kids.length ? [n.tag, n.attrs, kids] : [n.tag, n.attrs];
}

async function fetchText(url) {
  for (let i = 0; i < 4; i += 1) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.text();
      throw new Error(`${res.status}`);
    } catch (e) {
      if (i === 3) throw new Error(`${url}: ${e.message}`);
      await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
    }
  }
}

const out = [];
for (const [id, [label, src, bg, scale, over]] of Object.entries(SPEC)) {
  const [kind, name] = src.split(":");
  const url = SOURCES[kind](name);
  const svg = parse(await fetchText(url));
  if (!svg) throw new Error(`${id}: no <svg> at ${url}`);
  const vb = (svg.attrs.viewBox || "").split(/\s+/).map(Number);
  if (vb.length !== 4 || vb.some(Number.isNaN))
    throw new Error(`${id}: viewBox`);
  const ink = typeof over === "string" ? over : W;
  let nodes = svg.kids.map((k) => clean(k, ink, id));
  let defs = [];
  let fill = typeof over === "string" ? over : null;
  if (over && typeof over === "object") {
    const gid = "g";
    defs = [
      {
        tag: "defs",
        attrs: {},
        kids: [
          {
            tag: "linearGradient",
            attrs: { id: gid, x1: "0", y1: "0", x2: "1", y2: "1" },
            kids: over.gradient.map((c, i, a) => ({
              tag: "stop",
              attrs: {
                offset: String(a.length === 1 ? 0 : i / (a.length - 1)),
                stopColor: c,
              },
              kids: [],
            })),
          },
        ],
      },
    ];
    fill = `url(#${gid})`;
  }
  if (fill) nodes = [{ tag: "g", attrs: { fill }, kids: nodes }];
  const entry = {
    label,
    bg,
    scale,
    box: [vb[0], vb[1], vb[2], vb[3]],
    nodes: [...defs, ...nodes].map(toTuple),
  };
  out.push(
    `  /* ${label}: ${src} (${LICENCE[kind]}) */\n  ${JSON.stringify(id)}: ${JSON.stringify(entry)},`
  );
}

const body = `/**
 * GENERATED by scripts/gen-brand-icons.mjs; do not edit by hand. Regenerate
 * with \`node scripts/gen-brand-icons.mjs\` (needs network) and commit the result.
 *
 * The brands' own colours are CONTENT, not UI colours, so they stay as literals
 * here (the design-token check scans stylesheets only).
 *
 * Source artwork and licences: logos (CC0-1.0), Simple Icons ${SI_VERSION} (CC0-1.0),
 * theSVG Color (MIT), Devicon (MIT) and Iconoir (MIT). The marks themselves are
 * the property of their owners; the product owner cleared their use (CLAUDE.md,
 * Conventions: Brand marks).
 */

/** One SVG element: [tag, attributes, children?]. Ids are scoped per instance at render. */
export type BrandNode = readonly [
  tag: string,
  attrs: Readonly<Record<string, string | Readonly<Record<string, string>>>>,
  children?: readonly BrandNode[],
];

export interface BrandArt {
  readonly label: string;
  /** Tile background: one colour, or the stops of a 135deg gradient. */
  readonly bg: string | readonly string[];
  /** The mark's share of the tile (1 = the artwork is the whole tile). */
  readonly scale: number;
  /** The artwork's viewBox: [x, y, width, height]. */
  readonly box: readonly [number, number, number, number];
  readonly nodes: readonly BrandNode[];
}

export const BRAND_ART = {
${out.join("\n")}
} as const satisfies Record<string, BrandArt>;

export type BrandArtId = keyof typeof BRAND_ART;
`;

writeFileSync(OUT, body);
execFileSync("npx", ["prettier", "--write", OUT], {
  cwd: ROOT,
  stdio: "inherit",
});
process.stdout.write(`wrote ${OUT} (${Object.keys(SPEC).length} marks)\n`);
