/**
 * @jest-environment jsdom
 *
 * The desktop Connections screen on the printed sky (connections.jsx): a
 * centred hero, the attention pill, centred tabs with the connected count, the
 * Connected / All apps segment, the prototype's category chips mapped from the
 * real catalogue, search, glass cards with their status pills, and the 3 / 2 / 1
 * grid. It runs on the real controller; only the data hooks are stubbed.
 */
import { act, createElement as h } from "react";

import { readFileSync } from "fs";
import { join } from "path";
import postcss from "postcss";
import { type Root, createRoot } from "react-dom/client";

import { notify } from "@/lib/notifications";

import { V3PortalScope } from "../../ctx/PortalScope";
import { ConnectionsScreen } from "../ConnectionsScreen";
import { useConnectionsController } from "../useConnectionsController";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// The sky draws on canvas and runs a rAF loop; only its frame matters here.
jest.mock("../../scenes", () => {
  const actual = jest.requireActual("../../scenes");
  return {
    ...actual,
    PxSky: (p: { children?: unknown }) =>
      jest
        .requireActual("react")
        .createElement(
          "div",
          { className: "px-sky", "data-px-sky": "a" },
          jest
            .requireActual("react")
            .createElement("div", { className: "px-content" }, p.children)
        ),
  };
});
// V3Root pulls in the whole stylesheet entry; the screen only asks the flag.
jest.mock("../../root/V3Root", () => ({ useDesignV3: () => true }));
const openPaywall = jest.fn();
jest.mock("../../paywall", () => ({
  openPaywall: (...a: unknown[]) => openPaywall(...a),
  ProBadge: (p: { locked?: boolean }) =>
    jest.requireActual("react").createElement(
      "span",
      {
        className: "pro-badge",
        "data-pro-badge": p.locked ? "locked" : "on",
      },
      "PRO"
    ),
}));
jest.mock("@/components/needt3/connections/CalDavForm", () => ({
  CalDavForm: () => null,
}));
jest.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));
jest.mock("@/store/needt3-ui", () => ({
  useNeedt3Ui: (sel: (s: unknown) => unknown) =>
    sel({ openSettings: jest.fn() }),
}));
jest.mock("@/lib/notifications", () => ({
  notify: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

type Cat =
  | "calendar"
  | "communication"
  | "notes"
  | "developer"
  | "files"
  | "tasks";
const entry = (slug: string, name: string, category: Cat, native = false) => ({
  slug,
  name,
  description: `${name} things`,
  category,
  native,
  configured: true,
});
const CATALOG = [
  entry("google-calendar", "Google Calendar", "calendar", true),
  entry("icloud-calendar", "Apple / iCloud", "calendar", true),
  entry("notion", "Notion", "notes"),
  entry("linear", "Linear", "developer"),
  entry("github", "GitHub", "developer"),
  entry("googledrive", "Google Drive", "files"),
];

// The two mailboxes the screen adds beside the server catalogue.
const ALL = CATALOG.length + 2;

const syncAccountNow = jest.fn();
const idle = { status: "success", fetchStatus: "idle", error: null };
let accountsData: unknown[] = [];
let integrations: unknown[] = [];
let viewerIsAdmin = false;
let catalogRows: unknown[] | null = null;
let planKind = "free";
jest.mock("@/lib/needt3/hooks/catalog", () => ({
  useCatalog: () => ({
    ...idle,
    data: {
      catalog: catalogRows ?? CATALOG,
      integrations,
      isAdmin: viewerIsAdmin,
    },
  }),
  connectToolkit: jest.fn(),
  startOAuth: jest.fn(),
  disconnectCalendar: jest.fn(),
  disconnectMailbox: jest.fn(),
  disconnectToolkit: jest.fn(),
  syncAccountNow: (...a: unknown[]) => syncAccountNow(...a),
}));
jest.mock("@/lib/needt3/hooks/connections", () => ({
  useConnections: () => ({ ...idle, data: accountsData }),
}));
jest.mock("@/lib/needt3/hooks/plan", () => ({
  usePlan: () => ({ data: { kind: planKind } }),
}));

const acct = (over: Record<string, unknown>) => ({
  provider: "google",
  kind: "calendar",
  state: "connected",
  label: "me@example.com",
  detail: null,
  accountId: "a1",
  ...over,
});

function Screen() {
  return h(
    V3PortalScope,
    null,
    h(Connected, null) // the controller is called once, above the face
  );
}
function Connected() {
  const c = useConnectionsController();
  return h(ConnectionsScreen, { c });
}

let host: HTMLDivElement;
let root: Root;
let appsData: unknown[] = [];
const fetchMock = jest.fn();
const flush = () => act(async () => void (await Promise.resolve()));
beforeEach(() => {
  appsData = [];
  fetchMock.mockReset();
  fetchMock.mockImplementation(
    async (url: string, init?: { method?: string }) => {
      const ok = (body: unknown) => ({ ok: true, json: async () => body });
      if (url === "/api/oauth/connected-apps") return ok({ apps: appsData });
      if (url === "/api/connector-settings")
        return ok(
          init?.method === "POST"
            ? { hasToken: true, token: "needt_secret_token_123" }
            : { hasToken: false }
        );
      return ok({});
    }
  );
  (globalThis as { fetch?: unknown }).fetch = fetchMock;
  openPaywall.mockReset();
  accountsData = [];
  integrations = [];
  viewerIsAdmin = false;
  catalogRows = null;
  planKind = "monthly";
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});
const render = () => act(() => root.render(h(Screen)));
const $ = (sel: string) => host.querySelector(sel) as HTMLElement;
const $$ = (sel: string) => [...host.querySelectorAll(sel)] as HTMLElement[];
const text = (sel: string) => $(sel)?.textContent ?? null;
const click = (el: Element | null) =>
  act(() => {
    el?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
function type(el: HTMLInputElement, value: string) {
  act(() => {
    const set = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )?.set;
    set?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const cards = () => $$("[data-cn-card]").map((c) => c.dataset.cnCard);

/** One mailbox that lost access, Google Calendar connected. */
const oneAndOutlook = () => {
  accountsData = [
    acct({}),
    acct({
      provider: "outlook",
      kind: "mail",
      state: "error",
      label: "me@outlook.com",
      detail: "Token expired · last sync 06:12",
      accountId: "m2",
    }),
  ];
};

describe("the hero", () => {
  it("is centred on the sky: eyebrow, serif title, one line", () => {
    render();
    expect($("[data-cn-screen].nx-window")).not.toBeNull();
    expect($(".px-sky [data-cn-scroll] .cn-page")).not.toBeNull();
    expect(text("header .px-kicker")).toBe("Sources");
    const h1 = $("header h1");
    expect(h1.textContent).toBe("Connections");
    expect(h1.className).toContain("cn-h1");
    expect(h1.className).toContain("px-display");
    expect(text("header .cn-screen-text-5")).toBe(
      "Where Needt reads your mail, calendars and files — and how your AI tools read Needt."
    );
  });
  it("keeps the data attribute the screen has always carried", () => {
    render();
    expect($("[data-v3-screen='connections']")).not.toBeNull();
  });
});

describe("the attention pill", () => {
  it("names the app that needs reconnecting, in red", () => {
    oneAndOutlook();
    render();
    const pill = $("[data-cn-status]");
    expect(pill.dataset.cnStatus).toBe("bad");
    expect(pill.textContent).toBe("Outlook Mail needs reconnecting");
    expect(pill.className).toContain("is-bad");
  });
  it("counts what is connected when nothing needs you", () => {
    accountsData = [acct({})];
    render();
    expect(text("[data-cn-status]")).toBe("1 connected");
    expect($("[data-cn-status]").dataset.cnStatus).toBe("ok");
  });
  it("says nothing is connected when nothing is", () => {
    render();
    expect(text("[data-cn-status]")).toBe("Nothing connected yet");
    expect($("[data-cn-status]").dataset.cnStatus).toBe("none");
  });
});

describe("the tabs", () => {
  it("are centred, carry the connected count and a dot when something is down", () => {
    oneAndOutlook();
    render();
    const list = $("[role=tablist]");
    expect(list.className).toContain("cn-tabs");
    const [apps, ai] = $$("[role=tab]");
    expect(apps.textContent).toContain("Apps & services");
    expect(text("[data-cn-count='apps']")).toBe("1 connected");
    expect(apps.querySelector(".cn-dot")?.getAttribute("title")).toBe(
      "Outlook Mail needs attention"
    );
    expect(ai.textContent).toContain("AI tools");
    expect(apps.getAttribute("aria-selected")).toBe("true");
  });
  it("show no count at zero", () => {
    render();
    expect($("[data-cn-count]")).toBeNull();
    expect($(".cn-dot")).toBeNull();
  });
  it("lock the AI tools tab on Free and not on a paid plan", () => {
    planKind = "free";
    render();
    expect($("[data-cn-tab='ai'] .pro-badge")?.dataset.proBadge).toBe("locked");
    act(() => root.unmount());
    root = createRoot(host);
    planKind = "yearly";
    render();
    expect($("[data-cn-tab='ai'] .pro-badge")?.dataset.proBadge).toBe("on");
  });
  it("move with the arrow keys and remember the choice", () => {
    render();
    act(() => {
      $("[data-cn-tab='apps']").dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })
      );
    });
    expect($("[data-cn-tab='ai']").getAttribute("aria-selected")).toBe("true");
    expect(window.localStorage.getItem("needt.connections.tab")).toBe("ai");
  });
});

describe("the toolbar", () => {
  it("has the Connected / All apps segment, the chips and the search", () => {
    render();
    expect($$(".cn-seg button").map((b) => b.textContent)).toEqual([
      "Connected",
      "All apps",
    ]);
    expect($(".cn-seg button[aria-pressed='true']").textContent).toBe(
      "All apps"
    );
    expect($(".cn-search input").getAttribute("placeholder")).toBe(
      "Search apps"
    );
  });
  it("maps our categories onto the prototype's chips, Creative only when it has a card", () => {
    render();
    expect($$(".cn-chip").map((b) => b.textContent)).toEqual([
      "All categories",
      "Mail & chat",
      "Calendars",
      "Work",
      "Files",
    ]);
    expect($(".cn-chip[aria-pressed='true']").textContent).toBe(
      "All categories"
    );
  });
  it("a chip narrows the grid; pressing All categories brings it back", () => {
    render();
    click($("[data-cn-chip='mail']"));
    expect(cards()).toEqual(["gmail", "outlook-mail"]);
    click($("[data-cn-chip='cal']"));
    expect(cards()).toEqual(["google-calendar", "icloud-calendar"]);
    click($("[data-cn-chip='work']"));
    expect(cards()).toEqual(["notion", "linear"]);
    click($("[data-cn-chip='files']"));
    // GitHub is a developer entry the prototype files under Files.
    expect(cards()).toEqual(["github", "googledrive"]);
    click($("[data-cn-chip='all']"));
    expect(cards()).toHaveLength(ALL);
  });
  it("Connected hides what is not connected", () => {
    oneAndOutlook();
    integrations = [{ id: "i1", toolkit: "notion", status: "CONNECTED" }];
    render();
    expect(cards()).toHaveLength(ALL);
    click($("[data-cn-show='connected']"));
    // What needs reconnecting is still yours, so it stays in the list.
    expect(cards()).toEqual(["google-calendar", "notion", "outlook-mail"]);
    expect($("[data-cn-show='connected']").getAttribute("aria-pressed")).toBe(
      "true"
    );
  });
  it("search filters the cards and shows a way out when nothing matches", () => {
    render();
    type($(".cn-search input") as HTMLInputElement, "notion");
    expect(cards()).toEqual(["notion"]);
    type($(".cn-search input") as HTMLInputElement, "zzz");
    expect(cards()).toEqual([]);
    expect(text("[data-cn-empty] .cn-screen-text")).toBe(
      "Nothing matches “zzz”"
    );
    click($("[data-cn-clear]"));
    expect(cards()).toHaveLength(ALL);
    expect(($(".cn-search input") as HTMLInputElement).value).toBe("");
  });
  it("Escape clears the search", () => {
    render();
    const input = $(".cn-search input") as HTMLInputElement;
    type(input, "lin");
    act(() => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      );
    });
    expect(input.value).toBe("");
  });
});

describe("the cards", () => {
  it("are glass, with the pill the state calls for", () => {
    oneAndOutlook();
    render();
    const gcal = $("[data-cn-card='google-calendar']");
    expect(gcal.className).toContain("px-glass");
    expect(gcal.className).toContain("cn-c");
    expect(gcal.querySelector("[data-cn-pill]")?.textContent).toBe("Connected");
    expect(gcal.querySelector("[data-cn-account]")?.textContent).toBe(
      "me@example.com"
    );
    // Not connected: the kind line and a Connect button, no pill.
    const notion = $("[data-cn-card='notion']");
    expect(notion.querySelector("[data-cn-pill]")).toBeNull();
    expect(notion.querySelector(".cn-c-kind")?.textContent).toBe("Notes");
    expect(notion.querySelector("[data-cn-connect]")?.textContent).toBe(
      "Connect"
    );
  });
  it("a card that lost access says so and offers Reconnect", () => {
    oneAndOutlook();
    render();
    const down = $("[data-cn-card='outlook-mail']");
    expect(down.className).toContain("is-down");
    expect(down.dataset.state).toBe("disconnected");
    expect(down.querySelector("[data-cn-pill]")?.textContent).toBe(
      "Needs attention"
    );
    expect(down.querySelector("[data-cn-meta]")?.textContent).toBe(
      "Token expired · last sync 06:12"
    );
    expect(down.querySelector("[data-cn-reconnect]")?.textContent).toBe(
      "Reconnect"
    );
    expect(down.querySelector("[data-cn-more]")).toBeNull();
  });
  it("draws no Free mail cap: the Free plan has no mailboxes, so there is no '1 mail account' rule to state", () => {
    planKind = "free";
    render();
    expect($("[data-cn-limit]")).toBeNull();
    expect($("[data-cn-upgrade]")).toBeNull();
    expect(host.textContent).not.toContain("1 mail account");
  });
  it("the menu of a connected card opens in the portal layer and offers Disconnect", () => {
    accountsData = [acct({})];
    render();
    click($("[data-cn-more='google-calendar']"));
    const menu = document.querySelector("[data-cn-menu]") as HTMLElement;
    expect(menu).not.toBeNull();
    expect(host.contains(menu)).toBe(true); // V3PortalScope sits in the host
    expect(host.querySelector("[data-v3-portals]")?.contains(menu)).toBe(true);
    expect(menu.querySelector("[data-cn-disconnect]")?.textContent).toBe(
      "Disconnect…"
    );
  });
  it("Sync now in the menu queues that calendar account's sync and says it started", async () => {
    syncAccountNow.mockResolvedValue({ ok: true, queued: 2 });
    accountsData = [acct({})];
    render();
    click($("[data-cn-more='google-calendar']"));
    const item = document.querySelector("[data-cn-sync]") as HTMLElement;
    expect(item.textContent).toContain("Sync now");
    click(item);
    await flush();
    expect(syncAccountNow).toHaveBeenCalledWith("calendar", "a1");
    expect(notify.success).toHaveBeenCalledWith("Syncing Google Calendar…");
  });
  it("a sync that cannot start shows the reason", async () => {
    syncAccountNow.mockResolvedValue({ ok: false, error: "Not configured" });
    accountsData = [acct({})];
    render();
    click($("[data-cn-more='google-calendar']"));
    click(document.querySelector("[data-cn-sync]"));
    await flush();
    expect(notify.error).toHaveBeenCalledWith("Not configured");
  });
});

describe("the AI tools tab", () => {
  it("on Free is one glass panel; its buttons go to the paywall", () => {
    planKind = "free";
    window.localStorage.setItem("needt.connections.tab", "ai");
    render();
    const promo = $("[data-cn-ai-promo]");
    expect(promo.className).toContain("px-glass");
    expect(promo.querySelector(".cn-promo-title")?.textContent).toBe(
      "Bring Needt into your AI tools"
    );
    // No filter bar, no cards on Free.
    expect($(".cn-bar")).toBeNull();
    expect($("[data-cn-card]")).toBeNull();
    click($("[data-cn-promo-try]"));
    expect(openPaywall).toHaveBeenLastCalledWith("AI tools");
    click($("[data-cn-promo-plans]"));
    expect(openPaywall).toHaveBeenLastCalledWith();
  });
  it("on a paid plan lists the six tools; OAuth ones wait for the sign-in host", async () => {
    planKind = "monthly";
    window.localStorage.setItem("needt.connections.tab", "ai");
    render();
    await flush();
    expect($("[data-cn-ai-promo]")).toBeNull();
    expect($(".cn-bar")).not.toBeNull();
    expect($(".cn-chip")).toBeNull();
    expect(cards()).toEqual([
      "claude",
      "chatgpt",
      "cursor",
      "gemini",
      "perplexity",
      "othermcp",
    ]);
    // The OAuth host (mcp.needt.app) is live: the canonical URL is the default.
    expect(($("[data-cn-connect=claude]") as HTMLButtonElement).disabled).toBe(
      false
    );
    expect(($("[data-cn-connect=cursor]") as HTMLButtonElement).disabled).toBe(
      false
    );
    expect(text("[data-cn-status]")).toBe("No AI tools connected yet");
  });
  it("creates a token once, shows the ready command, and rotating warns", async () => {
    planKind = "monthly";
    window.localStorage.setItem("needt.connections.tab", "ai");
    render();
    await flush();
    click($("[data-cn-connect=othermcp]"));
    expect(
      document.body.querySelector("[data-cn-steps=othermcp]")
    ).not.toBeNull();
    click(document.body.querySelector("[data-cn-genkey]"));
    await flush();
    expect(fetchMock).toHaveBeenCalledWith("/api/connector-settings", {
      method: "POST",
    });
    expect(
      document.body.querySelector("[data-cn-token=shown]")?.textContent
    ).toBe("needt_secret_token_123");
    const code = document.body.querySelector("[data-cn-code]")?.textContent;
    expect(code).toContain("claude mcp add --transport http needt");
    expect(code).toContain("/api/mcp");
    expect(code).not.toContain("needt_secret_token_123"); // masked on screen
    expect(document.body.textContent).toContain("disconnects every agent");
  });
  it("lists connected apps, Connected hides tools without one, Disconnect deletes", async () => {
    planKind = "monthly";
    window.localStorage.setItem("needt.connections.tab", "ai");
    appsData = [
      {
        id: "g1",
        clientName: "Claude",
        scopes: ["needt.read"],
        connectedAt: "2026-10-01T00:00:00Z",
        lastUsedAt: null,
      },
    ];
    render();
    await flush();
    expect($$("[data-cn-app]").length).toBe(1);
    click($("[data-cn-show=connected]"));
    expect(cards()).toEqual(["claude"]);
    expect($("[data-cn-card=claude]").dataset.state).toBe("connected");
    click($("[data-cn-app-bye=g1]"));
    await flush();
    expect(fetchMock).toHaveBeenCalledWith("/api/oauth/connected-apps/g1", {
      method: "DELETE",
    });
    expect($$("[data-cn-app]").length).toBe(0);
    expect($("[data-cn-ai-soon]")).not.toBeNull();
  });
});

describe("the grid is 3 / 2 / 1 columns", () => {
  const css = readFileSync(
    join(process.cwd(), "src/styles/v3-overrides/connections-desktop.css"),
    "utf8"
  );
  /** grid-template-columns of `.cn-grid` inside the given at-rule chain. */
  const columns = (...chain: string[]) => {
    let found: string | undefined;
    postcss.parse(css).walkRules(".needt-v3 .cn-grid", (rule) => {
      const at: string[] = [];
      for (
        let p: postcss.Container | postcss.Document | undefined = rule.parent;
        p && p.type === "atrule";
        p = (p as postcss.AtRule).parent
      )
        at.unshift(
          `${(p as postcss.AtRule).name} ${(p as postcss.AtRule).params}`
        );
      if (at.join("|") === chain.join("|"))
        rule.walkDecls("grid-template-columns", (d) => {
          found = d.value;
        });
    });
    return found;
  };
  it("one column by default", () => {
    expect(columns()).toBe("minmax(0, 1fr)");
  });
  it("two from 600 px of window, whatever the viewport", () => {
    expect(columns("container cn (min-width: 600px)")).toBe(
      "repeat(2, minmax(0, 1fr))"
    );
  });
  it("three from 900 px of window on a screen 1280 px wide", () => {
    expect(
      columns("media (min-width: 1280px)", "container cn (min-width: 900px)")
    ).toBe("repeat(3, minmax(0, 1fr))");
  });
  it("the page is at most 1080 px wide and centred", () => {
    const page: Record<string, string> = {};
    postcss.parse(css).walkRules(".needt-v3 .cn-page", (r) => {
      if (r.parent?.type !== "root") return;
      r.walkDecls((d) => {
        page[d.prop] = d.value;
      });
    });
    expect(page["max-width"]).toBe("1080px");
    expect(page.margin).toBe("0 auto");
  });
});

describe("connectors this server cannot start", () => {
  const unset = {
    ...entry("todoist", "Todoist", "notes"),
    configured: false,
    requires: "COMPOSIO_API_KEY in the server environment",
  };
  it("are not drawn for a normal person, who could do nothing with them", () => {
    catalogRows = [...CATALOG, unset];
    render();
    expect(cards()).not.toContain("todoist");
    expect(cards()).toHaveLength(ALL);
  });
  it("are drawn for the admin, who can set them up", () => {
    catalogRows = [...CATALOG, unset];
    viewerIsAdmin = true;
    render();
    expect(cards()).toContain("todoist");
  });
});
