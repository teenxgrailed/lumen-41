/**
 * The AI tools tab's rules (connections.jsx `cnStepData`, connections-data.js
 * `CN_META`), pure. Two doors into Needt MCP: a personal token in a header
 * (`<origin>/api/mcp`, works today) and OAuth sign-in on the canonical host
 * (`mcp.needt.app`, for claude.ai / ChatGPT / Perplexity). The OAuth host has
 * no DNS until `NEXT_PUBLIC_MCP_OAUTH_URL` is set, so tools that need it stay
 * honestly "Soon" until then.
 */

export const AI_TOOL_IDS = [
  "claude",
  "chatgpt",
  "cursor",
  "gemini",
  "perplexity",
  "othermcp",
] as const;
export type AiToolId = (typeof AI_TOOL_IDS)[number];

export const AI_META: Record<
  AiToolId,
  { label: string; kind: string; gives: string; oauth: boolean }
> = {
  claude: {
    label: "Claude",
    kind: "Anthropic",
    gives: "Ask Claude about your day, and let it add tasks for you",
    oauth: true,
  },
  chatgpt: {
    label: "ChatGPT",
    kind: "OpenAI",
    gives: "Plan with ChatGPT using your real tasks and calendar",
    oauth: true,
  },
  cursor: {
    label: "Cursor",
    kind: "Code editor",
    gives: "Turn TODOs into Needt tasks without leaving your code",
    oauth: false,
  },
  gemini: {
    label: "Gemini",
    kind: "Google · Gemini CLI",
    gives: "Bring your notes and schedule into Gemini",
    oauth: false,
  },
  perplexity: {
    label: "Perplexity",
    kind: "Mac app",
    gives: "Research with your tasks and notes as context",
    oauth: true,
  },
  othermcp: {
    label: "Other MCP client",
    kind: "Any MCP app",
    gives: "Any app that speaks MCP — URL, config and an access token",
    oauth: false,
  },
};

/** `NEXT_PUBLIC_MCP_OAUTH_URL`, e.g. https://mcp.needt.app/mcp; empty = hidden. */
export function oauthUrlFromEnv(
  raw: string | undefined = process.env.NEXT_PUBLIC_MCP_OAUTH_URL
) {
  const v = (raw ?? "").trim();
  return /^https:\/\//.test(v) ? v : null;
}

export function tokenUrl(origin: string) {
  return `${origin.replace(/\/$/, "")}/api/mcp`;
}

/** A tool needing OAuth is unavailable while the OAuth host is not live. */
export function toolAvailable(id: AiToolId, oauthUrl: string | null) {
  return !AI_META[id].oauth || !!oauthUrl;
}

export type StepExtra = null | "url" | "token" | { code: string; copy: string };
export interface Step {
  t: string;
  x: StepExtra;
}

const json = (o: unknown) => JSON.stringify(o, null, 2);
export const TOKEN_PLACEHOLDER = "<your access token>";
export const maskToken = (t: string) =>
  t.length > 14 ? `${t.slice(0, 9)}••••••••${t.slice(-4)}` : "••••••••";

/**
 * The setup guide per tool. `url` is the token URL (header tools); the OAuth
 * tools paste `oauthUrl`. `token` is the one just made (shown once) or null.
 */
export function stepData(
  id: AiToolId,
  o: { url: string; oauthUrl: string | null; token: string | null }
): Step[] {
  const approve: Step = {
    t: "Sign in to Needt when it asks, and approve",
    x: null,
  };
  const paste: Step = { t: "Paste this URL", x: "url" };
  const cfg = (reveal: boolean) =>
    json({
      mcpServers: {
        needt: {
          [id === "gemini" ? "httpUrl" : "url"]: o.url,
          headers: {
            Authorization: `Bearer ${
              o.token
                ? reveal
                  ? o.token
                  : maskToken(o.token)
                : TOKEN_PLACEHOLDER
            }`,
          },
        },
      },
    });
  const tokenCfg = { code: cfg(false), copy: cfg(true) };
  if (id === "claude")
    return [
      { t: "Open Claude → **Settings** → **Connectors**", x: null },
      { t: "Click **Add custom connector** and name it Needt", x: null },
      paste,
      approve,
    ];
  if (id === "chatgpt")
    return [
      {
        t: "Open ChatGPT → **Settings** → **Apps & Connectors** → **Advanced**, turn on **Developer mode**",
        x: null,
      },
      {
        t: "Back in **Connectors**, click **Create** and choose MCP server",
        x: null,
      },
      paste,
      approve,
    ];
  if (id === "perplexity")
    return [
      {
        t: "Open the Perplexity Mac app → **Settings** → **Connectors**",
        x: null,
      },
      { t: "Click **Add connector** → **Remote**", x: null },
      paste,
      approve,
    ];
  const tokenStep: Step = {
    t: "Create an access token. It is shown once; a new one stops the old one at once",
    x: "token",
  };
  if (id === "cursor")
    return [
      tokenStep,
      {
        t: "Open `~/.cursor/mcp.json` — or Cursor → **Settings** → **MCP** → **Add new global MCP server**",
        x: null,
      },
      { t: "Add Needt to it", x: tokenCfg },
      {
        t: "Save — Needt shows up in Cursor’s MCP list with a green dot",
        x: null,
      },
    ];
  if (id === "gemini")
    return [
      tokenStep,
      { t: "Open `~/.gemini/settings.json`", x: null },
      { t: "Add Needt to it", x: tokenCfg },
      { t: "Restart Gemini CLI and run `/mcp`", x: null },
    ];
  const cmd = (reveal: boolean) =>
    `claude mcp add --transport http needt ${o.url} --header "Authorization: Bearer ${
      o.token ? (reveal ? o.token : maskToken(o.token)) : TOKEN_PLACEHOLDER
    }"`;
  return [
    { t: "Point your client at this server URL", x: "url" },
    tokenStep,
    {
      t: "Claude Code: run this. Other clients take the same URL and header",
      x: { code: cmd(false), copy: cmd(true) },
    },
    { t: "Or add this to its MCP config", x: tokenCfg },
  ];
}

/** `**bold**` and `` `path` `` marks → parts for rendering. */
export function richParts(text: string) {
  return text
    .split(/(\*\*[^*]+\*\*|`[^`]+`)/)
    .filter(Boolean)
    .map((s) =>
      s.startsWith("**")
        ? { kind: "b" as const, text: s.slice(2, -2) }
        : s.startsWith("`")
          ? { kind: "path" as const, text: s.slice(1, -1) }
          : { kind: "text" as const, text: s }
    );
}

/** Connected apps carrying this tool's name are its connection. */
export function appsFor<T extends { clientName: string }>(
  id: AiToolId,
  apps: readonly T[]
) {
  if (id === "othermcp") return [];
  const needle = AI_META[id].label.toLowerCase();
  return apps.filter((a) => a.clientName.toLowerCase().includes(needle));
}

export function aiSub(count: number) {
  return count
    ? `${count} connected ${count === 1 ? "app" : "apps"}`
    : "No AI tools connected yet";
}
