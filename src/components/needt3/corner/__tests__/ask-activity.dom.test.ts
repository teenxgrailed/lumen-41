/**
 * @jest-environment jsdom
 *
 * What Ask did: a list of changes with Undo, Undo all for two or more, links
 * only to app paths, and the tool progress line while it runs.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { AskActivity, AskText, safeAppHref } from "../AskActivity";
import { readLines } from "../stream";
import type { AskMessage } from "../useAskNeedt";

const G = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
G.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: import("react").ReactNode;
    className?: string;
  }) =>
    jest
      .requireActual<typeof import("react")>("react")
      .createElement("a", { href, className }, children),
}));

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

const message = (extra: Partial<AskMessage> = {}): AskMessage => ({
  id: "m1",
  from: "needt",
  text: "",
  at: 0,
  runId: "run-1",
  actions: [
    {
      actionId: "a1",
      label: "Created task “Call bank”",
      href: "/tasks?taskId=t1",
      undoable: true,
      state: "applied",
    },
    {
      actionId: "a2",
      label: "Moved “Report” to 2026-10-30",
      undoable: true,
      state: "applied",
    },
  ],
  ...extra,
});

describe("Ask activity", () => {
  it("lists what it did, each with Undo, and Undo all for the run", () => {
    const onUndo = jest.fn();
    const onUndoAll = jest.fn();
    act(() =>
      root.render(
        h(AskActivity, { message: message(), busy: false, onUndo, onUndoAll })
      )
    );
    expect(host.querySelectorAll("[data-ask-undo]")).toHaveLength(2);
    expect(host.querySelector("a[href='/tasks?taskId=t1']")).not.toBeNull();

    act(() =>
      host
        .querySelector<HTMLButtonElement>("[data-ask-undo='a2']")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    );
    expect(onUndo).toHaveBeenCalledWith("m1", "a2");

    act(() =>
      host
        .querySelector<HTMLButtonElement>("[data-ask-undo-all]")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    );
    expect(onUndoAll).toHaveBeenCalledWith("m1", "run-1");
  });

  it("shows an undone or conflicting action as a state, not a button", () => {
    const base = message();
    act(() =>
      root.render(
        h(AskActivity, {
          message: {
            ...base,
            actions: [
              { ...base.actions![0], state: "undone" },
              { ...base.actions![1], state: "conflict" },
            ],
          },
          busy: false,
          onUndo: jest.fn(),
          onUndoAll: jest.fn(),
        })
      )
    );
    expect(host.querySelectorAll("[data-ask-undo]")).toHaveLength(0);
    expect(host.querySelector("[data-ask-undo-all]")).toBeNull();
    expect(host.textContent).toContain("Undone");
    expect(host.textContent).toContain("Changed since");
  });

  it("names the running tool while busy", () => {
    act(() =>
      root.render(
        h(AskActivity, {
          message: message({
            actions: [],
            tools: [
              {
                id: "1",
                name: "list_tasks",
                label: "Looking at your tasks",
                status: "running",
              },
            ],
          }),
          busy: true,
          onUndo: jest.fn(),
          onUndoAll: jest.fn(),
        })
      )
    );
    expect(host.querySelector("[data-ask-running]")?.textContent).toBe(
      "Looking at your tasks…"
    );
  });

  it("turns app links into links and leaves other targets as text", () => {
    act(() =>
      root.render(
        h(AskText, {
          text: "See [Report](/tasks?taskId=t9) and [x](https://evil.example) and [y](javascript:void0).",
        })
      )
    );
    expect(host.querySelectorAll("a")).toHaveLength(1);
    expect(host.querySelector("a")?.getAttribute("href")).toBe(
      "/tasks?taskId=t9"
    );
    expect(host.textContent).toBe("See Report and x and y.");
    expect(safeAppHref("//evil.example")).toBeNull();
    expect(safeAppHref("/pages/p1")).toBe("/pages/p1");
  });
});

describe("stream lines", () => {
  it("reads tool and done lines", () => {
    const { events } = readLines(
      [
        '{"type":"tool","id":"1","name":"create_task","label":"Creating a task","status":"running"}',
        '{"type":"done","runId":"r","actions":[],"sources":[],"requiresConfirm":false,"changed":true,"taskId":null}',
        "",
      ].join("\n")
    );
    expect(events.map((e) => e.type)).toEqual(["tool", "done"]);
  });
});
