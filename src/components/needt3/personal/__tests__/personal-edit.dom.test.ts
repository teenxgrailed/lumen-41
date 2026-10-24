/**
 * @jest-environment jsdom
 *
 * Changing a personal block: the form opens with the block's own name, clock
 * and repeat days; Save sends a PATCH of only what changed to
 * /api/personal-blocks/:id and says so with an Undo; an untouched form sends
 * nothing; an empty name cannot be saved.
 */
import { act, createElement as h } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type Root, createRoot } from "react-dom/client";

import type { ApiPersonalBlock } from "@/lib/needt3/hooks/personal";
import { qk } from "@/lib/needt3/query-keys";

import { PersonalEditForm } from "../PersonalEditForm";

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
let patches: Array<{ url: string; body: Record<string, unknown> }>;
let done: boolean[];

// Mon 2026-10-19, 13:00-14:00 in Zurich (UTC+2), weekdays
const lunch: ApiPersonalBlock = {
  id: "lunch",
  kind: "lunch",
  title: "Lunch",
  emoji: null,
  color: null,
  start: "2026-10-19T11:00:00.000Z",
  end: "2026-10-19T12:00:00.000Z",
  rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
  sourceEventId: null,
  isDefault: false,
  updatedAt: "2026-10-19T00:00:00.000Z",
};

beforeEach(() => {
  notices.length = 0;
  patches = [];
  done = [];
  (globalThis as { fetch?: unknown }).fetch = jest.fn(
    async (url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        patches.push({
          url,
          body: JSON.parse(String(init.body)) as Record<string, unknown>,
        });
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              result: { block: { id: "lunch", title: "Quiet lunch" } },
              actionId: "a1",
              undoable: true,
            }),
        };
      }
      if (url === "/api/user-settings") {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ timeZone: "Europe/Zurich" }),
        };
      }
      return { ok: true, status: 200, text: async () => "{}" };
    }
  );
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // the person's zone is already loaded when a block is opened in the app
  client.setQueryData(qk.settings(), { timeZone: "Europe/Zurich" });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

async function settle() {
  for (let i = 0; i < 5; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function mount(block: ApiPersonalBlock = lunch) {
  await act(async () => {
    root.render(
      h(
        QueryClientProvider,
        { client },
        h(PersonalEditForm, {
          block,
          onDone: (saved: boolean) => done.push(saved),
          actions: ({
            save,
            cancel,
            problem,
          }: {
            save: () => void;
            cancel: () => void;
            problem: string | null;
          }) =>
            h(
              "div",
              null,
              h("button", {
                type: "button",
                "data-save": "",
                disabled: !!problem,
                onClick: save,
              }),
              h("button", {
                type: "button",
                "data-cancel": "",
                onClick: cancel,
              })
            ),
        })
      )
    );
  });
  await settle();
}

const field = (name: string) =>
  host.querySelector(`[data-pb-field="${name}"]`) as HTMLInputElement;

/** React-controlled inputs need the native setter to see a change. */
function type(el: HTMLInputElement, value: string) {
  const set = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )!.set!;
  act(() => {
    set.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const click = async (selector: string) => {
  await act(async () => {
    (host.querySelector(selector) as HTMLElement).click();
    await Promise.resolve();
  });
  await settle();
};

describe("PersonalEditForm", () => {
  it("opens with the block's name, clock and days", async () => {
    await mount();
    expect(field("title").value).toBe("Lunch");
    expect(field("start").value).toBe("13:00");
    expect(field("end").value).toBe("14:00");
    const on = Array.from(host.querySelectorAll<HTMLElement>("[data-pb-day]"))
      .filter((el) => el.getAttribute("aria-pressed") === "true")
      .map((el) => el.dataset.pbDay)
      .sort();
    expect(on).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("saves a new name, time and repeat as one PATCH, with an Undo", async () => {
    await mount();
    type(field("title"), "Quiet lunch");
    type(field("start"), "12:30");
    type(field("end"), "13:15");
    // Friday off
    act(() => (host.querySelector('[data-pb-day="5"]') as HTMLElement).click());
    await click("[data-save]");
    expect(patches).toHaveLength(1);
    expect(patches[0].url).toBe("/api/personal-blocks/lunch");
    expect(patches[0].body).toEqual({
      title: "Quiet lunch",
      start: "2026-10-19T10:30:00.000Z",
      end: "2026-10-19T11:15:00.000Z",
      rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH",
    });
    expect(done).toEqual([true]);
    expect(notices.some((n) => n.includes("Quiet lunch"))).toBe(true);
  });

  it("sends only what changed, and nothing for an untouched form", async () => {
    await mount();
    await click("[data-save]");
    expect(patches).toHaveLength(0);
    expect(done).toEqual([true]);

    done.length = 0;
    type(field("title"), "Long lunch");
    await click("[data-save]");
    expect(patches[0].body).toEqual({ title: "Long lunch" });
  });

  it("stops repeating when every day is taken off", async () => {
    await mount();
    for (const day of ["1", "2", "3", "4", "5"]) {
      act(() =>
        (host.querySelector(`[data-pb-day="${day}"]`) as HTMLElement).click()
      );
    }
    await click("[data-save]");
    expect(patches[0].body).toEqual({ rrule: null });
  });

  it("will not save an empty name", async () => {
    await mount();
    type(field("title"), "  ");
    expect(
      (host.querySelector("[data-save]") as HTMLButtonElement).disabled
    ).toBe(true);
    await click("[data-save]");
    expect(patches).toHaveLength(0);
  });

  it("cancel leaves the block alone", async () => {
    await mount();
    type(field("title"), "Something else");
    await click("[data-cancel]");
    expect(patches).toHaveLength(0);
    expect(done).toEqual([false]);
  });

  it("offers only the name for a block marked on an event", async () => {
    await mount({ ...lunch, rrule: null, sourceEventId: "ev1" });
    expect(field("title")).not.toBeNull();
    expect(field("start")).toBeNull();
    expect(host.querySelector("[data-pb-day]")).toBeNull();
  });
});
