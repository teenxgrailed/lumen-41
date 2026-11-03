/**
 * @jest-environment jsdom
 *
 * Trash with the rows a real account has: a task whose project is gone, a
 * page with no stamp, a zone the browser does not know, a row that cannot be
 * drawn at all. The screen keeps listing the others; it never takes the route
 * down.
 */
import { act, createElement as h, useState } from "react";

import * as Sentry from "@sentry/nextjs";
import { type Root, createRoot } from "react-dom/client";

import { logger } from "@/lib/logger";

import { V3PortalScope } from "../../ctx/PortalScope";
import { TrashScreen } from "../TrashScreen";
import { trashMeta } from "../derive";
import type { TrashAsk, TrashController } from "../useTrashController";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@sentry/nextjs", () => ({ captureException: jest.fn() }));
jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), debug: jest.fn(), warn: jest.fn() },
}));
jest.mock("../../root/V3Root", () => ({ useDesignV3: () => true }));
jest.mock("../../docs/DocParts", () => ({
  DocThumb: () => null,
  DcMiniPage: () => null,
  useDocTokens: () => () => "",
}));
jest.mock("../PlSceneHeader", () => ({ PlSceneHeader: () => null }));

const ok = <T>(data: T) =>
  ({
    status: "success",
    fetchStatus: "idle",
    data,
    error: null,
    refetch: jest.fn(),
  }) as never;

let host: HTMLDivElement;
let root: Root;
let consoleError: jest.SpyInstance;
beforeEach(() => {
  // React prints a caught render error; the test asserts on it instead.
  consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
  host = document.createElement("div");
  host.className = "needt-v3";
  document.body.appendChild(host);
  root = createRoot(host);
  const render = root.render.bind(root);
  root.render = (el) => render(h(V3PortalScope, null, el));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  consoleError.mockRestore();
  jest.clearAllMocks();
});

const $$ = (sel: string) => Array.from(host.querySelectorAll<HTMLElement>(sel));

function Trash({ over = {} as Partial<TrashController> }) {
  const [ask, setAsk] = useState<TrashAsk | null>(null);
  const c = {
    timeZone: "UTC",
    tasks: ok([]),
    boards: ok([]),
    docs: ok([]),
    dead: [],
    gone: [],
    pages: [],
    projectName: () => undefined,
    restoreTask: jest.fn(),
    restoreBoard: jest.fn(),
    restorePage: jest.fn(),
    emptyCounts: { pages: 0, boards: 0, tasks: 0 },
    runAsk: jest.fn(),
    ask,
    setAsk,
    ...over,
  } as unknown as TrashController;
  return h(TrashScreen, { c });
}

describe("trashMeta", () => {
  it("says something sensible for a missing or broken stamp", () => {
    const now = new Date("2026-11-03T12:00:00Z");
    expect(() => trashMeta(null, now, "UTC")).not.toThrow();
    expect(() => trashMeta(undefined, now, "UTC")).not.toThrow();
    expect(() => trashMeta("not a date", now, "UTC")).not.toThrow();
    expect(trashMeta("not a date", now, "UTC")).toContain("Deleted today");
  });

  it("does not throw on a time zone the runtime does not know", () => {
    const now = new Date("2026-11-03T12:00:00Z");
    expect(() =>
      trashMeta("2026-10-01T09:00:00.000Z", now, "Mars/Olympus")
    ).not.toThrow();
    expect(
      trashMeta("2026-10-01T09:00:00.000Z", now, "Mars/Olympus")
    ).toContain("2026-10-01");
  });
});

describe("TrashScreen with imperfect rows", () => {
  it("draws a task with no stamp, a task from a deleted project, and an old one in an odd zone", () => {
    act(() =>
      root.render(
        h(Trash, {
          over: {
            timeZone: "Mars/Olympus",
            dead: [
              {
                id: "t1",
                title: "No stamp",
                trashedAt: null,
                projectId: "gone",
              },
              {
                id: "t2",
                title: "Old",
                trashedAt: "2026-09-01T09:00:00.000Z",
                projectId: null,
              },
              { id: "t3", title: "", trashedAt: undefined, projectId: null },
            ],
          } as unknown as Partial<TrashController>,
        })
      )
    );
    expect($$(".pl-trash-row")).toHaveLength(3);
    expect($$(".pl-trash-title").map((e) => e.textContent)).toEqual([
      "No stamp",
      "Old",
      "Untitled",
    ]);
    // A lone Tasks list keeps its heading and never prints a stray "0".
    expect($$(".pl-trash-h").map((e) => e.textContent)).toEqual(["Tasks"]);
    expect(host.innerHTML).not.toMatch(/>0</);
  });

  it("skips one row that cannot be drawn, keeps the rest restorable, and logs it", () => {
    const restoreTask = jest.fn();
    act(() =>
      root.render(
        h(Trash, {
          over: {
            restoreTask,
            dead: [
              { id: "good", title: "Fine", trashedAt: null, projectId: null },
              // A title that is not text: drawing this row throws.
              {
                id: "bad",
                title: { not: "text" },
                trashedAt: null,
                projectId: null,
              },
            ],
          } as unknown as Partial<TrashController>,
        })
      )
    );
    expect($$(".pl-trash-row")).toHaveLength(1);
    expect($$(".pl-trash-title")[0].textContent).toBe("Fine");
    act(() => {
      host
        .querySelector<HTMLElement>(".pl-trash-row .nx-btn-secondary")!
        .click();
    });
    expect(restoreTask).toHaveBeenCalledWith("good", "Fine");
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      "A Trash row could not be drawn and was skipped",
      expect.objectContaining({ kind: "task", id: "bad" }),
      "TrashRowGuard"
    );
  });
});
