/**
 * @jest-environment jsdom
 *
 * The files attached to a page: the list reads `/api/pages/:id/assets` into
 * rows with an address to open each from, and adding a file posts it as form
 * data, then refreshes the list; a refusal (too big, no edit access) is shown
 * in the server's words.
 */
import { act, createElement as h } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type Root, createRoot } from "react-dom/client";

import { useAddPageFile, usePageFiles } from "../doc-files";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const notify = { error: jest.fn(), success: jest.fn() };
jest.mock("@/lib/notifications", () => ({
  notify: {
    error: (...a: unknown[]) => notify.error(...a),
    success: (...a: unknown[]) => notify.success(...a),
  },
}));

const api: {
  files?: ReturnType<typeof usePageFiles>;
  add?: ReturnType<typeof useAddPageFile>;
} = {};
function Probe() {
  api.files = usePageFiles("p1");
  api.add = useAddPageFile("p1");
  return null;
}

/** Lets queued work run until `done()`, up to about a second. */
async function until(done: () => boolean) {
  for (let i = 0; i < 50 && !done(); i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
  }
}

let calls: { url: string; method: string; body: unknown }[];
let post: { ok: boolean; status: number; body: unknown };
let host: HTMLDivElement;
let root: Root;
beforeEach(async () => {
  notify.error.mockReset();
  notify.success.mockReset();
  calls = [];
  post = { ok: true, status: 201, body: {} };
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    calls.push({
      url,
      method: init?.method ?? "GET",
      body: init?.body,
    });
    if (init?.method === "POST") {
      return {
        ok: post.ok,
        status: post.status,
        statusText: "",
        json: async () => post.body,
        text: async () => JSON.stringify(post.body),
      };
    }
    const body = {
      assets: [
        {
          id: "a1",
          originalName: "sidebar-spec.pdf",
          mimeType: "application/pdf",
          size: 245760,
          createdAt: "2026-10-12T09:00:00.000Z",
        },
      ],
    };
    return {
      ok: true,
      status: 200,
      statusText: "",
      text: async () => JSON.stringify(body),
    };
  }) as unknown as typeof fetch;
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(h(QueryClientProvider, { client }, h(Probe))));
  await until(() => !!api.files?.data);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("usePageFiles", () => {
  it("maps each attachment to a row that opens from the page's asset address", () => {
    expect(calls[0].url).toBe("/api/pages/p1/assets");
    expect(api.files?.data).toEqual([
      {
        id: "a1",
        name: "sidebar-spec.pdf",
        mimeType: "application/pdf",
        size: 245760,
        createdAt: "2026-10-12T09:00:00.000Z",
        url: "/api/pages/p1/assets/a1",
      },
    ]);
  });
});

describe("useAddPageFile", () => {
  const file = new File(["hello"], "notes.txt", { type: "text/plain" });

  it("posts the file as form data, says so, and re-reads the list", async () => {
    await act(async () => {
      await api.add!.mutateAsync(file);
    });
    await until(() => calls.filter((c) => c.method === "GET").length > 1);
    const sent = calls.find((c) => c.method === "POST")!;
    expect(sent.url).toBe("/api/pages/p1/assets");
    expect(sent.body).toBeInstanceOf(FormData);
    expect((sent.body as FormData).get("file")).toBe(file);
    expect(notify.success).toHaveBeenCalledWith("Added “notes.txt”");
    expect(calls.filter((c) => c.method === "GET").length).toBeGreaterThan(1);
  });

  it("shows the server's words when it refuses", async () => {
    post = {
      ok: false,
      status: 413,
      body: { error: "Page assets must be 10 MB or smaller" },
    };
    await act(async () => {
      await api.add!.mutateAsync(file).catch(() => undefined);
    });
    expect(notify.error).toHaveBeenCalledWith(
      "Page assets must be 10 MB or smaller"
    );
    expect(notify.success).not.toHaveBeenCalled();
  });
});
