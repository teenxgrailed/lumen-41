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

const makeToken = jest.fn().mockResolvedValue(true);
const mcp = {
  apps: [],
  failed: false,
  reload: jest.fn(),
  hasToken: false,
  tokens: [],
  token: null,
  tokenName: null,
  making: false,
  makeToken,
  revokeToken: jest.fn(),
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

  it("asks for a name, then creates a named token through the hook", async () => {
    act(() =>
      host.querySelector<HTMLButtonElement>("[data-cn-newkey]")?.click()
    );
    const input = host.querySelector<HTMLInputElement>("#cn-token-name");
    expect(input?.placeholder).toBe("Chrome");
    const button = host.querySelector<HTMLButtonElement>("[data-cn-genkey]");
    expect(button?.disabled).toBe(true);
    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )?.set?.call(input, " Grok Bot ");
      input?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      host.querySelector<HTMLButtonElement>("[data-cn-genkey]")?.click();
    });
    expect(makeToken).toHaveBeenCalledWith("Grok Bot");
  });

  it("links to the connector API docs", () => {
    const a = host.querySelector<HTMLAnchorElement>("[data-cn-api-docs]");
    expect(a?.href).toBe(API_DOCS_URL);
    expect(API_DOCS_URL).toBe("https://needt.app/resources/api/");
  });
});
