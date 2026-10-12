/**
 * @jest-environment jsdom
 *
 * The Document route's two faces around ONE editor: phone -> desktop -> phone
 * mounts the editor once, unmounts it never, keeps its instance, and its
 * parent is the `[data-doc-editor]` host inside the face that is showing.
 * Not mounted for a page the person cannot open.
 */
import {
  act,
  createElement as h,
  createElement as mockH,
  useEffect,
  useRef,
} from "react";

import { type Root, createRoot } from "react-dom/client";

import { PhoneUiProvider } from "../../../root/phone-ui-context";
import { DocsFace, DocumentFace } from "../Faces";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../../docs/DocsScreen", () => ({
  DocsScreen: () => mockH("i", { "data-face": "docs-desktop" }),
}));
jest.mock("../../../docs/useDocsController", () => ({
  useDocsController: () => ({}),
}));
jest.mock("../DocsPhone", () => ({
  DocsPhone: () => mockH("i", { "data-face": "docs-phone" }),
}));
jest.mock("../../../document/DocumentScreen", () => ({
  DocumentScreen: (p: {
    pageId: string;
    editorSlot: (el: HTMLElement | null) => void;
  }) =>
    mockH(
      "section",
      { "data-face": "doc-desktop", "data-id": p.pageId },
      mockH("div", { ref: p.editorSlot, className: "contents" })
    ),
}));
jest.mock("../ReaderPhone", () => ({
  ReaderPhone: (p: {
    pageId: string;
    editorSlot: (el: HTMLElement | null) => void;
  }) =>
    mockH(
      "section",
      { "data-face": "doc-phone", "data-id": p.pageId },
      mockH("div", { ref: p.editorSlot, className: "contents" })
    ),
}));

interface Q {
  status: "pending" | "error" | "success";
  fetchStatus: "fetching" | "paused" | "idle";
  data: unknown;
  error: unknown;
  refetch: () => void;
}
let query: Q;
jest.mock("@/lib/needt3/hooks/docs", () => ({ useDoc: () => query }));

let host: HTMLDivElement;
let root: Root;
const ok = (): Q => ({
  status: "success",
  fetchStatus: "idle",
  data: { id: "p9" },
  error: null,
  refetch: () => undefined,
});
const forbidden = (): Q => ({
  status: "error",
  fetchStatus: "idle",
  data: undefined,
  error: Object.assign(new Error("Forbidden"), { status: 403 }),
  refetch: () => undefined,
});

let seq = 0;
const log = { mounts: 0, unmounts: 0, ids: [] as number[] };

function Editor() {
  const id = useRef(0);
  if (!id.current) id.current = ++seq;
  useEffect(() => {
    log.mounts += 1;
    log.ids.push(id.current);
    return () => {
      log.unmounts += 1;
    };
  }, []);
  return mockH("b", { "data-editor": id.current });
}

beforeEach(() => {
  seq = 0;
  log.mounts = 0;
  log.unmounts = 0;
  log.ids = [];
  query = ok();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const faces = () =>
  Array.from(host.querySelectorAll("[data-face]")).map((e) =>
    e.getAttribute("data-face")
  );
const show = (ui: "phone" | "desktop") =>
  act(() =>
    root.render(
      h(PhoneUiProvider, {
        value: ui,
        children: h(DocumentFace, { pageId: "p9", children: h(Editor) }),
      })
    )
  );
const editor = () => host.querySelector<HTMLElement>("[data-editor]");

describe("Docs faces", () => {
  it("phone on a phone, the desktop screen otherwise", () => {
    act(() =>
      root.render(h(PhoneUiProvider, { value: "phone", children: h(DocsFace) }))
    );
    expect(faces()).toEqual(["docs-phone"]);
    act(() =>
      root.render(
        h(PhoneUiProvider, { value: "desktop", children: h(DocsFace) })
      )
    );
    expect(faces()).toEqual(["docs-desktop"]);
  });
});

describe("Document faces: one editor", () => {
  it("phone -> desktop -> phone mounts once, unmounts never, same instance", () => {
    show("phone");
    expect(faces()).toEqual(["doc-phone"]);
    const first = editor()!;
    expect(first.getAttribute("data-editor")).toBe("1");
    expect(first.parentElement!.hasAttribute("data-doc-editor")).toBe(true);
    expect(first.closest("[data-face]")!.getAttribute("data-face")).toBe(
      "doc-phone"
    );
    expect(first.parentElement!.className).toBe("pd-editor min-w-0");

    show("desktop");
    expect(faces()).toEqual(["doc-desktop"]);
    expect(editor()).toBe(first);
    expect(first.closest("[data-face]")!.getAttribute("data-face")).toBe(
      "doc-desktop"
    );
    expect(first.parentElement!.hasAttribute("data-doc-editor")).toBe(true);
    expect(first.parentElement!.className).toContain(
      "[&>div>header]:!bg-[var(--dt-page)]"
    );

    show("phone");
    expect(editor()).toBe(first);
    expect(first.closest("[data-face]")!.getAttribute("data-face")).toBe(
      "doc-phone"
    );
    expect(first.parentElement!.className).toBe("pd-editor min-w-0");

    expect(log).toEqual({ mounts: 1, unmounts: 0, ids: [1] });
    expect(host.querySelectorAll("[data-editor]")).toHaveLength(1);
    expect(host.querySelectorAll("[data-doc-editor]")).toHaveLength(1);
  });

  it("is not mounted for a page the person cannot open", () => {
    query = forbidden();
    show("phone");
    expect(editor()).toBeNull();
    expect(log.mounts).toBe(0);
  });

  it("mounts while the page loads, keeps through the swap, goes when access is lost", () => {
    query = {
      status: "pending",
      fetchStatus: "fetching",
      data: undefined,
      error: null,
      refetch: () => undefined,
    };
    show("phone");
    expect(log.mounts).toBe(1);
    query = ok();
    show("desktop");
    expect(log).toMatchObject({ mounts: 1, unmounts: 0 });
    query = forbidden();
    show("desktop");
    expect(log.unmounts).toBe(1);
  });
});
