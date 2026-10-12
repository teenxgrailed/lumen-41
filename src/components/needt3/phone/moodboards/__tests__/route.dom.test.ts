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
const mockSnack = jest.fn();
const mockPush = jest.fn();
let mockBoards: unknown[] = [];
let mockPlanKind = "free";

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
const page = (
  ui: "phone" | "desktop",
  id = "b1",
  items: readonly unknown[] | null = []
) =>
  mount(
    ui,
    h(MoodboardRoute, {
      id,
      items: items as never,
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
  [mockCreate, mockUpdate, mockTrash, mockSnack, mockPush, mockInfo].forEach(
    (m) => m.mockReset()
  );
  mockBoards = [];
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

  it("shows the board page once its references are read", () => {
    page("phone");
    expect(q("[data-phb-page]")?.textContent).toContain("Rooms");
    expect(host.textContent).toContain("Nothing on this board yet");
    expect(q("[data-workspace]")).toBeNull();
  });

  it("until they can be read, the phone gets the existing workspace", () => {
    page("phone", "b1", null);
    expect(q("[data-workspace]")).not.toBeNull();
    expect(q("[data-phb-page]")).toBeNull();
    expect(host.textContent).not.toContain("References are not available");
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
