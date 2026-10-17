/**
 * @jest-environment jsdom
 *
 * The thread on a reference: who sees the form, who may resolve or delete, and
 * what Post sends. Data hooks are mocked; the component is the real one.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { ItemComments } from "../ItemComments";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mockPost = jest.fn();
const mockResolve = jest.fn();
const mockRemove = jest.fn();
let mockComments: unknown[] = [];
let mockPending = false;

jest.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { id: "me" } } }),
}));
jest.mock("@/lib/needt3/hooks/board-comments", () => ({
  useItemComments: () => ({
    data: mockComments,
    isPending: mockPending,
    isError: false,
  }),
  useItemCommentActions: () => ({
    post: { mutate: mockPost, isPending: false },
    resolve: { mutate: mockResolve, isPending: false },
    remove: { mutate: mockRemove, isPending: false },
  }),
}));

const comment = (id: string, authorId: string, resolvedAt: string | null) => ({
  id,
  itemId: "i1",
  authorId,
  body: `body ${id}`,
  resolvedAt,
  createdAt: "2026-10-16T10:00:00Z",
  author: { name: authorId === "me" ? "Me" : "Lena", email: null, image: null },
});

let root: Root;
let host: HTMLElement;

function mount(props: { canWrite: boolean; canModerate?: boolean }) {
  act(() => {
    root.render(
      h(ItemComments, {
        boardId: "b1",
        itemId: "i1",
        canWrite: props.canWrite,
        canModerate: props.canModerate ?? false,
        tz: "UTC",
      })
    );
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockComments = [];
  mockPending = false;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const buttons = (label: string) =>
  [...host.querySelectorAll("button")].filter((b) => b.textContent === label);

describe("ItemComments", () => {
  it("shows nothing to a viewer when there are no comments", () => {
    mount({ canWrite: false });
    expect(host.querySelector("[data-mb-comments]")).toBeNull();
  });

  it("lets a viewer read, with no form and no actions", () => {
    mockComments = [comment("c1", "other", null)];
    mount({ canWrite: false });
    expect(host.textContent).toContain("body c1");
    expect(host.querySelector("textarea")).toBeNull();
    expect(buttons("Resolve")).toHaveLength(0);
  });

  it("posts a trimmed comment from an editor", () => {
    mount({ canWrite: true });
    const ta = host.querySelector("textarea") as HTMLTextAreaElement;
    const setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value"
    )!.set!;
    act(() => {
      setter.call(ta, "  Love this  ");
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => {
      (host.querySelector("form") as HTMLFormElement).dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      );
    });
    expect(mockPost).toHaveBeenCalledWith("Love this", expect.any(Object));
  });

  it("offers Resolve and Delete on your own comment only, unless you moderate", () => {
    mockComments = [comment("c1", "me", null), comment("c2", "other", null)];
    mount({ canWrite: true });
    expect(buttons("Resolve")).toHaveLength(1);
    mount({ canWrite: true, canModerate: true });
    expect(buttons("Resolve")).toHaveLength(2);
    act(() => buttons("Resolve")[0].click());
    expect(mockResolve).toHaveBeenCalledWith({ id: "c1", resolved: true });
    act(() => buttons("Delete")[1].click());
    expect(mockRemove).toHaveBeenCalledWith("c2");
  });

  it("folds resolved comments away until asked", () => {
    mockComments = [
      comment("c1", "other", null),
      comment("c2", "other", "2026-10-17T10:00:00Z"),
    ];
    mount({ canWrite: false });
    expect(host.textContent).toContain("body c1");
    expect(host.textContent).not.toContain("body c2");
    act(() => buttons("Show resolved (1)")[0].click());
    expect(host.textContent).toContain("body c2");
  });
});
