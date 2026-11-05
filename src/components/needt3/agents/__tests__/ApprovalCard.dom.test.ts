/**
 * @jest-environment jsdom
 *
 * The approval card: Approve waits five seconds so Undo is real; a card
 * draws only what the hub item has (no due time, no previews, no checks
 * when the item has none).
 */
import { act, createElement as h } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type Root, createRoot } from "react-dom/client";

import { fetchJson } from "@/lib/needt3/hooks/core";

import { ApprovalCard, UNDO_MS } from "../ApprovalCard";
import type { HubItemRow } from "../TasksTab";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/lib/needt3/hooks/core", () => ({ fetchJson: jest.fn() }));

const item = (extra: Partial<HubItemRow> = {}): HubItemRow =>
  ({
    id: "i1",
    title: "Post the launch shorts",
    status: "needs_owner",
    goal: "",
    doneCriteria: "",
    criteria: [
      { text: "Captions checked", met: true },
      { text: "Music cleared", met: null },
    ],
    risks: ["publish"],
    approvals: {},
    assignee: { id: "a1", name: "Grok" },
    heldBy: null,
    leaseExpiresAt: null,
    leaseExpired: false,
    question: "Post 2 shorts at 18:00?",
    noCapableAgent: false,
    ownerUnread: true,
    result: null,
    latestEvent: null,
    updatedAt: new Date().toISOString(),
    ...extra,
  }) as HubItemRow;

let host: HTMLElement;
let root: Root;
const onApprove = jest.fn();

async function mount(it: HubItemRow, files: unknown[] = []) {
  (fetchJson as jest.Mock).mockResolvedValue({ attachments: files });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root.render(
      h(
        QueryClientProvider,
        { client: qc },
        h(ApprovalCard, {
          item: it,
          agent: "Grok",
          now: Date.now(),
          done: null,
          onApprove,
          onAnswer: jest.fn(),
          onOpen: jest.fn(),
        })
      )
    );
  });
  // React Query notifies on a timer: let it land under fake timers.
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      jest.advanceTimersByTime(20);
      await Promise.resolve();
    });
  }
}
const $ = (s: string) => host.querySelector<HTMLElement>(s);

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  jest.useRealTimers();
});

describe("ApprovalCard", () => {
  it("sends Approve only after the Undo window, and Undo cancels it", async () => {
    await mount(item());
    expect($(".ag-acard3-q small")?.textContent).toContain(
      "Post 2 shorts at 18:00?"
    );
    expect(host.querySelectorAll(".ag-checks li")).toHaveLength(2);
    act(() => $("[data-ag-approve]")!.click());
    expect($("[data-ag-ask]")?.getAttribute("data-ag-ask-state")).toBe(
      "pending"
    );
    act(() => $("[data-ag-undo]")!.click());
    act(() => {
      jest.advanceTimersByTime(UNDO_MS + 100);
    });
    expect(onApprove).not.toHaveBeenCalled();
    act(() => $("[data-ag-approve]")!.click());
    act(() => {
      jest.advanceTimersByTime(UNDO_MS + 100);
    });
    expect(onApprove).toHaveBeenCalledTimes(1);
  });

  it("draws previews only for media, and a question without Approve", async () => {
    await mount(item({ risks: [], criteria: [] }), [
      { id: "f1", name: "short-1.mp4", mime: "video/mp4", size: 1 },
      { id: "f2", name: "notes.pdf", mime: "application/pdf", size: 1 },
    ]);
    expect(host.querySelectorAll(".ag-th")).toHaveLength(1);
    expect($("[data-ag-approve]")).toBeNull();
    expect($(".ag-checks")).toBeNull();
    expect($(".ag-acard3-what")?.textContent).toBe("Question");
  });
});
