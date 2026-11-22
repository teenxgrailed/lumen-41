/**
 * @jest-environment jsdom
 *
 * An agent's tile is its real brand mark, or the generic plug tile: never a
 * letter (owner, 20.11.26).
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { AgentIcon, agentBrandId } from "../AgentIcon";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLElement;
let root: Root;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const mark = (name: string) => {
  act(() => {
    root.render(h(AgentIcon, { name, size: 32 }));
  });
  return host
    .querySelector("[data-brand-icon]")
    ?.getAttribute("data-brand-icon");
};

describe("AgentIcon", () => {
  it("knows Grok, Codex and the rest by name", () => {
    expect(agentBrandId("Grok Bot")).toBe("grok");
    expect(agentBrandId("grok-hub-worker")).toBe("grok");
    expect(agentBrandId("Codex")).toBe("openai");
    expect(agentBrandId("Claude Desktop")).toBe("claude");
    expect(agentBrandId("my-script")).toBeNull();
  });

  it("wears a brand mark for a known agent", () => {
    expect(mark("Grok")).toBe("grok");
    expect(mark("Claude")).toBe("claude");
  });

  it("wears the generic plug, not a letter, for an agent we have no mark for", () => {
    expect(mark("Hermes")).toBe("generic");
    expect(host.textContent).toBe("");
    expect(host.querySelector(".ag-mono")).toBeNull();
  });
});
