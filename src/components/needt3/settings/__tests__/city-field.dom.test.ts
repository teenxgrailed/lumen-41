/**
 * @jest-environment jsdom
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { CityField } from "../CityField";
import { PREF_DEFAULTS } from "../derive";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
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

const input = () => host.querySelector("input") as HTMLInputElement;
const type = (el: HTMLInputElement, value: string) => {
  const set = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )?.set;
  set?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
};

it("is empty by default, so Home shows no weather line", () => {
  expect(PREF_DEFAULTS.city).toBe("");
});

it("saves the tidied city when the field is left, not on every key", async () => {
  const onSave = jest.fn();
  await act(async () => root.render(h(CityField, { value: "", onSave })));
  await act(async () => type(input(), "  New   York "));
  expect(onSave).not.toHaveBeenCalled();
  await act(async () => {
    input().dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  });
  expect(onSave).toHaveBeenCalledWith("New York");
});

it("does not save an unchanged city, and can be cleared", async () => {
  const onSave = jest.fn();
  await act(async () => root.render(h(CityField, { value: "Kyiv", onSave })));
  await act(async () => {
    input().dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  });
  expect(onSave).not.toHaveBeenCalled();
  await act(async () => type(input(), ""));
  await act(async () => {
    input().dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  });
  expect(onSave).toHaveBeenCalledWith("");
});

it("stays off until the settings are known", async () => {
  await act(async () =>
    root.render(h(CityField, { value: "", disabled: true, onSave: jest.fn() }))
  );
  expect(input().disabled).toBe(true);
});
