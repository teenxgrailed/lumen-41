/**
 * @jest-environment jsdom
 *
 * The top bar registers two empty elements for the editor's header controls;
 * the editor reads them, and falls back to its own header when they go.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { setDocHeadSlot, useDocHeadSlots } from "../doc-head-slot";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
let seen: ReturnType<typeof useDocHeadSlots>;
function Probe() {
  seen = useDocHeadSlots();
  return null;
}

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(h(Probe)));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  setDocHeadSlot("status", null);
  setDocHeadSlot("more", null);
});

describe("doc head slots", () => {
  it("are empty until the top bar registers them, then follow it", () => {
    expect(seen).toEqual({ status: null, more: null });
    const a = document.createElement("span");
    const b = document.createElement("span");
    act(() => {
      setDocHeadSlot("status", a);
      setDocHeadSlot("more", b);
    });
    expect(seen.status).toBe(a);
    expect(seen.more).toBe(b);
    act(() => setDocHeadSlot("status", null));
    expect(seen.status).toBeNull();
    expect(seen.more).toBe(b);
  });

  it("setting the same element again changes nothing", () => {
    const a = document.createElement("span");
    act(() => setDocHeadSlot("status", a));
    const before = seen;
    act(() => setDocHeadSlot("status", a));
    expect(seen).toBe(before);
  });
});
