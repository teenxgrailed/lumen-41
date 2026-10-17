/**
 * @jest-environment jsdom
 *
 * The desktop board page, mounted for real (data hooks mocked): Add and the
 * Pinterest row, paste, drag-to-reorder (only a drop commits), the reference
 * on the side with its autosaving note, "View as guest", and the Share
 * dialog's roles. The controller is the route's, as in the app.
 */
import { act, createElement as h } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type Root, createRoot } from "react-dom/client";

import { V3PortalScope } from "../../../ctx/PortalScope";
import { MoodboardRoute } from "../../../phone/moodboards/MoodboardsRoute";
import { PhoneUiProvider } from "../../../root/phone-ui-context";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mockAdd = jest.fn();
const mockRemove = jest.fn();
const mockSaveItem = jest.fn();
const mockReorder = jest.fn();
const mockUpdate = jest.fn();
const mockGrant = jest.fn();
const mockSnack = jest.fn();
const mockInfo = jest.fn();
let mockRole: string;
let mockItems: unknown[];
let mockAccess: Record<string, unknown>;

const query = (data: unknown) => ({
  data,
  status: "success",
  fetchStatus: "idle",
  error: null,
  refetch: jest.fn(),
});

const BOARD = {
  id: "b1",
  title: "Rooms",
  createdAt: "2026-10-09T10:00:00Z",
  projectId: null,
  linkShare: false,
  pinterestBoardId: null,
  pinterestStatus: null,
  pinterestSyncedAt: null,
  trashedAt: null,
  memberCount: 0,
  members: [],
  shareToken: null,
};

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { id: "u1", name: "Me" } } }),
}));
jest.mock("@/lib/needt3/hooks/boards", () => ({
  useBoards: () => query([BOARD]),
  useBoard: () => query({ ...BOARD, accessRole: mockRole }),
  useBoardItems: () => query(mockItems),
  useCreateBoard: () => ({ mutateAsync: jest.fn() }),
  useUpdateBoard: () => ({ mutateAsync: mockUpdate }),
  useTrashBoard: () => ({ mutateAsync: jest.fn() }),
  useAddBoardItem: () => ({ mutateAsync: mockAdd }),
  useRemoveBoardItem: () => ({ mutateAsync: mockRemove }),
  useUpdateBoardItem: () => ({ mutateAsync: mockSaveItem }),
  useReorderBoardItems: () => ({ mutateAsync: mockReorder }),
  boardItemsKey: (id: string) => ["v3", "board", id, "items"],
}));
jest.mock("@/lib/needt3/hooks/board-share", () => ({
  useSetBoardGrant: () => ({ mutateAsync: mockGrant, isPending: false }),
  boardAccessKey: (id: string) => ["v3", "board", id, "access"],
  useBoardAccess: () => query(mockAccess),
}));
jest.mock("@/lib/needt3/hooks/plan", () => ({
  usePlan: () => query({ kind: "monthly" }),
}));
jest.mock("@/lib/needt3/hooks/settings", () => ({
  useTimeZone: () => "UTC",
  useSettings: () => query(undefined),
  useSetPref: () => jest.fn(),
}));
jest.mock("../../../phone/overlays/snack", () => ({
  snack: (...a: unknown[]) => mockSnack(...a),
}));
jest.mock("@/lib/notifications", () => ({
  notify: {
    info: (...a: unknown[]) => mockInfo(...a),
    success: jest.fn(),
    error: jest.fn(),
  },
}));
jest.mock("../../../root/V3Root", () => ({ useDesignV3: () => false }));

class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const item = (id: string, extra = {}) => ({
  id,
  kind: "note",
  url: null,
  color: null,
  text: `Words ${id}`,
  title: null,
  ratio: 0.7,
  colorName: null,
  source: null,
  thumbnailUrl: null,
  position: 1,
  createdAt: "2026-10-09T10:00:00Z",
  ...extra,
});

let host: HTMLDivElement;
let root: Root;
let client: QueryClient;

/* The controller reads the wall from the cache at the moment of a write. */
const mount = () => {
  client = new QueryClient();
  client.setQueryData(["v3", "board", "b1", "items"], mockItems);
  return act(() =>
    root.render(
      h(
        QueryClientProvider,
        { client },
        h(
          PhoneUiProvider,
          { value: "desktop" },
          h(V3PortalScope, null, h(MoodboardRoute, { id: "b1" }))
        )
      )
    )
  );
};
const q = <T extends Element>(sel: string) => host.querySelector<T>(sel);
const doc = <T extends Element>(sel: string) => document.querySelector<T>(sel);
const click = (el: Element | null) =>
  act(() => {
    el?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
const flush = () => act(async () => void (await Promise.resolve()));

/* The wall reorders with the shared sortable list: Space picks a card up, the
 * arrows move it, Space drops it, Escape puts it back. */
const key = (el: Element | null, k: string) =>
  act(() => {
    el?.dispatchEvent(
      new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true })
    );
  });

function paste(
  text: string,
  files: File[] = [],
  target: Element = document.body
) {
  const e = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(e, "clipboardData", {
    value: { files, getData: (t: string) => (t === "text/plain" ? text : "") },
  });
  act(() => {
    target.dispatchEvent(e);
  });
  return e;
}

beforeEach(() => {
  jest.useFakeTimers();
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = RO;
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: query.includes("reduce"),
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }),
  });
  [
    mockAdd,
    mockRemove,
    mockSaveItem,
    mockReorder,
    mockUpdate,
    mockGrant,
    mockSnack,
    mockInfo,
  ].forEach((m) => m.mockReset());
  mockAdd.mockResolvedValue({ result: null, undo: jest.fn() });
  mockReorder.mockResolvedValue({ result: undefined, undo: jest.fn() });
  mockSaveItem.mockResolvedValue({ result: undefined, undo: jest.fn() });
  mockGrant.mockResolvedValue({ result: undefined, undo: jest.fn() });
  mockRole = "EDITOR";
  mockItems = [
    item("a", { position: 1 }),
    item("b", { position: 2 }),
    item("c", { position: 3 }),
  ];
  mockAccess = {
    creatorId: "u0",
    creator: { name: "Owen", email: "owen@x.io", image: null },
    linkShare: false,
    myRole: "FULL_ACCESS",
    grants: [],
    candidates: [
      {
        userId: "m1",
        name: "Lena",
        email: "lena@studio.ch",
        image: null,
        user: undefined,
      },
    ],
  };
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = "";
  jest.useRealTimers();
});

describe("the wall", () => {
  it("draws every reference, with Add for an editor and the Pinterest row as Coming soon", async () => {
    mount();
    expect(q('[data-id="a"]')).not.toBeNull();
    expect(q('[data-id="c"]')).not.toBeNull();
    act(() => {
      q(".mb-add")?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      );
    });
    await flush();
    const text = doc("[role=menu]")?.textContent ?? "";
    expect(text).toContain("Upload images");
    expect(text).toContain("Paste a link");
    expect(text).toContain("Connect Pinterest board");
    expect(text).toContain("PRO");
    expect(text).toContain("Coming soon");
    const row = [...document.querySelectorAll("[role=menuitem]")].find((e) =>
      e.textContent?.includes("Pinterest")
    );
    expect(
      row?.getAttribute("aria-disabled") ?? row?.getAttribute("data-disabled")
    ).not.toBeNull();
  });

  it("a viewer reads: no Add, no menus, nothing draggable", () => {
    mockRole = "VIEWER";
    mount();
    expect(q(".mb-add")).toBeNull();
    expect(q(".mb-card-more")).toBeNull();
    expect(q('[data-id="a"]')?.hasAttribute("data-sort-handle")).toBe(false);
  });

  it("View as guest hides what writes, and Exit brings it back", () => {
    mount();
    expect(q(".mb-add")).not.toBeNull();
    click(q(".mb-guest"));
    expect(q(".mb-add")).toBeNull();
    expect(q(".mb-share")).toBeNull();
    expect(q(".mb-guest-bar")).not.toBeNull();
    expect(q('[data-id="a"]')?.hasAttribute("data-sort-handle")).toBe(false);
    click(q(".mb-guest-bar button"));
    expect(q(".mb-add")).not.toBeNull();
  });

  it("shows a canvas tile read-only: no menu, not draggable", () => {
    mockItems = [item("a"), item("canvas:x", { fromCanvas: true })];
    mount();
    const tile = q('[data-id="canvas:x"]')!;
    expect(tile.hasAttribute("data-sort-handle")).toBe(false);
    expect(tile.querySelector(".mb-card-more")).toBeNull();
    expect(q('[data-id="a"] .mb-card-more')).not.toBeNull();
  });
});

describe("paste", () => {
  it("a link adds a link at the front, with the address cleaned", async () => {
    mount();
    const e = paste("www.are.na/block/1987");
    await flush();
    expect(e.defaultPrevented).toBe(true);
    expect(mockAdd).toHaveBeenCalledTimes(1);
    expect(mockAdd.mock.calls[0][0]).toMatchObject({
      boardId: "b1",
      draft: {
        kind: "link",
        url: "https://www.are.na/block/1987",
        position: 0,
      },
    });
  });

  it("a hex adds a colour", async () => {
    mount();
    paste("C2410C");
    await flush();
    expect(mockAdd.mock.calls[0][0].draft).toMatchObject({
      kind: "color",
      color: "#c2410c",
    });
  });

  it("anything else only says what to paste", async () => {
    mount();
    paste("just words");
    await flush();
    expect(mockAdd).not.toHaveBeenCalled();
    expect(mockInfo).toHaveBeenCalledWith("Paste an image or a link to add it");
  });

  it("typing in a field is not a board paste", async () => {
    mount();
    click(q(".mb-add"));
    const field = document.createElement("input");
    document.body.appendChild(field);
    paste("https://are.na/block/1", [], field);
    await flush();
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it("a viewer's paste adds nothing", async () => {
    mockRole = "VIEWER";
    mount();
    paste("https://are.na/block/1");
    await flush();
    expect(mockAdd).not.toHaveBeenCalled();
  });
});

describe("drag to reorder", () => {
  it("a drop commits the new order once", async () => {
    mount();
    const a = q('[data-id="a"]')!;
    key(a, " ");
    key(a, "ArrowDown");
    key(a, "ArrowDown");
    expect(mockReorder).not.toHaveBeenCalled();
    key(a, " ");
    await flush();
    expect(mockReorder).toHaveBeenCalledTimes(1);
    expect(mockReorder).toHaveBeenCalledWith({
      boardId: "b1",
      order: ["b", "c", "a"],
    });
    expect(mockSnack).toHaveBeenCalledWith(
      "Order changed",
      expect.any(Function)
    );
  });

  it("Escape puts the card back and commits nothing", async () => {
    mount();
    const a = q('[data-id="a"]')!;
    key(a, " ");
    key(a, "ArrowDown");
    key(a, "Escape");
    await flush();
    expect(mockReorder).not.toHaveBeenCalled();
    expect(
      [...host.querySelectorAll("[data-id]")].map((n) =>
        n.getAttribute("data-id")
      )
    ).toEqual(["a", "b", "c"]);
  });

  it("a card with no move (dropped where it was), or a canvas tile, changes nothing", async () => {
    mockItems = [item("a"), item("b"), item("canvas:x", { fromCanvas: true })];
    mount();
    const a = q('[data-id="a"]')!;
    key(a, " ");
    key(a, " ");
    key(q('[data-id="canvas:x"]'), " ");
    await flush();
    expect(mockReorder).not.toHaveBeenCalled();
    expect(q('[data-id="canvas:x"]')?.hasAttribute("data-sort-handle")).toBe(
      false
    );
  });

  it("Enter still opens the card", async () => {
    mount();
    key(q('[data-id="b"]'), "Enter");
    await flush();
    expect(doc("textarea[name=mb-detail-note]")).not.toBeNull();
  });
});

describe("a reference opened on the side", () => {
  it("saves a typed note by itself after a pause, once", async () => {
    mount();
    click(q('[data-id="b"]'));
    await flush();
    const area = doc<HTMLTextAreaElement>("textarea[name=mb-detail-note]")!;
    const set = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value"
    )?.set;
    act(() => {
      set?.call(area, "Heavier fabric");
      area.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(mockSaveItem).not.toHaveBeenCalled();
    await act(async () => void jest.advanceTimersByTime(450));
    expect(mockSaveItem).toHaveBeenCalledTimes(1);
    expect(mockSaveItem).toHaveBeenCalledWith({
      boardId: "b1",
      id: "b",
      patch: { text: "Heavier fabric" },
    });
  });

  it("a note typed in the last 400 ms is saved, not dropped, when the page goes away", async () => {
    mount();
    click(q('[data-id="b"]'));
    await flush();
    const area = doc<HTMLTextAreaElement>("textarea[name=mb-detail-note]")!;
    const set = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value"
    )?.set;
    act(() => {
      set?.call(area, "Typed just now");
      area.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(mockSaveItem).not.toHaveBeenCalled();
    act(() => root.unmount()); // navigated away before the pause ended
    expect(mockSaveItem).toHaveBeenCalledTimes(1);
    expect(mockSaveItem).toHaveBeenCalledWith({
      boardId: "b1",
      id: "b",
      patch: { text: "Typed just now" },
    });
    root = createRoot(host);
  });

  it("a viewer cannot type in it or remove from it", async () => {
    mockRole = "VIEWER";
    mount();
    click(q('[data-id="b"]'));
    await flush();
    expect(
      doc<HTMLTextAreaElement>("textarea[name=mb-detail-note]")?.readOnly
    ).toBe(true);
    expect(doc(".mb-detail-remove")).toBeNull();
  });

  it("Remove removes once, with Undo", async () => {
    mockRemove.mockResolvedValue({ result: undefined, undo: jest.fn() });
    mount();
    click(q('[data-id="b"]'));
    await flush();
    click(doc(".mb-detail-remove"));
    click(doc(".mb-detail-remove"));
    await flush();
    expect(mockRemove).toHaveBeenCalledTimes(1);
    expect(mockRemove).toHaveBeenCalledWith({ boardId: "b1", id: "b" });
  });
});

describe("Share", () => {
  const openShare = async () => {
    click(q(".mb-share"));
    await flush();
  };
  const type = (el: HTMLInputElement, v: string) => {
    const set = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )?.set;
    act(() => {
      set?.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };

  it("invites a workspace member by email with the chosen role", async () => {
    mount();
    await openShare();
    const input = doc<HTMLInputElement>("input[name=mb-invite]")!;
    click(doc('[data-mb-role="EDITOR"]'));
    type(input, " Lena@Studio.ch ");
    click(doc(".mb-invite-btn"));
    await flush();
    expect(mockGrant).toHaveBeenCalledTimes(1);
    expect(mockGrant.mock.calls[0][0]).toMatchObject({
      boardId: "b1",
      role: "EDITOR",
      person: { userId: "m1" },
    });
  });

  it("says why an address cannot be invited, and invites nobody", async () => {
    mount();
    await openShare();
    const input = doc<HTMLInputElement>("input[name=mb-invite]")!;
    type(input, "stranger@elsewhere.io");
    expect(doc("#mb-invite-hint")?.textContent).toContain(
      "people in this workspace"
    );
    expect(doc<HTMLButtonElement>(".mb-invite-btn")?.disabled).toBe(true);
    type(input, "nope");
    expect(doc("#mb-invite-hint")?.getAttribute("role")).toBe("alert");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(mockGrant).not.toHaveBeenCalled();
  });

  it("a person without full access sees who is on the board and cannot invite", async () => {
    mockAccess = { ...mockAccess, myRole: "EDITOR" };
    mount();
    await openShare();
    expect(doc("input[name=mb-invite]")).toBeNull();
    expect(doc(".mb-invite-btn")).toBeNull();
    expect(doc("[role=dialog]")?.textContent).toContain(
      "Only people with full access can change who sees this board."
    );
    expect(doc<HTMLButtonElement>("[role=switch]")?.disabled).toBe(true);
  });

  it("Anyone with the link asks the server, which decides", async () => {
    mockUpdate.mockResolvedValue({ result: undefined, undo: jest.fn() });
    mount();
    await openShare();
    click(doc("[role=switch]"));
    await flush();
    expect(mockUpdate).toHaveBeenCalledWith({
      id: "b1",
      patch: { linkShare: true },
    });
  });

  it("refreshes the dialog's access data once the link is switched, so it stops saying Private", async () => {
    mockUpdate.mockResolvedValue({ result: undefined, undo: jest.fn() });
    mount();
    await openShare();
    const invalidate = jest.spyOn(client, "invalidateQueries");
    click(doc("[role=switch]"));
    await flush();
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["v3", "board", "b1", "access"],
    });
  });

  it("removes a person with Undo", async () => {
    mockAccess = {
      ...mockAccess,
      grants: [
        {
          userId: "m2",
          name: "Tom",
          email: "tom@x.io",
          image: null,
          role: "VIEWER",
        },
      ],
    };
    mount();
    await openShare();
    click(doc('button[aria-label="Remove Tom"]'));
    await flush();
    expect(mockGrant.mock.calls[0][0]).toMatchObject({
      boardId: "b1",
      role: null,
      person: { userId: "m2" },
    });
  });
});
