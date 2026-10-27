/**
 * @jest-environment jsdom
 *
 * A personal band in Home's day opens the block view the calendar opens: the
 * peek on the desktop, the sheet on the phone. Enter on the focused band does
 * the same as a click.
 */
import { act, createElement as h, useState } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type Root, createRoot } from "react-dom/client";

import type { DayBand } from "@/lib/personal-time-days";

import { PersonalPeek } from "../../personal/PersonalPeek";
import { PersonalBandSheet } from "../../phone/overlays/PersonalBandSheet";
import { HaSchedule } from "../ha/HaSchedule";
import { haScheduleRows } from "../ha/model";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../root/V3Root", () => ({ useDesignV3: () => true }));
jest.mock("../../ctx/PortalScope", () => ({
  useV3PortalContainer: () => document.body,
}));
jest.mock("@/lib/notifications", () => ({
  notify: { success: jest.fn(), error: jest.fn() },
}));

const lunch: DayBand = {
  key: "lunch:2026-10-19",
  blockId: "lunch",
  kind: "lunch",
  title: "Slow lunch",
  emoji: "🍽",
  tone: "info",
  date: "2026-10-19",
  from: 13,
  to: 14,
  repeating: false,
  linked: false,
};

let host: HTMLDivElement;
let root: Root;
let client: QueryClient;

beforeEach(() => {
  window.scrollTo = jest.fn();
  (globalThis as { fetch?: unknown }).fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ blocks: [] }),
    json: async () => ({ blocks: [] }),
  }));
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = "";
});

const rows = () =>
  haScheduleRows({ items: [], bands: [lunch], nowHour: 9, hueOf: () => "red" });

function Desk() {
  const [open, setOpen] = useState<DayBand | null>(null);
  return h(
    "div",
    null,
    h(HaSchedule, {
      rows: rows(),
      onOpen: () => {},
      onCalendar: () => {},
      onOpenBand: (band: DayBand) => setOpen(band),
    }),
    open
      ? h(PersonalPeek, {
          band: open,
          anchor: { top: 10, left: 10, right: 100 },
          onClose: () => setOpen(null),
        })
      : null
  );
}

const band = () => host.querySelector("[data-personal-band]") as HTMLElement;

describe("Home's personal band", () => {
  it("carries the block id and is a focusable button", async () => {
    await act(async () =>
      root.render(h(QueryClientProvider, { client }, h(Desk)))
    );
    expect(band().getAttribute("data-personal-band")).toBe("lunch");
    expect(band().getAttribute("role")).toBe("button");
    expect(band().tabIndex).toBe(0);
  });

  it("opens the peek with its title on click, on Enter, and not on other keys", async () => {
    await act(async () =>
      root.render(h(QueryClientProvider, { client }, h(Desk)))
    );
    expect(document.querySelector("[data-pb-peek]")).toBeNull();
    await act(async () => {
      band().dispatchEvent(
        new KeyboardEvent("keydown", { key: "a", bubbles: true })
      );
    });
    expect(document.querySelector("[data-pb-peek]")).toBeNull();
    await act(async () => {
      band().dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      );
    });
    const peek = document.querySelector('[data-pb-peek="lunch"]');
    expect(peek?.textContent).toContain("Slow lunch");
    expect(peek?.textContent).toContain("13:00–14:00");
  });

  it("opens the peek on a click", async () => {
    await act(async () =>
      root.render(h(QueryClientProvider, { client }, h(Desk)))
    );
    await act(async () => band().click());
    expect(document.querySelector('[data-pb-peek="lunch"]')).not.toBeNull();
  });

  it("opens the phone sheet with its title", async () => {
    await act(async () =>
      root.render(
        h(
          QueryClientProvider,
          { client },
          h(PersonalBandSheet, { band: lunch, onClose: () => {} })
        )
      )
    );
    expect(document.body.textContent).toContain("Slow lunch");
    expect(document.querySelector("[data-pb-edit-open]")).not.toBeNull();
  });
});
