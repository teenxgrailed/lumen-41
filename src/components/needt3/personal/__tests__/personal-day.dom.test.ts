/**
 * @jest-environment jsdom
 *
 * Home's day: the person's personal time as quiet rows, a "Keep time for you"
 * link that opens the presets, and one tap on a preset writes the block
 * through the API (and says so).
 */
import { act, createElement as h } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type Root, createRoot } from "react-dom/client";

import { PersonalDay } from "../PersonalQuickAdd";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const notices: string[] = [];
jest.mock("@/lib/notifications", () => ({
  notify: {
    success: (message: string) => notices.push(message),
    error: (message: string) => notices.push(`error: ${message}`),
  },
}));

let host: HTMLDivElement;
let root: Root;
let client: QueryClient;
let posts: Array<{ url: string; body: Record<string, unknown> }>;

const DAY = "2026-10-19";

beforeEach(() => {
  // a fixed morning, so "today" and the drawn window do not depend on the run
  jest.useFakeTimers({
    now: new Date("2026-10-19T08:00:00.000Z"),
    doNotFake: [
      "nextTick",
      "setImmediate",
      "setTimeout",
      "setInterval",
      "clearTimeout",
      "clearInterval",
      "clearImmediate",
      "queueMicrotask",
      "performance",
      "hrtime",
    ],
  });
  notices.length = 0;
  posts = [];
  (globalThis as { fetch?: unknown }).fetch = jest.fn(
    async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        posts.push({
          url,
          body: JSON.parse(String(init.body)) as Record<string, unknown>,
        });
        return {
          ok: true,
          status: 201,
          text: async () =>
            JSON.stringify({
              result: { block: { id: "b1", title: "Walk" } },
              actionId: "a1",
              undoable: true,
            }),
        };
      }
      if (url.startsWith("/api/personal-blocks")) {
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              blocks: [
                {
                  id: "lunch",
                  kind: "lunch",
                  title: "Lunch",
                  emoji: null,
                  color: null,
                  start: `${DAY}T13:00:00.000Z`,
                  end: `${DAY}T14:00:00.000Z`,
                  rrule: null,
                  sourceEventId: null,
                  isDefault: false,
                  updatedAt: `${DAY}T00:00:00.000Z`,
                },
              ],
            }),
        };
      }
      return { ok: true, status: 200, text: async () => "{}" };
    }
  );
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  jest.useRealTimers();
  act(() => root.unmount());
  host.remove();
});

async function mount() {
  await act(async () => {
    root.render(
      h(QueryClientProvider, { client }, h(PersonalDay, { date: DAY }))
    );
  });
  await settle();
}

/** Lets the fetch mocks and the query cache catch up. */
async function settle() {
  for (let i = 0; i < 5; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

describe("PersonalDay", () => {
  it("shows the day's personal time as a quiet row", async () => {
    await mount();
    const row = host.querySelector("[data-personal-band]") as HTMLElement;
    expect(row).not.toBeNull();
    expect(row.dataset.variant).toBe("row");
    expect(row.getAttribute("aria-label")).toContain("Lunch, personal time");
    expect(row.textContent).toContain("🍽️");
  });

  it("keeps the presets behind a link until asked", async () => {
    await mount();
    expect(host.querySelector("[data-pb-preset]")).toBeNull();
    const keep = host.querySelector("[data-pb-keep]") as HTMLElement;
    expect(keep.getAttribute("aria-expanded")).toBe("false");
    act(() => keep.click());
    expect(keep.getAttribute("aria-expanded")).toBe("true");
    const kinds = Array.from(
      host.querySelectorAll<HTMLElement>("[data-pb-preset]")
    ).map((el) => el.dataset.pbPreset);
    expect(kinds).toHaveLength(7);
  });

  it("one tap writes the block for that day and says so with an Undo", async () => {
    await mount();
    act(() => (host.querySelector("[data-pb-keep]") as HTMLElement).click());
    await act(async () => {
      (host.querySelector('[data-pb-preset="walk"]') as HTMLElement).click();
      await Promise.resolve();
    });
    await settle();
    expect(posts).toHaveLength(1);
    expect(posts[0].url).toBe("/api/personal-blocks");
    expect(posts[0].body).toMatchObject({ kind: "walk", minutes: 30 });
    expect(String(posts[0].body.start)).toMatch(/^2026-10-19T/);
    expect(notices.some((n) => n.includes("Walk"))).toBe(true);
  });
});
