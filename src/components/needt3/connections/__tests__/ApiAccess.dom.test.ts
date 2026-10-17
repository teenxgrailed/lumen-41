/**
 * @jest-environment jsdom
 *
 * The Needt API tile's sheet: where a person makes an access token, the MCP
 * address to copy, and the connector API docs.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { API_DOCS_URL, ApiAccess } from "../ApiAccess";
import type { McpConnect } from "../useMcpConnect";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/lib/notifications", () => ({
  notify: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const makeToken = jest.fn();
const mcp = {
  apps: [],
  failed: false,
  reload: jest.fn(),
  hasToken: false,
  token: null,
  making: false,
  makeToken,
  disconnectApp: jest.fn(),
  url: "https://use.needt.app/api/mcp",
  oauthUrl: "https://mcp.needt.app/mcp",
} as unknown as McpConnect;

let host: HTMLElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(h(ApiAccess, { mcp })));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("the Needt API sheet", () => {
  it("shows the MCP URL with a copy button", () => {
    const urls = [...host.querySelectorAll("[data-cn-url]")].map(
      (n) => n.textContent
    );
    expect(urls).toContain("https://mcp.needt.app/mcp");
    expect(host.querySelectorAll("[data-cn-copy-url]").length).toBe(2);
  });

  it("creates an access token through the existing route's hook", () => {
    const button = host.querySelector<HTMLButtonElement>("[data-cn-genkey]");
    expect(button?.textContent).toContain("Create token");
    act(() => button?.click());
    expect(makeToken).toHaveBeenCalledTimes(1);
  });

  it("links to the connector API docs", () => {
    const a = host.querySelector<HTMLAnchorElement>("[data-cn-api-docs]");
    expect(a?.href).toBe(API_DOCS_URL);
    expect(API_DOCS_URL).toMatch(/docs\/connector-api\.md$/);
  });
});
