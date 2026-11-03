/**
 * @jest-environment jsdom
 *
 * The style panel's popovers are portalled away from their triggers, so Tab
 * alone never reaches them: opening one moves focus inside, and Escape closes
 * it and hands focus back to the trigger.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { V3PortalScope } from "../../ctx/PortalScope";
import { DcPop } from "../StylePanel";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() =>
    root.render(
      h(
        V3PortalScope,
        null,
        h(DcPop, {
          width: 240,
          label: "Font",
          trigger: () => h("button", { type: "button", id: "trig" }, "Font"),
          children: () => h("button", { type: "button", id: "first" }, "Serif"),
        })
      )
    )
  );
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const trig = () => document.getElementById("trig") as HTMLButtonElement;

describe("DcPop", () => {
  it("moves focus into the popover when it opens", () => {
    act(() => trig().click());
    expect(document.activeElement?.id).toBe("first");
  });

  it("closes on Escape and gives focus back to the trigger", () => {
    act(() => trig().click());
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(document.activeElement).toBe(trig());
  });
});
