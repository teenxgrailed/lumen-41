/**
 * @jest-environment jsdom
 *
 * Settings, Memories: "Let Needt learn about me" is off until turned on, the
 * list shows each line with its source and date, lines can be edited and
 * deleted, "Forget all" empties the list, and turning the switch off asks
 * whether to keep or delete what was learned.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import type { MemoriesState } from "@/lib/needt3/hooks/memories";

import { MemoriesGroup } from "../MemoriesGroup";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let state: MemoriesState | undefined;
const setEnabled = jest.fn();
const edit = jest.fn();
const forget = jest.fn();

jest.mock("@/lib/needt3/hooks/memories", () => ({
  useMemories: () => ({ data: state }),
  useMemoryActions: () => ({
    setEnabled: { mutate: setEnabled, isPending: false },
    edit: { mutate: edit, isPending: false },
    forget: { mutate: forget, isPending: false },
  }),
}));
jest.mock("@/lib/notifications", () => ({ notify: { error: jest.fn() } }));

const LINES: MemoriesState["memories"] = [
  {
    id: "m1",
    kind: "preference",
    content: "No meetings before 10",
    source: "chat",
    createdAt: "2026-10-01T12:00:00.000Z",
    updatedAt: "2026-10-02T12:00:00.000Z",
  },
  {
    id: "m2",
    kind: "pattern",
    content: "Usually finishes focused work between 09:00 and 12:00.",
    source: "habit",
    createdAt: "2026-10-03T12:00:00.000Z",
    updatedAt: "2026-10-03T12:00:00.000Z",
  },
];

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  jest.clearAllMocks();
  state = { enabled: false, memories: [] };
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const render = () => act(() => root.render(h(MemoriesGroup)));
const toggle = () =>
  host.querySelector<HTMLInputElement>('input[role="switch"]')!;
const button = (label: string) =>
  Array.from(host.querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === label
  );
const click = (el: Element | undefined) => {
  expect(el).toBeDefined();
  act(() => el!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
};

it("is off by default and says nothing was learned", () => {
  render();
  expect(toggle().checked).toBe(false);
  expect(toggle().getAttribute("aria-label")).toBe("Let Needt learn about me");
  expect(host.textContent).toContain("Nothing learned yet");
  expect(host.textContent).toContain("Turn the switch on");
  expect(button("Forget all")).toBeUndefined();
});

it("turns on straight away, with nothing to keep or delete", () => {
  render();
  click(toggle());
  expect(setEnabled).toHaveBeenCalledWith(
    { enabled: true },
    expect.any(Object)
  );
});

it("lists every line with its source and date", () => {
  state = { enabled: true, memories: LINES };
  render();
  expect(toggle().checked).toBe(true);
  const text = host.textContent ?? "";
  expect(text).toContain("No meetings before 10");
  expect(text).toContain("You told Ask");
  expect(text).toContain("Your work habits");
  expect(text).toMatch(/Oct\w* 2, 2026|2 Oct\w* 2026/);
});

it("stays readable with the switch off", () => {
  state = { enabled: false, memories: LINES };
  render();
  expect(toggle().checked).toBe(false);
  expect(host.textContent).toContain("No meetings before 10");
  expect(button("Delete")).toBeDefined();
});

it("deletes one line", () => {
  state = { enabled: true, memories: LINES };
  render();
  click(button("Delete"));
  expect(forget).toHaveBeenCalledWith({ memoryId: "m1" }, expect.any(Object));
});

it("edits a line and saves the new text", () => {
  state = { enabled: true, memories: LINES };
  render();
  click(button("Edit"));
  const input = host.querySelector<HTMLInputElement>(
    'input[aria-label="Memory"]'
  )!;
  expect(input.value).toBe("No meetings before 10");
  const set = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )!.set!;
  act(() => {
    set.call(input, "No meetings before 11");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  click(button("Save"));
  expect(edit).toHaveBeenCalledWith(
    { memoryId: "m1", content: "No meetings before 11" },
    expect.any(Object)
  );
});

it("forgets all", () => {
  state = { enabled: true, memories: LINES };
  render();
  click(button("Forget all"));
  expect(forget).toHaveBeenCalledWith({ all: true }, expect.any(Object));
});

describe("turning the switch off with memories on the list", () => {
  beforeEach(() => {
    state = { enabled: true, memories: LINES };
    render();
    click(toggle());
  });

  it("asks first and changes nothing yet", () => {
    expect(host.textContent).toContain("Keep what Needt learned?");
    expect(host.textContent).toContain("2 memories");
    expect(setEnabled).not.toHaveBeenCalled();
  });

  it("keeps them", () => {
    click(button("Keep them"));
    expect(setEnabled).toHaveBeenCalledWith(
      { enabled: false, memories: "keep" },
      expect.any(Object)
    );
    expect(host.textContent).not.toContain("Keep what Needt learned?");
  });

  it("deletes them", () => {
    click(button("Delete them"));
    expect(setEnabled).toHaveBeenCalledWith(
      { enabled: false, memories: "delete" },
      expect.any(Object)
    );
  });

  it("cancels and leaves the switch on", () => {
    click(button("Cancel"));
    expect(setEnabled).not.toHaveBeenCalled();
    expect(host.textContent).not.toContain("Keep what Needt learned?");
    expect(toggle().checked).toBe(true);
  });
});
