/**
 * @jest-environment jsdom
 *
 * What the editor writes to a page (title, icon, pin, cover) reaches the v3
 * caches through one window event, so the breadcrumb and the rail follow as
 * you type: only this page's cache and lists change, and only the fields the
 * v3 document carries.
 */
import { act, createElement as h } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type Root, createRoot } from "react-dom/client";

import { usePageEditSync } from "../hooks/docs";
import type { V3Doc } from "../map";
import { announcePagePatched, docFieldsOf } from "../page-events";
import { qk } from "../query-keys";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const doc = (id: string, title: string): V3Doc => ({
  id,
  title,
  icon: null,
  coverUrl: null,
  isFavorite: false,
  trashedAt: null,
  projectId: null,
  style: null,
  createdAt: null,
  updatedAt: null,
});

describe("docFieldsOf", () => {
  it("keeps the fields the v3 document has, with the right types", () => {
    expect(
      docFieldsOf({
        title: "T",
        icon: null,
        isFavorite: true,
        coverUrl: "u",
        isPrivate: true,
        folderId: "f",
      })
    ).toEqual({ title: "T", icon: null, isFavorite: true, coverUrl: "u" });
    expect(
      docFieldsOf({ title: 3, isFavorite: "yes", isPrivate: true })
    ).toEqual({});
  });
});

describe("usePageEditSync", () => {
  let host: HTMLDivElement;
  let root: Root;
  let qc: QueryClient;
  function Probe({ id }: { id: string }) {
    usePageEditSync(id);
    return null;
  }
  beforeEach(() => {
    qc = new QueryClient();
    qc.setQueryData(qk.doc("a"), doc("a", "Old"));
    qc.setQueryData(qk.doc("b"), doc("b", "Other"));
    qc.setQueryData(qk.docs("updated"), [doc("a", "Old"), doc("b", "Other")]);
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() =>
      root.render(h(QueryClientProvider, { client: qc }, h(Probe, { id: "a" })))
    );
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("patches this page's document and every cached list", () => {
    act(() => announcePagePatched({ pageId: "a", values: { title: "New" } }));
    expect(qc.getQueryData<V3Doc>(qk.doc("a"))?.title).toBe("New");
    const list = qc.getQueryData<V3Doc[]>(qk.docs("updated"));
    expect(list?.map((d) => d.title)).toEqual(["New", "Other"]);
  });

  it("leaves another page and a patch with no v3 field alone", () => {
    act(() => announcePagePatched({ pageId: "b", values: { title: "X" } }));
    act(() =>
      announcePagePatched({ pageId: "a", values: { isPrivate: true } })
    );
    expect(qc.getQueryData<V3Doc>(qk.doc("a"))?.title).toBe("Old");
    expect(qc.getQueryData<V3Doc>(qk.doc("b"))?.title).toBe("Other");
  });

  it("stops listening when the screen goes", () => {
    act(() => root.unmount());
    announcePagePatched({ pageId: "a", values: { title: "Late" } });
    expect(qc.getQueryData<V3Doc>(qk.doc("a"))?.title).toBe("Old");
    root = createRoot(host);
  });
});
