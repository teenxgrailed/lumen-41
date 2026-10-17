/**
 * @jest-environment jsdom
 *
 * The Ask panel's dock slot: its width changes in one step (a width
 * transition re-lays-out the page beside it on every frame, which was the
 * stutter), it reads `askOpen` itself so the shell around it does not
 * re-render, and on the way out it waits for the card to leave.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { CHAT_DOCK_W } from "@/lib/assistant-position";

import { useNeedt3Ui } from "@/store/needt3-ui";

import { ChatDockSlot } from "../ChatDockSlot";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
let shellRenders = 0;

/** Stands for V3Shell: renders the slot and counts its own renders. */
function Shell({ phone = false, narrow = false }) {
  shellRenders += 1;
  return h(ChatDockSlot, { phone, narrow, slotRef: null });
}
const slot = () => host.querySelector<HTMLElement>("[data-chat-dock]")!;
const ask = (open: boolean) =>
  act(() => void useNeedt3Ui.getState().setAskOpen(open));

beforeEach(() => {
  jest.useFakeTimers();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (q: string) => ({
      matches: false,
      media: q,
      addEventListener() {},
      removeEventListener() {},
    }),
  });
  useNeedt3Ui.getState().setAskOpen(false);
  shellRenders = 0;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  jest.useRealTimers();
});

describe("ChatDockSlot", () => {
  it("is shut at rest and opens to the dock width in one step, with no transition", () => {
    act(() => root.render(h(Shell)));
    expect(slot().style.width).toBe("0px");
    ask(true);
    expect(slot().style.width).toBe(`${CHAT_DOCK_W}px`);
    expect(slot().style.transition).toBe("");
    expect(slot().style.willChange).toBe("");
  });

  it("gives the width back at once and stops clipping, so the card can leave over the page", () => {
    act(() => root.render(h(Shell)));
    ask(true);
    expect(slot().style.overflow).toBe("hidden");
    ask(false);
    expect(slot().style.width).toBe("0px");
    expect(slot().style.overflow).toBe("visible");
  });

  it("tells the row which way it moved, in the same commit", () => {
    act(() => root.render(h("div", { className: "shell-app-row" }, h(Shell))));
    const row = host.querySelector<HTMLElement>(".shell-app-row")!;
    expect(row.dataset.motion).toBeUndefined();
    ask(true);
    expect(row.dataset.motion).toBe("dock-in");
    ask(false);
    expect(row.dataset.motion).toBe("dock-out");
  });

  it("stays 0 on the phone and below 1100 px (the panel is a sheet there)", () => {
    act(() => root.render(h(Shell, { narrow: true })));
    ask(true);
    expect(slot().style.width).toBe("0px");
    act(() => root.render(h(Shell, { phone: true })));
    expect(slot().style.width).toBe("0px");
  });

  it("opening and closing do not re-render the component that holds it", () => {
    act(() => root.render(h(Shell)));
    const before = shellRenders;
    ask(true);
    ask(false);
    expect(shellRenders).toBe(before);
  });
});
