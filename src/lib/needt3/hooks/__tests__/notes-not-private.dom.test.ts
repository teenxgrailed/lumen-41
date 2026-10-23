/**
 * @jest-environment jsdom
 *
 * The assistant and MCP never read a Private page, so the pages people
 * reasonably expect the assistant to see are not made Private by default: a
 * new daily note, a new weekly review and a page made from a saved template.
 * Over a fake fetch, each creation call must not ask for a Private page.
 */
import { act, createElement as h } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type Root, createRoot } from "react-dom/client";

import { useWeeklyReview } from "@/components/needt3/home/useWeeklyReview";

import { useDailyNote } from "../daily-note";
import { useCreateFromTemplate } from "../places";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/lib/notifications", () => ({
  notify: { error: jest.fn(), success: jest.fn(), info: jest.fn() },
}));

interface Call {
  url: string;
  method: string;
  body: Record<string, unknown> | undefined;
}
let calls: Call[];

const api: {
  daily?: ReturnType<typeof useDailyNote>;
  review?: ReturnType<typeof useWeeklyReview>;
  template?: ReturnType<typeof useCreateFromTemplate>;
} = {};

// 18 October 2026 is a Sunday: the weekly review is on offer.
const SUNDAY = "2026-10-18";

function Probe() {
  api.daily = useDailyNote(SUNDAY);
  api.review = useWeeklyReview({
    today: SUNDAY,
    late: [],
    day: [],
    stats: undefined,
    tasks: [],
    projects: [],
    streak: 0,
  });
  api.template = useCreateFromTemplate();
  return null;
}

let host: HTMLDivElement;
let root: Root;
let client: QueryClient;
beforeEach(async () => {
  calls = [];
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({
      url,
      method,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    // reads find nothing (no note for the day yet); writes answer with a page
    const body =
      method === "GET"
        ? url.startsWith("/api/pages")
          ? { pages: [] }
          : {}
        : { page: { id: "pg1", title: "x" } };
    return {
      ok: true,
      status: 200,
      statusText: "",
      text: async () => JSON.stringify(body),
    };
  }) as unknown as typeof fetch;
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(h(QueryClientProvider, { client }, h(Probe))));
  await act(async () => {});
  calls.length = 0;
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const created = () => calls.filter((c) => c.method === "POST");

describe("new notes are not Private by default", () => {
  it("a new daily note is created without Private", async () => {
    let id: string | null = null;
    await act(async () => {
      id = await api.daily!.open();
    });
    expect(id).toBe("pg1");
    const post = created().find((c) => c.url === "/api/pages");
    expect(post?.body).toMatchObject({
      title: "Daily note · 18 October 2026",
      isPrivate: false,
    });
    expect(post?.body?.isPrivate).not.toBe(true);
  });

  it("a new weekly review is created without Private", async () => {
    await act(async () => {
      api.review!.sheet.onSubmit();
    });
    const post = created().find((c) => c.url === "/api/pages");
    expect(post?.body).toMatchObject({
      title: "Weekly review · 18 October 2026",
      isPrivate: false,
    });
    expect(post?.body?.isPrivate).not.toBe(true);
    // the body goes onto the same page the review just made
    expect(created().some((c) => c.url === "/api/pages/pg1/append")).toBe(true);
  });

  it("a page made from a template does not ask to be Private", async () => {
    await act(async () => {
      await api.template!.mutateAsync({ templateId: "tpl1", title: "Brief" });
    });
    const post = created().find(
      (c) => c.url === "/api/page-templates/tpl1/instantiate"
    );
    expect(post).toBeDefined();
    expect(post?.body?.isPrivate).not.toBe(true);
  });
});
