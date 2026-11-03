/**
 * @jest-environment jsdom
 *
 * The Agents screen's "Connect an agent" guide: it replaces the empty state
 * when the account has no agents, stays out of the way once there are some,
 * and is still reachable from the header button.
 */
import { act, createElement as h } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type Root, createRoot } from "react-dom/client";

import { fetchJson } from "@/lib/needt3/hooks/core";

import { AgentsScreen } from "../AgentsScreen";
import { guideSnippets } from "../connect-guide";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock("@/lib/notifications", () => ({
  notify: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));
jest.mock("../MessagesTab", () => ({
  MessagesTab: () => null,
  useHubThreads: () => ({ data: { threads: [] } }),
}));
jest.mock("../../settings/MemoriesGroup", () => ({
  MemoriesGroup: () => null,
}));
jest.mock("../../states/StScreen", () => ({
  StScreen: ({ children }: { children: unknown }) => children,
  PlEmpty: () => null,
}));
jest.mock("@/lib/needt3/hooks/core", () => ({
  fetchJson: jest.fn(),
  sendJson: jest.fn(),
}));

const agent = {
  id: "a1",
  name: "Grok",
  kind: "browser",
  skills: [],
  connection: "idle",
  openItems: 0,
  heldItems: 0,
  lastSeenAt: null,
  token: null,
};

let host: HTMLElement;
let root: Root;

async function mount(agents: unknown[]) {
  (fetchJson as jest.Mock).mockResolvedValue({
    agents,
    items: [],
    notes: [],
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root.render(
      h(QueryClientProvider, { client: qc }, h(AgentsScreen as never))
    );
  });
  // Let the overview query settle (fetch mock -> react-query -> render).
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("Connect an agent guide", () => {
  it("shows the three steps when there are no agents", async () => {
    await mount([]);
    expect(host.querySelector("[data-ag-guide]")).not.toBeNull();
    expect(host.querySelectorAll("[data-ag-snippet]")).toHaveLength(4);
    expect(
      host.querySelector("[data-ag-tokens-link]")?.getAttribute("href")
    ).toBe("/connections");
    expect(host.textContent).toContain("claude mcp add --scope user");
  });

  it("hides the guide when agents exist, and the header button brings it back", async () => {
    await mount([agent]);
    expect(host.querySelector("[data-ag-guide]")).toBeNull();
    const button = Array.from(host.querySelectorAll("button")).find(
      (b) => b.textContent === "Connect an agent"
    );
    expect(button).toBeDefined();
    await act(async () => {
      button!.click();
    });
    expect(host.querySelector("[data-ag-guide]")).not.toBeNull();
  });

  it("uses the app's own MCP URL in every snippet", () => {
    const [code, json, rest] = guideSnippets("https://use.needt.app/");
    expect(code.text).toContain("https://use.needt.app/api/mcp");
    expect(json.text).toContain('"url": "https://use.needt.app/api/mcp"');
    expect(rest.text).toContain("https://use.needt.app/api/connect/");
  });
});
