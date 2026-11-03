/**
 * @jest-environment jsdom
 *
 * Creating from the app adds nothing the person did not ask for: a task goes
 * out with "no priority" and with the server's default reminders switched
 * off, unless the draft names a priority. A doc made blank is only kept if
 * something is written in it; left empty, it goes to Trash.
 */
import { act, createElement as h } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type Root, createRoot } from "react-dom/client";

import { discardBlankDoc, useCreateDoc } from "../docs";
import { useCreateTask } from "../tasks";

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
  task?: ReturnType<typeof useCreateTask>;
  doc?: ReturnType<typeof useCreateDoc>;
} = {};

function Probe() {
  api.task = useCreateTask();
  api.doc = useCreateDoc();
  return null;
}

let host: HTMLDivElement;
let root: Root;
let client: QueryClient;
beforeEach(() => {
  calls = [];
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({
      url,
      method,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    const body =
      url === "/api/tasks"
        ? { id: "t1", title: "Buy milk", status: "todo", priority: "none" }
        : url === "/api/pages" && method === "POST"
          ? { page: { id: "pg1", title: "" } }
          : {};
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
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("a task made in the app", () => {
  it("has no priority and no default reminder unless it was asked for", async () => {
    await act(async () => {
      await api.task!.mutateAsync({ draft: { title: "Buy milk" } });
    });
    const post = calls.find((c) => c.url === "/api/tasks");
    expect(post?.body).toMatchObject({
      title: "Buy milk",
      priority: "none",
      defaultReminders: false,
    });
    expect(post?.body).not.toHaveProperty("priorityLevel");
  });

  it("keeps the priority the quick-add line named", async () => {
    await act(async () => {
      await api.task!.mutateAsync({
        draft: { title: "Pay rent", priority: "high" },
      });
    });
    const post = calls.find((c) => c.url === "/api/tasks");
    expect(post?.body).toMatchObject({
      priorityLevel: "HIGH",
      priority: null,
      defaultReminders: false,
    });
  });
});

describe("a doc made blank", () => {
  const made = async () => {
    await act(async () => {
      await api.doc!.mutateAsync({ draft: { title: "" } });
    });
    calls.length = 0;
  };

  it("goes to Trash when it is left without a word", async () => {
    await made();
    expect(discardBlankDoc(client, "pg1", false)).toBe(true);
    expect(calls.filter((c) => c.method !== "GET")).toEqual([
      expect.objectContaining({
        url: "/api/pages/pg1",
        method: "PATCH",
        body: { trashed: true },
      }),
    ]);
  });

  it("is kept when anything was typed in it", async () => {
    await made();
    expect(discardBlankDoc(client, "pg1", true)).toBe(false);
    expect(calls.filter((c) => c.method !== "GET")).toHaveLength(0);
    // and it is no longer a candidate on a later visit
    expect(discardBlankDoc(client, "pg1", false)).toBe(false);
  });

  it("is kept when the page could not be read on the way out", async () => {
    await made();
    expect(discardBlankDoc(client, "pg1", null)).toBe(false);
    expect(discardBlankDoc(client, "pg1", false)).toBe(true);
  });

  it("is left alone when it was never made blank here", () => {
    expect(discardBlankDoc(client, "someone-elses", false)).toBe(false);
    expect(calls.filter((c) => c.method !== "GET")).toHaveLength(0);
  });
});
