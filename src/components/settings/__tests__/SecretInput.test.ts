/**
 * @jest-environment jsdom
 */
import { act, createElement } from "react";

import { type Root, createRoot } from "react-dom/client";

import { SecretInput } from "@/components/settings/SecretInput";
import { secretToCommit } from "@/components/settings/secret-field";

import { SECRET_MASK } from "@/lib/api/public-records";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("secretToCommit", () => {
  it("sends a newly typed value", () => {
    expect(secretToCommit(SECRET_MASK, "new-secret-value")).toBe(
      "new-secret-value"
    );
  });

  it("sends nothing when the field was left as it was", () => {
    expect(secretToCommit(SECRET_MASK, SECRET_MASK)).toBeNull();
    expect(secretToCommit("", "")).toBeNull();
  });

  it("sends nothing for an edit of the mask", () => {
    expect(secretToCommit(SECRET_MASK, `${SECRET_MASK}b`)).toBeNull();
  });

  it("sends an empty string when the person cleared the field", () => {
    expect(secretToCommit(SECRET_MASK, "")).toBe("");
  });
});

describe("SecretInput", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function render(stored: string, onCommit: (value: string) => void) {
    act(() => {
      root.render(createElement(SecretInput, { stored, onCommit }));
    });
    return container.querySelector("input") as HTMLInputElement;
  }

  function type(input: HTMLInputElement, value: string) {
    const setValue = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!;
    act(() => {
      setValue.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  it("saves the whole typed secret once, on blur", () => {
    const onCommit = jest.fn();
    const input = render(SECRET_MASK, onCommit);
    expect(input.value).toBe(SECRET_MASK);

    act(() => input.focus());
    let typed = "";
    for (const char of "new-secret-value") {
      typed += char;
      type(input, typed);
      // The store receives the mask again while the person is typing (the
      // bug: it used to land in the field and swallow the next keystroke).
      render(SECRET_MASK, onCommit);
      expect(input.value).toBe(typed);
    }
    expect(onCommit).not.toHaveBeenCalled();

    act(() => input.blur());

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("new-secret-value");
    expect(input.value).toBe(SECRET_MASK);
  });

  it("saves on Enter", () => {
    const onCommit = jest.fn();
    const input = render("", onCommit);

    act(() => input.focus());
    type(input, "resend-key-value");
    act(() => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      );
    });

    expect(onCommit).toHaveBeenCalledWith("resend-key-value");
  });

  it("does not save when the field is only focused and left", () => {
    const onCommit = jest.fn();
    const input = render(SECRET_MASK, onCommit);

    act(() => input.focus());
    act(() => input.blur());

    expect(onCommit).not.toHaveBeenCalled();
  });
});
