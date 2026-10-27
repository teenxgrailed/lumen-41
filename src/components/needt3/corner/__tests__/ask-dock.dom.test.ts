/**
 * @jest-environment jsdom
 *
 * The docked Ask panel behaves like the left rail: the store toggles it, its
 * width is the person's (dragged or keyed from the left edge, kept in range)
 * and both the width and an open panel are remembered.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import {
  CHAT_DOCK_MAX,
  CHAT_DOCK_MIN,
  CHAT_DOCK_W,
  clampDockW,
} from "@/lib/assistant-position";

import { useNeedt3Ui } from "@/store/needt3-ui";

import { ChatDockSlot } from "../ChatDockSlot";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

const slot = () => host.querySelector<HTMLElement>("[data-chat-dock]")!;
const edge = () => host.querySelector<HTMLElement>("[data-chat-dock-edge]");
const row = () => host.querySelector<HTMLElement>(".shell-app-row")!;
const ui = () => useNeedt3Ui.getState();
const stored = () =>
  JSON.parse(window.localStorage.getItem("needt3-ui") ?? "{}").state ?? {};

function mount() {
  act(() =>
    root.render(
      h(
        "div",
        { className: "shell-app-row" },
        h(ChatDockSlot, { phone: false, narrow: false, slotRef: null })
      )
    )
  );
}
const press = (key: string) =>
  act(() => {
    edge()!.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })
    );
  });

beforeEach(() => {
  window.localStorage.clear();
  act(() => {
    ui().setAskOpen(false);
    ui().setAskRemembered(false);
    ui().setAskWidth(CHAT_DOCK_W);
  });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("docked Ask panel", () => {
  it("toggles the column open and shut at the remembered width", () => {
    mount();
    expect(slot().style.width).toBe("0px");
    expect(edge()).toBeNull();
    act(() => ui().setAskWidth(340));
    act(() => ui().setAskOpen(true));
    expect(slot().style.width).toBe("340px");
    expect(edge()).not.toBeNull();
    expect(row().style.getPropertyValue("--ask-w")).toBe("340px");
    act(() => ui().setAskOpen(false));
    expect(slot().style.width).toBe("0px");
    expect(edge()).toBeNull();
  });

  it("keeps the width inside the rail-like bounds", () => {
    expect(clampDockW(10)).toBe(CHAT_DOCK_MIN);
    expect(clampDockW(5000)).toBe(CHAT_DOCK_MAX);
    expect(clampDockW(Number.NaN)).toBe(CHAT_DOCK_W);
    expect(clampDockW("wide")).toBe(CHAT_DOCK_W);
    act(() => ui().setAskWidth(5000));
    expect(ui().askWidth).toBe(CHAT_DOCK_MAX);
  });

  it("is resized from the left edge with the arrow keys and reset by a double click", () => {
    mount();
    act(() => ui().setAskOpen(true));
    press("ArrowLeft");
    expect(ui().askWidth).toBe(CHAT_DOCK_W + 16);
    expect(slot().style.width).toBe(`${CHAT_DOCK_W + 16}px`);
    press("ArrowRight");
    press("ArrowRight");
    expect(ui().askWidth).toBe(CHAT_DOCK_W - 16);
    press("End");
    expect(ui().askWidth).toBe(CHAT_DOCK_MAX);
    act(() => {
      edge()!.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    expect(ui().askWidth).toBe(CHAT_DOCK_W);
  });

  it("remembers the width and whether it was left open", () => {
    act(() => ui().setAskWidth(412));
    act(() => ui().setAskRemembered(true));
    expect(stored().askWidth).toBe(412);
    expect(stored().askRemembered).toBe(true);
    // The open flag itself is per visit: it is restored from the memory.
    expect(stored().askOpen).toBeUndefined();
  });
});
