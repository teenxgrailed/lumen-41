/**
 * @jest-environment jsdom
 *
 * Ask Needt keeps its thread across a reload: on mount it restores the
 * latest saved conversation and replies continue it; New chat starts a
 * fresh one; signed out (401) it simply starts empty.
 */
import { act, createElement as h } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type Root, createRoot } from "react-dom/client";

import { restoredMessages, useAskNeedt } from "../useAskNeedt";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../cursor/hand", () => ({ runAgent: jest.fn() }));

type Ask = ReturnType<typeof useAskNeedt>;
let ask: Ask | null = null;
function Probe() {
  ask = useAskNeedt();
  return null;
}

const SAVED = {
  conversations: [
    {
      id: "c1",
      messages: [
        {
          id: "m1",
          role: "user",
          content: "Plan my week",
          createdAt: "2026-11-05T10:00:00Z",
        },
        {
          id: "m2",
          role: "tool",
          content: '{"ok":true}',
          createdAt: "2026-11-05T10:00:01Z",
        },
        {
          id: "m3",
          role: "assistant",
          content: "Here is your week.",
          createdAt: "2026-11-05T10:00:02Z",
        },
      ],
    },
  ],
};

let host: HTMLElement;
let root: Root;
const fetchMock = jest.fn();

function json(status: number, body: unknown) {
  return Promise.resolve({
    ok: status < 400,
    status,
    json: () => Promise.resolve(body),
    body: null,
  });
}

async function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root.render(h(QueryClientProvider, { client: qc }, h(Probe)));
  });
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

beforeEach(() => {
  ask = null;
  fetchMock.mockReset();
  (globalThis as { fetch: unknown }).fetch = fetchMock;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("Ask Needt history", () => {
  it("restores the latest conversation, and a reply continues it", async () => {
    fetchMock.mockImplementation((url: string) =>
      url.startsWith("/api/ai/conversations") ? json(200, SAVED) : json(500, {})
    );
    await mount();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/ai/conversations?latest=1");
    expect(ask!.restoring).toBe(false);
    expect(ask!.messages.map((m) => [m.from, m.text])).toEqual([
      ["you", "Plan my week"],
      ["needt", "Here is your week."],
    ]);
    await act(async () => {
      await ask!.send("And Friday?");
    });
    const chat = fetchMock.mock.calls.find(([u]) => u === "/api/ai/chat");
    expect(JSON.parse(chat![1].body).conversationId).toBe("c1");
  });

  it("New chat clears the thread and starts a new conversation", async () => {
    fetchMock.mockImplementation((url: string) =>
      url.startsWith("/api/ai/conversations") ? json(200, SAVED) : json(500, {})
    );
    await mount();
    act(() => ask!.reset());
    expect(ask!.messages).toEqual([]);
    await act(async () => {
      await ask!.send("Hello");
    });
    const chat = fetchMock.mock.calls.find(([u]) => u === "/api/ai/chat");
    expect(JSON.parse(chat![1].body).conversationId).toBeUndefined();
  });

  it("starts empty, without failing, when signed out (401)", async () => {
    fetchMock.mockImplementation(() => json(401, { error: "Unauthorized" }));
    await mount();
    expect(ask!.restoring).toBe(false);
    expect(ask!.messages).toEqual([]);
  });

  it("restores only what was said, as text", () => {
    expect(
      restoredMessages([
        { id: "a", role: "system", content: "x", createdAt: "" },
        { id: "b", role: "assistant", content: "  ", createdAt: "" },
        { id: "c", role: "assistant", content: "Done.", createdAt: "bad" },
      ])
    ).toEqual([{ id: "saved-c", from: "needt", text: "Done.", at: 0 }]);
  });
});
