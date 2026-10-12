/**
 * @jest-environment jsdom
 *
 * The Info tab's Pin changes a field the editor also holds, so it tells the
 * editor (`from: "chrome"`): at once, back again on Undo, and back again when
 * the write fails.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import {
  PAGE_PATCHED_EVENT,
  type PagePatchedDetail,
} from "@/lib/needt3/page-events";

import { InfoPanel } from "../DocumentScreen";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../states/StScreen", () => ({ StScreen: () => null }));
jest.mock("../ShareSheet", () => ({ ShareSheet: () => null }));
jest.mock("../StylePanel", () => ({ StylePanel: () => null }));
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock("@/lib/needt3/hooks/projects", () => ({
  useProjects: () => ({ data: [] }),
}));
jest.mock("@/lib/needt3/hooks/doc-share", () => ({
  useDocAccess: () => ({ data: { myRole: "FULL_ACCESS" } }),
}));

let undo: jest.Mock;
let write: jest.Mock;
const toast: { onClick?: () => void } = {};
jest.mock("@/lib/needt3/hooks/docs", () => ({
  useUpdateDoc: () => ({ mutateAsync: (v: unknown) => write(v) }),
  useTrashDoc: () => ({ mutateAsync: jest.fn() }),
  useDoc: () => ({ data: undefined }),
  usePageEditSync: () => undefined,
}));
jest.mock("@/lib/notifications", () => ({
  notify: {
    success: (_t: string, o: { action: { onClick: () => void } }) => {
      toast.onClick = o.action.onClick;
    },
    error: jest.fn(),
  },
}));

let host: HTMLDivElement;
let root: Root;
let seen: PagePatchedDetail[];
const on = (e: Event) =>
  seen.push((e as CustomEvent<PagePatchedDetail>).detail);
const doc = {
  id: "p1",
  title: "T",
  icon: null,
  coverUrl: null,
  isFavorite: false,
  trashedAt: null,
  projectId: null,
  style: null,
  createdAt: null,
  updatedAt: null,
};

beforeEach(() => {
  seen = [];
  undo = jest.fn();
  write = jest.fn(async () => ({ undo }));
  toast.onClick = undefined;
  window.addEventListener(PAGE_PATCHED_EVENT, on);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() =>
    root.render(
      h(InfoPanel, {
        doc,
        stats: { words: 0, characters: 0, blocks: 0 },
      })
    )
  );
});
afterEach(() => {
  window.removeEventListener(PAGE_PATCHED_EVENT, on);
  act(() => root.unmount());
  host.remove();
});

const pin = () => host.querySelector<HTMLElement>("[aria-pressed]")!;

describe("Info → Pin", () => {
  it("tells the editor at once", async () => {
    await act(async () => pin().click());
    expect(write).toHaveBeenCalledWith({
      id: "p1",
      patch: { isFavorite: true },
    });
    expect(seen).toEqual([
      { pageId: "p1", values: { isFavorite: true }, from: "chrome" },
    ]);
  });

  it("tells it again when the pin is undone", async () => {
    await act(async () => pin().click());
    await act(async () => toast.onClick?.());
    expect(undo).toHaveBeenCalled();
    expect(seen.map((s) => s.values)).toEqual([
      { isFavorite: true },
      { isFavorite: false },
    ]);
  });

  it("puts the editor's copy back when the write fails", async () => {
    write.mockRejectedValueOnce(new Error("no"));
    await act(async () => pin().click());
    expect(seen.map((s) => s.values)).toEqual([
      { isFavorite: true },
      { isFavorite: false },
    ]);
    expect(seen.every((s) => s.from === "chrome")).toBe(true);
  });
});
