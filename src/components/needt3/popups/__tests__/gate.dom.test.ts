/**
 * @jest-environment jsdom
 *
 * canShowPopup on the phone: shut sheets stay mounted as inert dialogs (so
 * they can slide back) and must not block a popup; an open one still does.
 */
import { canShowPopup } from "../gate";

afterEach(() => {
  document.body.innerHTML = "";
  window.sessionStorage.clear();
});

function dialog(inert: boolean) {
  const layer = document.createElement("div");
  if (inert) layer.setAttribute("inert", "");
  const el = document.createElement("div");
  el.setAttribute("role", "dialog");
  layer.appendChild(el);
  document.body.appendChild(layer);
}

describe("canShowPopup and dialogs", () => {
  it("is free with no dialog", () => {
    expect(canShowPopup()).toBe(true);
  });

  it("ignores a shut sheet that stays mounted inert", () => {
    dialog(true);
    expect(canShowPopup()).toBe(true);
  });

  it("is blocked by an open dialog", () => {
    dialog(false);
    expect(canShowPopup()).toBe(false);
  });
});
