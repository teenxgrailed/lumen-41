/**
 * @jest-environment jsdom
 *
 * The Moodboards routes, mounted for real (data hooks mocked): the Free
 * allowance blocks a new board at the paywall; a create writes once (Enter
 * twice, a swap) and opens the board; the naming sheet's draft belongs to
 * the route and survives crossing 700 px; rename and delete write only what
 * a route supports and delete comes back through Undo; a board whose
 * references cannot be read says so.
 */
import { act, createElement as h } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type Root, createRoot } from "react-dom/client";

import { ApiError } from "@/lib/needt3/hooks/core";
import { qk } from "@/lib/needt3/query-keys";

import { PhoneUiProvider } from "../../../root/phone-ui-context";
import { usePhoneOverlays } from "../../overlays/store";
import { MoodboardRoute, MoodboardsRoute } from "../MoodboardsRoute";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockTrash = jest.fn();
const mockAdd = jest.fn();
const mockRemove = jest.fn();
const mockRetry = jest.fn();
let mockItemsQuery: Record<string, unknown> = {};
const mockSnack = jest.fn();
const mockPush = jest.fn();
let mockBoards: unknown[] = [];
let mockPlanKind = "free";
let mockRole: string | undefined = "EDITOR";

const query = (data: unknown) => ({
  data,
  status: "success",
  fetchStatus: "idle",
  error: null,
  refetch: jest.fn(),
});

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));
jest.mock("@/lib/needt3/hooks/boards", () => ({
  useBoards: () => query(mockBoards),
  useCreateBoard: () => ({ mutateAsync: mockCreate }),
  useUpdateBoard: () => ({ mutateAsync: mockUpdate }),
  useTrashBoard: () => ({ mutateAsync: mockTrash }),
  useAddBoardItem: () => ({ mutateAsync: mockAdd }),
  useRemoveBoardItem: () => ({ mutateAsync: mockRemove }),
  useBoardItems: () => mockItemsQuery,
  useBoard: () =>
    query(
      mockRole
        ? { ...(mockBoards[0] as object), accessRole: mockRole }
        : undefined
    ),
}));
jest.mock("@/lib/needt3/hooks/plan", () => ({
  usePlan: () => query({ kind: mockPlanKind }),
}));
jest.mock("@/lib/needt3/hooks/settings", () => ({
  useTimeZone: () => "UTC",
}));
jest.mock("../../overlays/snack", () => ({
  snack: (...a: unknown[]) => mockSnack(...a),
}));
const mockInfo = jest.fn();
jest.mock("@/lib/notifications", () => ({
  notify: {
    info: (...a: unknown[]) => mockInfo(...a),
    success: jest.fn(),
    error: jest.fn(),
  },
}));

// The desktop screen reads the flag from V3Root, which pulls in the whole frame.
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

const board = (id: string, title: string, extra = {}) => ({
  id,
  title,
  createdAt: "2026-10-09T10:00:00Z",
  projectId: null,
  linkShare: false,
  pinterestBoardId: null,
  pinterestStatus: null,
  pinterestSyncedAt: null,
  trashedAt: null,
  ...extra,
});

let host: HTMLDivElement;
let root: Root;
let client: QueryClient;

/* The controller reads the Free allowance from the cache at the tap. */
const seed = (planKind: string) => {
  mockPlanKind = planKind;
  client.setQueryData(qk.boards(), mockBoards);
  client.setQueryData(qk.plan(), { kind: planKind });
};

const mount = (ui: "phone" | "desktop", el: ReturnType<typeof h>) =>
  act(() =>
    root.render(
      h(QueryClientProvider, { client }, h(PhoneUiProvider, { value: ui }, el))
    )
  );
const list = (ui: "phone" | "desktop") => mount(ui, h(MoodboardsRoute));
const page = (ui: "phone" | "desktop", id = "b1") =>
  mount(
    ui,
    h(MoodboardRoute, {
      id,
      workspace: h("div", { "data-workspace": "" }),
    })
  );
const q = <T extends Element>(sel: string) => host.querySelector<T>(sel);
const doc = <T extends Element>(sel: string) => document.querySelector<T>(sel);
const flush = () => act(async () => void (await Promise.resolve()));
const click = (el: Element | null) =>
  act(() => {
    el?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
function typeInto(el: HTMLInputElement, value: string) {
  const set = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )?.set;
  act(() => {
    set?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const enter = () =>
  act(() => {
    doc("#phb-board-name")?.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
      })
    );
  });

beforeEach(() => {
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
  jest
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockImplementation(() => null);
  [
    mockCreate,
    mockUpdate,
    mockTrash,
    mockSnack,
    mockPush,
    mockInfo,
    mockAdd,
    mockRemove,
    mockRetry,
  ].forEach((m) => m.mockReset());
  mockBoards = [];
  mockRole = "EDITOR";
  mockItemsQuery = query([]);
  client = new QueryClient();
  usePhoneOverlays.setState({ paywall: false });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  jest.restoreAllMocks();
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = "";
});

describe("the boards list", () => {
  it("is a grid of cards, with the Free count", () => {
    mockBoards = [board("b1", "Rooms")];
    seed("free");
    list("phone");
    expect(q('[data-phb-board="b1"]')?.textContent).toContain("Rooms");
    expect(q("[data-phb-quota]")?.textContent).toMatch(/^1 of 1 boards/);
  });

  it("leaves a trashed board out", () => {
    mockBoards = [
      board("b1", "Rooms"),
      board("b2", "Gone", { trashedAt: "x" }),
    ];
    seed("monthly");
    list("phone");
    expect(q('[data-phb-board="b2"]')).toBeNull();
    expect(q("[data-phb-quota]")).toBeNull();
  });

  it("a new board past the Free allowance opens the paywall, not the sheet", () => {
    mockBoards = [board("b1", "Rooms")];
    seed("free");
    list("phone");
    click(q("[data-phb-newboard]"));
    expect(usePhoneOverlays.getState().paywall).toBe("more than 1 moodboard");
    expect(doc("#phb-board-name")).toBeNull();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("the face is the route's choice and the desktop screen is untouched", () => {
    seed("free");
    list("desktop");
    expect(q('[data-v3-screen="moodboards"]')).not.toBeNull();
    list("phone");
    expect(q('[data-v3-screen="moodboards"]')).toBeNull();
    expect(q("[data-phb-newboard]")).not.toBeNull();
  });
});

describe("both faces share the controller", () => {
  it("a create started on the desktop is one create when the phone is drawn", async () => {
    seed("monthly");
    let resolve: (v: unknown) => void = () => undefined;
    mockCreate.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      })
    );
    list("desktop");
    click(q("[data-page-add]"));
    expect(mockCreate).toHaveBeenCalledWith({
      draft: { title: "Untitled moodboard" },
    });
    list("phone");
    click(q("[data-phb-newboard]"));
    typeInto(doc<HTMLInputElement>("#phb-board-name")!, "Rooms");
    enter();
    expect(mockCreate).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolve({ result: board("n1", "Untitled"), undo: jest.fn() });
      await Promise.resolve();
    });
    await flush();
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith("/moodboards/n1");
  });

  it("a refused add goes to the notice on the desktop and the paywall on the phone", () => {
    mockBoards = [board("b1", "Rooms")];
    seed("free");
    list("desktop");
    click(q("[data-page-add]"));
    expect(mockInfo).toHaveBeenCalledTimes(1);
    expect(usePhoneOverlays.getState().paywall).toBe(false);
    list("phone");
    click(q("[data-phb-newboard]"));
    expect(usePhoneOverlays.getState().paywall).toBe("more than 1 moodboard");
    expect(mockInfo).toHaveBeenCalledTimes(1);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe("making a board", () => {
  it("writes once however many times Enter is pressed, then opens it", async () => {
    seed("monthly");
    let resolve: (v: unknown) => void = () => undefined;
    mockCreate.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      })
    );
    list("phone");
    click(q("[data-phb-newboard]"));
    typeInto(doc<HTMLInputElement>("#phb-board-name")!, "Rooms");
    enter();
    enter();
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledWith({ draft: { title: "Rooms" } });
    await act(async () => {
      resolve({ result: board("n1", "Rooms"), undo: jest.fn() });
      await Promise.resolve();
    });
    await flush();
    expect(mockSnack).toHaveBeenCalledWith(
      "Board “Rooms” made",
      expect.any(Function)
    );
    expect(mockPush).toHaveBeenCalledWith("/moodboards/n1");
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it("what was typed survives crossing 700 px and nothing is written by the swap", () => {
    seed("monthly");
    list("phone");
    click(q("[data-phb-newboard]"));
    typeInto(doc<HTMLInputElement>("#phb-board-name")!, "Rooms");
    list("desktop");
    expect(doc("#phb-board-name")).toBeNull();
    list("phone");
    expect(doc<HTMLInputElement>("#phb-board-name")?.value).toBe("Rooms");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("a failed create keeps the sheet and the text, and opens nothing", async () => {
    seed("monthly");
    mockCreate.mockRejectedValue(new Error("offline"));
    list("phone");
    click(q("[data-phb-newboard]"));
    typeInto(doc<HTMLInputElement>("#phb-board-name")!, "Rooms");
    enter();
    await flush();
    await flush();
    expect(doc<HTMLInputElement>("#phb-board-name")?.value).toBe("Rooms");
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockSnack).not.toHaveBeenCalled();
  });
});

describe("one board", () => {
  beforeEach(() => {
    mockBoards = [board("b1", "Rooms")];
    seed("monthly");
  });

  it("shows the board with its references on the wall", () => {
    mockItemsQuery = query([item("i1"), item("i2")]);
    page("phone");
    expect(q("[data-phb-page]")?.textContent).toContain("Rooms");
    expect(q("[data-phb-page]")?.textContent).toContain("2 references");
    expect(host.querySelectorAll("[data-phb-item]")).toHaveLength(2);
    expect(q("[data-workspace]")).toBeNull();
  });

  it("an empty board says so and offers Add", () => {
    page("phone");
    expect(host.textContent).toContain("Nothing on this board yet");
    expect(host.textContent).not.toContain("not available");
  });

  it("shows the skeleton while the references load, never a dead end", () => {
    mockItemsQuery = {
      data: undefined,
      status: "pending",
      fetchStatus: "fetching",
      error: null,
      refetch: mockRetry,
    };
    page("phone");
    expect(q('[data-phb-state="loading"]')).not.toBeNull();
    expect(q(".st-skeleton")).not.toBeNull();
    expect(host.textContent).not.toContain("not available");
    expect(q("[data-phb-item]")).toBeNull();
  });

  it("shows the error row with Retry when the references fail", () => {
    mockItemsQuery = {
      data: undefined,
      status: "error",
      fetchStatus: "idle",
      error: new Error("500"),
      refetch: mockRetry,
    };
    page("phone");
    expect(q("[data-st-error]")?.textContent).toContain("references");
    expect(host.textContent).not.toContain("not available");
    click(q("[data-st-retry]"));
    expect(mockRetry).toHaveBeenCalledTimes(1);
  });

  it("other widths keep the existing workspace", () => {
    page("desktop");
    expect(q("[data-workspace]")).not.toBeNull();
    expect(q("[data-phb-page]")).toBeNull();
  });

  it("a board that is gone says so and goes back", () => {
    page("phone", "nope");
    expect(host.textContent).toContain("This board is gone");
    click(host.querySelector(".pk-empty-action button"));
    expect(mockPush).toHaveBeenCalledWith("/moodboards");
  });

  it("rename writes the new title; the same words write nothing", async () => {
    mockUpdate.mockResolvedValue({
      result: board("b1", "Kitchen"),
      undo: jest.fn(),
    });
    page("phone");
    click(q("[data-phb-more]"));
    click(doc('[data-phb-act="rename"]'));
    expect(doc<HTMLInputElement>("#phb-board-name")?.value).toBe("Rooms");
    // unchanged: Save closes the sheet and writes nothing
    enter();
    await flush();
    expect(mockUpdate).not.toHaveBeenCalled();
    click(q("[data-phb-more]"));
    click(doc('[data-phb-act="rename"]'));
    typeInto(doc<HTMLInputElement>("#phb-board-name")!, "Kitchen");
    enter();
    enter();
    await flush();
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith({
      id: "b1",
      patch: { title: "Kitchen" },
    });
    expect(mockSnack).toHaveBeenCalledWith(
      "Renamed to “Kitchen”",
      expect.any(Function)
    );
  });

  it("delete moves the board to Trash with Undo, and leaves the page", async () => {
    const undo = jest.fn();
    mockTrash.mockResolvedValue({ result: undefined, undo });
    page("phone");
    click(q("[data-phb-more]"));
    click(doc('[data-phb-act="delete"]'));
    await flush();
    expect(mockTrash).toHaveBeenCalledWith({ id: "b1", trashed: true });
    expect(mockSnack).toHaveBeenCalledWith("“Rooms” moved to Trash", undo);
    expect(mockPush).toHaveBeenCalledWith("/moodboards");
  });

  it("two taps on Delete trash the board once, with one snack", async () => {
    let resolve: (v: unknown) => void = () => undefined;
    mockTrash.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      })
    );
    page("phone");
    click(q("[data-phb-more]"));
    const del = doc('[data-phb-act="delete"]');
    click(del);
    click(del);
    click(del);
    expect(mockTrash).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolve({ result: undefined, undo: jest.fn() });
      await Promise.resolve();
    });
    await flush();
    expect(mockSnack).toHaveBeenCalledTimes(1);
  });

  it.each(["EDITOR", "FULL_ACCESS"])(
    "%s sees Add and the board's actions",
    (role) => {
      mockRole = role;
      mockItemsQuery = query([item("i1")]);
      page("phone");
      expect(q("[data-phb-add]")).not.toBeNull();
      expect(q("[data-phb-more]")).not.toBeNull();
      click(q("[data-phb-more]"));
      expect(doc('[data-phb-act="rename"]')).not.toBeNull();
      expect(doc('[data-phb-act="delete"]')).not.toBeNull();
      click(q('[data-phb-item="i1"]'));
      expect(doc("[data-phb-item-remove]")).not.toBeNull();
    }
  );

  it("a VIEWER sees the references and none of the controls that write", () => {
    mockRole = "VIEWER";
    mockItemsQuery = query([item("i1")]);
    page("phone");
    expect(host.querySelectorAll("[data-phb-item]")).toHaveLength(1);
    expect(q("[data-phb-add]")).toBeNull();
    expect(q("[data-phb-more]")).toBeNull();
    click(q('[data-phb-item="i1"]'));
    expect(doc("[data-phb-detail]")).not.toBeNull();
    expect(doc("[data-phb-item-remove]")).toBeNull();
  });

  it("an empty board offers a viewer no Add", () => {
    mockRole = "VIEWER";
    page("phone");
    expect(host.textContent).toContain("Nothing on this board yet");
    expect(q("[data-phb-add]")).toBeNull();
    expect(host.textContent).not.toContain("Add a reference");
  });

  it("until the server has said the role nothing that writes is shown", () => {
    mockRole = undefined;
    page("phone");
    expect(q("[data-phb-add]")).toBeNull();
    expect(q("[data-phb-more]")).toBeNull();
  });

  it("a failed delete stays on the board", async () => {
    mockTrash.mockRejectedValue(new Error("403"));
    page("phone");
    click(q("[data-phb-more]"));
    click(doc('[data-phb-act="delete"]'));
    await flush();
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockSnack).not.toHaveBeenCalled();
  });
});

describe("a board's references", () => {
  beforeEach(() => {
    mockBoards = [board("b1", "Rooms")];
    seed("monthly");
  });
  const area = () => doc<HTMLTextAreaElement>("#phb-note");
  function typeArea(el: HTMLTextAreaElement, value: string) {
    const set = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value"
    )?.set;
    act(() => {
      set?.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
  const openNote = () => {
    click(q("[data-phb-add]"));
    click(doc('[data-phb-kind="note"]'));
  };

  it("adds a note once, with Undo", async () => {
    let resolve: (v: unknown) => void = () => undefined;
    mockAdd.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      })
    );
    page("phone");
    openNote();
    typeArea(area()!, "  Oak, matte  ");
    const save = doc("[data-phb-add-save]");
    click(save);
    click(save);
    expect(mockAdd).toHaveBeenCalledTimes(1);
    expect(mockAdd).toHaveBeenCalledWith({
      boardId: "b1",
      draft: { kind: "note", text: "Oak, matte", ratio: 0.7 },
    });
    const undo = jest.fn();
    await act(async () => {
      resolve({ result: item("n1"), undo });
      await Promise.resolve();
    });
    await flush();
    expect(mockSnack).toHaveBeenCalledWith("Added to this board", undo);
  });

  it("a full board (409) shows the 500-reference notice, keeps the sheet and the text", async () => {
    mockAdd.mockRejectedValue(new ApiError(409, "Moodboard is full"));
    page("phone");
    openNote();
    typeArea(area()!, "Oak");
    click(doc("[data-phb-add-save]"));
    await flush();
    await flush();
    expect(mockInfo).toHaveBeenCalledTimes(1);
    expect(mockInfo).toHaveBeenCalledWith("This board holds 500 references");
    expect(mockSnack).not.toHaveBeenCalled();
    expect(area()?.value).toBe("Oak");
  });

  it("a half-typed note survives crossing 700 px, and one save is one write", async () => {
    mockAdd.mockResolvedValue({ result: item("n1"), undo: jest.fn() });
    page("phone");
    openNote();
    typeArea(area()!, "Oak");
    page("desktop");
    expect(q("[data-workspace]")).not.toBeNull();
    page("phone");
    expect(area()?.value).toBe("Oak");
    expect(mockAdd).not.toHaveBeenCalled();
    click(doc("[data-phb-add-save]"));
    await flush();
    expect(mockAdd).toHaveBeenCalledTimes(1);
  });

  it("a failed add keeps the sheet and the text", async () => {
    mockAdd.mockRejectedValue(new Error("403"));
    page("phone");
    openNote();
    typeArea(area()!, "Oak");
    click(doc("[data-phb-add-save]"));
    await flush();
    await flush();
    expect(area()?.value).toBe("Oak");
    expect(mockSnack).not.toHaveBeenCalled();
  });

  it("adds a link from a pasted address, and refuses one without a domain", async () => {
    mockAdd.mockReturnValue(new Promise(() => undefined));
    page("phone");
    click(q("[data-phb-add]"));
    click(doc('[data-phb-kind="link"]'));
    typeInto(doc<HTMLInputElement>("#phb-link")!, "localhost");
    expect(doc("#phb-link-err")?.getAttribute("role")).toBe("alert");
    expect(doc<HTMLButtonElement>("[data-phb-add-save]")?.disabled).toBe(true);
    typeInto(doc<HTMLInputElement>("#phb-link")!, "www.are.na/block/1987");
    expect(doc("#phb-link-err")).toBeNull();
    // Enter in the field is not stopped by the button's disabled state
    const pressEnter = () =>
      act(() => {
        doc("#phb-link")?.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Enter",
            bubbles: true,
            cancelable: true,
          })
        );
      });
    pressEnter();
    pressEnter();
    await flush();
    expect(mockAdd).toHaveBeenCalledTimes(1);
    expect(mockAdd).toHaveBeenCalledWith({
      boardId: "b1",
      draft: {
        kind: "link",
        url: "https://www.are.na/block/1987",
        title: "Are.na",
        source: { name: "Are.na", domain: "are.na" },
        ratio: 0.75,
      },
    });
  });

  it("adds a colour: a swatch by default, a typed hex when valid", async () => {
    mockAdd.mockResolvedValue({ result: item("n1"), undo: jest.fn() });
    page("phone");
    click(q("[data-phb-add]"));
    click(doc('[data-phb-kind="color"]'));
    typeInto(doc<HTMLInputElement>("#phb-hex")!, "c2410c");
    click(doc("[data-phb-add-save]"));
    await flush();
    expect(mockAdd).toHaveBeenCalledWith({
      boardId: "b1",
      draft: {
        kind: "color",
        color: "#C2410C",
        colorName: "Custom",
        ratio: 0.8,
      },
    });
  });

  it("removes a reference once, with Undo", async () => {
    mockItemsQuery = query([item("i1"), item("i2")]);
    const undo = jest.fn();
    mockRemove.mockResolvedValue({ result: undefined, undo });
    page("phone");
    click(q('[data-phb-item="i2"]'));
    expect(doc('[data-phb-detail="i2"]')).not.toBeNull();
    const rm = doc("[data-phb-item-remove]");
    click(rm);
    click(rm);
    await flush();
    expect(mockRemove).toHaveBeenCalledTimes(1);
    expect(mockRemove).toHaveBeenCalledWith({ boardId: "b1", id: "i2" });
    expect(mockSnack).toHaveBeenCalledWith("Reference removed", undo);
  });
});
