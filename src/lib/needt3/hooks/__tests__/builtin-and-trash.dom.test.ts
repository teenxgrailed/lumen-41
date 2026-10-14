/**
 * @jest-environment jsdom
 *
 * The writes behind the Templates and Trash screens, over a fake fetch: a
 * built-in template is two plain calls (create the page, put its blocks), an
 * empty page is not left behind if the blocks fail, Undo sends the page to
 * Trash, the trash list reads `?trashed=true`, and Delete forever is the one
 * `?permanent=true` call.
 */
import { act, createElement as h } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type Root, createRoot } from "react-dom/client";

import { useDeleteDocForever, useTrashDoc, useTrashedDocs } from "../docs";
import { useCreateFromBuiltin } from "../places";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/lib/notifications", () => ({
  notify: { error: jest.fn(), success: jest.fn(), info: jest.fn() },
}));

interface Call {
  url: string;
  method: string;
  body: unknown;
}
let calls: Call[];
let respond: (c: Call) => { ok: boolean; status: number; body: unknown };

const api: {
  builtin?: ReturnType<typeof useCreateFromBuiltin>;
  forever?: ReturnType<typeof useDeleteDocForever>;
  trash?: ReturnType<typeof useTrashDoc>;
  list?: ReturnType<typeof useTrashedDocs>;
} = {};

function Probe() {
  api.builtin = useCreateFromBuiltin();
  api.forever = useDeleteDocForever();
  api.trash = useTrashDoc();
  api.list = useTrashedDocs();
  return null;
}

let host: HTMLDivElement;
let root: Root;
let client: QueryClient;
beforeEach(async () => {
  calls = [];
  respond = () => ({ ok: true, status: 200, body: {} });
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const call: Call = {
      url,
      method: init?.method ?? "GET",
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    calls.push(call);
    const r = respond(call);
    return {
      ok: r.ok,
      status: r.status,
      statusText: "",
      text: async () => JSON.stringify(r.body),
    };
  }) as unknown as typeof fetch;
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(h(QueryClientProvider, { client }, h(Probe))));
  // the trash list reads once on mount; the tests below look at the writes
  await act(async () => {});
  calls.length = 0;
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const page = (over: Record<string, unknown> = {}) => ({
  id: "pg1",
  title: "Daily note — 14 Oct",
  ...over,
});

describe("useCreateFromBuiltin", () => {
  it("creates the page with the template's title and colour, then puts its blocks", async () => {
    respond = (c) =>
      c.method === "POST"
        ? { ok: true, status: 200, body: { page: page() } }
        : { ok: true, status: 200, body: { page: page() } };
    let out!: Awaited<
      ReturnType<NonNullable<typeof api.builtin>["mutateAsync"]>
    >;
    await act(async () => {
      out = await api.builtin!.mutateAsync({
        builtinId: "builtin:daily",
        title: "Daily note — 14 Oct",
      });
    });
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      "POST /api/pages",
      "PUT /api/pages/pg1/blocks",
    ]);
    expect(calls[0].body).toMatchObject({
      title: "Daily note — 14 Oct",
      style: { backdrop: "none", page: "sky" },
    });
    const blocks = (calls[1].body as { blocks: { type: string }[] }).blocks;
    expect(blocks[0].type).toBe("LEAD");
    expect(blocks).toHaveLength(5);
    expect(out.result?.id).toBe("pg1");
  });

  it("Undo sends the new page to Trash", async () => {
    respond = () => ({ ok: true, status: 200, body: { page: page() } });
    let out!: Awaited<
      ReturnType<NonNullable<typeof api.builtin>["mutateAsync"]>
    >;
    await act(async () => {
      out = await api.builtin!.mutateAsync({
        builtinId: "builtin:review",
        title: "Weekly review — 14 Oct",
      });
    });
    calls.length = 0;
    await act(async () => {
      await out.undo();
    });
    expect(calls[0]).toMatchObject({
      method: "PATCH",
      url: "/api/pages/pg1",
      body: { trashed: true },
    });
  });

  it("if the blocks do not save, the empty page goes back to Trash and the error is raised", async () => {
    respond = (c) => {
      if (c.method === "POST")
        return { ok: true, status: 200, body: { page: page() } };
      if (c.method === "PUT")
        return { ok: false, status: 409, body: { error: "conflict" } };
      return { ok: true, status: 200, body: {} };
    };
    await act(async () => {
      await expect(
        api.builtin!.mutateAsync({
          builtinId: "builtin:brief",
          title: "Project brief — 14 Oct",
        })
      ).rejects.toThrow("conflict");
    });
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      "POST /api/pages",
      "PUT /api/pages/pg1/blocks",
      "PATCH /api/pages/pg1",
    ]);
    expect(calls[2].body).toEqual({ trashed: true });
  });

  it("an unknown built-in makes nothing", async () => {
    await act(async () => {
      await expect(
        api.builtin!.mutateAsync({ builtinId: "builtin:nope", title: "x" })
      ).rejects.toThrow("Unknown template");
    });
    expect(calls).toHaveLength(0);
  });
});

describe("the page trash", () => {
  it("lists trashed pages, newest deletion first", async () => {
    respond = () => ({
      ok: true,
      status: 200,
      body: {
        pages: [
          page({ id: "a", trashedAt: "2026-10-01T09:00:00.000Z" }),
          page({ id: "b", trashedAt: "2026-10-12T09:00:00.000Z" }),
          page({ id: "live", trashedAt: null }),
        ],
      },
    });
    await act(async () => {
      await client.refetchQueries();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(calls[0].url).toBe("/api/pages?trashed=true");
    expect(api.list!.data?.map((d) => d.id)).toEqual(["b", "a"]);
  });

  it("Restore patches trashed:false and its Undo trashes again", async () => {
    let out!: Awaited<ReturnType<NonNullable<typeof api.trash>["mutateAsync"]>>;
    await act(async () => {
      out = await api.trash!.mutateAsync({ id: "pg1", trashed: false });
    });
    expect(calls[0]).toMatchObject({
      method: "PATCH",
      url: "/api/pages/pg1",
      body: { trashed: false },
    });
    calls.length = 0;
    await act(async () => {
      await out.undo();
    });
    expect(calls[0].body).toEqual({ trashed: true });
  });

  it("Delete forever is one DELETE ?permanent=true, with no way back", async () => {
    let out!: Awaited<
      ReturnType<NonNullable<typeof api.forever>["mutateAsync"]>
    >;
    await act(async () => {
      out = await api.forever!.mutateAsync({ id: "pg1" });
    });
    // (the invalidation re-reads the list; the write itself is one call)
    const writes = () => calls.filter((c) => c.method !== "GET");
    expect(writes()).toHaveLength(1);
    expect(writes()[0]).toMatchObject({
      method: "DELETE",
      url: "/api/pages/pg1?permanent=true",
    });
    calls.length = 0;
    await act(async () => {
      await out.undo();
    });
    expect(writes()).toHaveLength(0);
  });

  it("a refusal puts the page back in the list", async () => {
    respond = (c) =>
      c.method === "GET"
        ? {
            ok: true,
            status: 200,
            body: { pages: [page({ trashedAt: "2026-10-12T09:00:00.000Z" })] },
          }
        : { ok: false, status: 409, body: { error: "no" } };
    await act(async () => {
      await client.refetchQueries();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(api.list!.data).toHaveLength(1);
    await act(async () => {
      await expect(api.forever!.mutateAsync({ id: "pg1" })).rejects.toThrow();
    });
    expect(api.list!.data).toHaveLength(1);
  });
});
