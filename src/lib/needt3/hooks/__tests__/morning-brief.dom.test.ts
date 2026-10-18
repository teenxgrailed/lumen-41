/**
 * @jest-environment jsdom
 *
 * The morning brief hook: reads the cached brief, asks the server to write it
 * once when allowed, never asks when not allowed, and dismisses.
 */
import { act, createElement as h } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type Root, createRoot } from "react-dom/client";

import { qk } from "@/lib/needt3/query-keys";

import { useMorningBrief } from "../morning-brief";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const DAY = "2026-10-19";
const FACTS = { openToday: 1 };

let host: HTMLDivElement;
let root: Root;
let client: QueryClient;
let fetchMock: jest.Mock;
let cachedAnswer: unknown;
let writeAnswer: unknown;
let seen: ReturnType<typeof useMorningBrief> | null;

function Probe(props: { ask: boolean; show: boolean }) {
  seen = useMorningBrief({ day: DAY, facts: FACTS, ...props });
  return h("p", { "data-text": seen.brief?.text ?? "" });
}
const mount = async (props: { ask: boolean; show: boolean }) => {
  await act(async () => {
    root.render(h(QueryClientProvider, { client }, h(Probe, props)));
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 40));
  });
};
const calls = (method: string) =>
  fetchMock.mock.calls.filter(
    ([, init]) =>
      ((init as RequestInit | undefined)?.method ?? "GET") === method
  );
const text = () => host.querySelector("[data-text]")?.getAttribute("data-text");

beforeEach(() => {
  seen = null;
  cachedAnswer = { brief: null };
  writeAnswer = {
    status: "ready",
    brief: { date: DAY, text: "Two things matter.", dismissed: false },
  };
  fetchMock = jest.fn((_url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body =
      method === "POST"
        ? writeAnswer
        : method === "GET"
          ? cachedAnswer
          : { ok: true };
    return Promise.resolve({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify(body)),
    });
  });
  (globalThis as { fetch?: unknown }).fetch = fetchMock;
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

it("shows a cached brief without asking for another", async () => {
  cachedAnswer = {
    brief: { date: DAY, text: "Already written.", dismissed: false },
  };
  await mount({ ask: true, show: true });
  expect(text()).toBe("Already written.");
  expect(calls("POST")).toHaveLength(0);
});

it("asks the server to write it once when there is none", async () => {
  await mount({ ask: true, show: true });
  expect(calls("POST")).toHaveLength(1);
  expect(JSON.parse(calls("POST")[0]?.[1].body)).toEqual({
    date: DAY,
    facts: FACTS,
  });
  expect(text()).toBe("Two things matter.");
  // a re-render does not ask again
  await mount({ ask: true, show: true });
  expect(calls("POST")).toHaveLength(1);
});

it("does not ask when asking is not allowed, but still reads", async () => {
  await mount({ ask: false, show: true });
  expect(calls("GET")).toHaveLength(1);
  expect(calls("POST")).toHaveLength(0);
  expect(text()).toBe("");
});

it("does not even read when the person cannot have a brief", async () => {
  await mount({ ask: false, show: false });
  expect(fetchMock).not.toHaveBeenCalled();
  expect(text()).toBe("");
});

it("shows nothing when the server cannot write one", async () => {
  writeAnswer = { status: "unavailable", brief: null };
  await mount({ ask: true, show: true });
  expect(text()).toBe("");
});

it("dismisses: it disappears at once and the server is told", async () => {
  client.setQueryData(qk.morningBrief(DAY), {
    date: DAY,
    text: "Hello.",
    dismissed: false,
  });
  cachedAnswer = { brief: { date: DAY, text: "Hello.", dismissed: false } };
  await mount({ ask: false, show: true });
  expect(text()).toBe("Hello.");
  await act(async () => {
    seen?.dismiss();
    await new Promise((r) => setTimeout(r, 30));
  });
  expect(text()).toBe("");
  expect(JSON.parse(calls("PATCH")[0]?.[1].body)).toEqual({
    date: DAY,
    dismissed: true,
  });
});
