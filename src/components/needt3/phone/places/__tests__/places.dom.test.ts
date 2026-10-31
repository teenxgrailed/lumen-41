/**
 * @jest-environment jsdom
 *
 * The four phone Places mounted over mocked data hooks: Connections (sections,
 * Connect / Reconnect, the account sheet, Disconnect only after a confirm, the
 * AI lock panel, the loading / error / offline states), Templates (one page
 * per press), Shared (rows, the access sheet, the empty state) and Trash
 * (what is there, Restore once, the 30-day line).
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { newDate } from "@/lib/date-utils";

import { PhoneUiProvider } from "../../../root/phone-ui-context";
import { usePhoneOverlays } from "../../overlays/store";
import {
  ConnectionsFace,
  SharedFace,
  TemplatesFace,
  TrashFace,
} from "../Faces";

/** Trash rows are dated relative to today, so "days left" never runs out. */
const daysAgo = (days: number) =>
  newDate(newDate().getTime() - days * 86_400_000).toISOString();

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// The desktop faces (also imported by Faces) read the flag from V3Root, which pulls in the whole frame.
jest.mock("../../../root/V3Root", () => ({ useDesignV3: () => true }));
jest.mock("@/components/needt3/connections/CalDavForm", () => ({
  CalDavForm: () => null,
}));

const push = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/connections",
}));
jest.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));
jest.mock("@/store/needt3-ui", () => ({
  useNeedt3Ui: (sel: (s: unknown) => unknown) =>
    sel({ openSettings: jest.fn() }),
}));

const notify = {
  success: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
};
jest.mock("@/lib/notifications", () => ({
  notify: {
    success: (...a: unknown[]) => notify.success(...a),
    error: (...a: unknown[]) => notify.error(...a),
    info: (...a: unknown[]) => notify.info(...a),
  },
}));

/* ---- connections ---- */
interface Q<T> {
  status: "pending" | "error" | "success";
  fetchStatus: "fetching" | "paused" | "idle";
  data: T | undefined;
  error: unknown;
  refetch: jest.Mock;
}
const ok = <T>(data: T): Q<T> => ({
  status: "success",
  fetchStatus: "idle",
  data,
  error: null,
  refetch: jest.fn(),
});

let catalogQ: Q<unknown>;
let accountsQ: Q<unknown>;
let planQ: { data: { kind: string } | undefined };
const connectToolkit = jest.fn();
const disconnectToolkit = jest.fn();
const disconnectCalendar = jest.fn();
const syncAccountNow = jest.fn();
jest.mock("@/lib/needt3/hooks/catalog", () => ({
  useCatalog: () => catalogQ,
  connectToolkit: (...a: unknown[]) => connectToolkit(...a),
  startOAuth: jest.fn(),
  disconnectToolkit: (...a: unknown[]) => disconnectToolkit(...a),
  disconnectCalendar: (...a: unknown[]) => disconnectCalendar(...a),
  disconnectMailbox: jest.fn(),
  syncAccountNow: (...a: unknown[]) => syncAccountNow(...a),
}));
jest.mock("@/lib/needt3/hooks/connections", () => ({
  useConnections: () => accountsQ,
}));
jest.mock("@/lib/needt3/hooks/plan", () => ({ usePlan: () => planQ }));

/* ---- places ---- */
let templatesQ: Q<unknown>;
let sharedQ: Q<unknown>;
const mutateAsync = jest.fn();
const builtinAsync = jest.fn();
jest.mock("@/lib/needt3/hooks/places", () => ({
  useTemplates: () => templatesQ,
  useCreateFromTemplate: () => ({
    mutateAsync: (...a: unknown[]) => mutateAsync(...a),
    isPending: false,
  }),
  useCreateFromBuiltin: () => ({
    mutateAsync: (...a: unknown[]) => builtinAsync(...a),
    isPending: false,
  }),
  useSharedDocs: () => sharedQ,
}));
jest.mock("@/lib/needt3/hooks/settings", () => ({
  useTimeZone: () => "UTC",
}));

let tasksQ: Q<unknown>;
let boardsQ: Q<unknown>;
let docsQ: Q<unknown>;
const restoreTask = jest.fn();
const trashBoardAsync = jest.fn();
const trashDocAsync = jest.fn();
const deleteDocAsync = jest.fn();
const deleteBoardAsync = jest.fn();
const deleteTaskAsync = jest.fn();
jest.mock("@/lib/needt3/hooks/docs", () => ({
  useTrashedDocs: () => docsQ,
  useTrashDoc: () => ({
    mutateAsync: (...a: unknown[]) => trashDocAsync(...a),
  }),
  useDeleteDocForever: () => ({
    mutateAsync: (...a: unknown[]) => deleteDocAsync(...a),
  }),
}));
jest.mock("@/lib/needt3/hooks/tasks", () => ({
  useTasks: () => tasksQ,
  useTrashTask: () => ({ restore: (...a: unknown[]) => restoreTask(...a) }),
  useDeleteTaskForever: () => ({
    mutateAsync: (...a: unknown[]) => deleteTaskAsync(...a),
  }),
}));
jest.mock("@/lib/needt3/hooks/boards", () => ({
  useBoards: () => boardsQ,
  useTrashBoard: () => ({
    mutateAsync: (...a: unknown[]) => trashBoardAsync(...a),
  }),
  useDeleteBoardForever: () => ({
    mutateAsync: (...a: unknown[]) => deleteBoardAsync(...a),
  }),
}));
jest.mock("@/lib/needt3/hooks/projects", () => ({
  useProjects: () => ({ data: [{ id: "p1", name: "Home" }] }),
}));

const entry = (
  slug: string,
  name: string,
  category: string,
  over: Record<string, unknown> = {}
) => ({
  slug,
  name,
  description: `${name} does things.`,
  category,
  native: false,
  configured: true,
  ...over,
});

const seed = () => {
  catalogQ = ok({
    catalog: [
      entry("google-calendar", "Google Calendar", "calendar", { native: true }),
      entry("notion", "Notion", "notes"),
      entry("linear", "Linear", "developer"),
    ],
    integrations: [{ id: "int-1", toolkit: "notion", status: "CONNECTED" }],
  });
  accountsQ = ok([
    {
      provider: "outlook",
      kind: "mail",
      state: "disconnected",
      label: "me@o.com",
      detail: "Needs reconnecting",
      accountId: "mb-1",
    },
    {
      provider: "google",
      kind: "calendar",
      state: "connected",
      label: "me@x.com",
      detail: null,
      accountId: "cal-1",
    },
  ]);
  planQ = { data: { kind: "monthly" } };
  templatesQ = ok([
    {
      id: "t1",
      name: "Weekly review",
      description: "Look back",
      updatedAt: null,
    },
    { id: "t2", name: "Trip", description: null, updatedAt: null },
  ]);
  sharedQ = ok([
    {
      doc: { id: "d1", title: "Plan" },
      role: "EDITOR",
    },
    { doc: { id: "d2", title: "" }, role: "VIEWER" },
  ]);
  tasksQ = ok([
    {
      id: "k1",
      title: "Old task",
      trashedAt: daysAgo(20),
      projectId: "p1",
    },
  ]);
  boardsQ = ok([
    { id: "b1", title: "Ideas", trashedAt: daysAgo(11) },
    { id: "b2", title: "Live", trashedAt: null },
  ]);
  docsQ = ok([
    {
      id: "pg1",
      title: "Brief",
      trashedAt: daysAgo(9),
      projectId: null,
      coverUrl: null,
      style: null,
    },
  ]);
};

class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  seed();
  for (const m of [
    push,
    connectToolkit,
    disconnectToolkit,
    disconnectCalendar,
    mutateAsync,
    builtinAsync,
    restoreTask,
    trashBoardAsync,
    trashDocAsync,
    deleteDocAsync,
    deleteBoardAsync,
    notify.success,
    notify.error,
    notify.info,
  ])
    m.mockReset();
  usePhoneOverlays.setState({ paywall: false });
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
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
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  jest.restoreAllMocks();
  act(() => root.unmount());
  host.remove();
});

const mount = (face: () => unknown) =>
  act(() =>
    root.render(h(PhoneUiProvider, { value: "phone" }, h(face as never)))
  );
const $ = <T extends Element>(sel: string) => host.querySelector<T>(sel);
const $$ = (sel: string) => Array.from(host.querySelectorAll(sel));
const click = (el: Element | null) =>
  act(() => {
    (el as HTMLElement).click();
  });
const type = (input: HTMLInputElement, value: string) =>
  act(() => {
    const set = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!;
    set.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
const flush = () => act(async () => {});
const text = (el: Element | null) => (el?.textContent ?? "").trim();
const sheetOf = (label: string) =>
  $(`[role="dialog"][aria-label="${label}"]`)?.closest(".pk-sheet-layer") ??
  null;
const rowTitles = () => $$(".ppl-row-title").map((e) => text(e));

describe("Connections", () => {
  it("lists what needs you first, then the categories, with the right action", () => {
    mount(ConnectionsFace);
    const sections = $$(".pk-sec .pk-label").map((e) => text(e));
    expect(sections[0]).toBe("Needs you");
    expect(rowTitles().slice(0, 1)).toEqual(["Outlook Mail"]);
    expect(rowTitles()).toEqual(
      expect.arrayContaining(["Google Calendar", "Notion", "Linear"])
    );
    // lost: a primary Reconnect; connected: no button; not connected: Connect
    expect($('[data-ppl-reconnect="outlook-mail"]')).not.toBeNull();
    expect($('[data-ppl-connect="outlook-mail"]')).toBeNull();
    expect($('[data-ppl-connect="google-calendar"]')).toBeNull();
    expect($('[data-ppl-reconnect="google-calendar"]')).toBeNull();
    expect($('[data-ppl-connect="linear"]')).not.toBeNull();
    expect(text($(".pk-sub"))).toBe("Outlook Mail needs reconnecting");
    expect($('[data-state="disconnected"]')).not.toBeNull();
  });

  it("Connect starts the toolkit's own consent screen; a failure says so and the row recovers", async () => {
    connectToolkit.mockResolvedValue({ ok: false, error: "Nope" });
    mount(ConnectionsFace);
    click($('[data-ppl-connect="linear"]'));
    expect(connectToolkit).toHaveBeenCalledWith("linear");
    await flush();
    expect(notify.error).toHaveBeenCalledWith("Nope");
    expect($('[data-ppl-connect="linear"]')!.hasAttribute("disabled")).toBe(
      false
    );
  });

  it("a row opens its account sheet; Disconnect asks first and writes once", async () => {
    disconnectCalendar.mockResolvedValue({ ok: true });
    mount(ConnectionsFace);
    expect(sheetOf("Google Calendar")).toBeNull();
    click($('[data-ppl-conn="google-calendar"] .ppl-row-main'));
    expect(sheetOf("Google Calendar")?.getAttribute("data-pk-sheet")).toBe(
      "open"
    );
    expect(text($("[data-ppl-status]"))).toBe("Connected");

    // Disconnect only opens the confirm; nothing is written
    click($('[data-ppl-disconnect="google-calendar"]'));
    expect(disconnectCalendar).not.toHaveBeenCalled();
    const confirm = $$(".pk-sheet-layer").find((l) =>
      text(l.querySelector(".pk-sheet-title")).startsWith("Disconnect Google")
    )!;
    expect(confirm.getAttribute("data-pk-sheet")).toBe("open");

    // Cancel: still nothing
    click(
      Array.from(confirm.querySelectorAll("button")).find(
        (b) => text(b) === "Cancel"
      ) ?? null
    );
    expect(confirm.getAttribute("data-pk-sheet")).toBe("shut");
    expect(disconnectCalendar).not.toHaveBeenCalled();

    // confirm for real
    click($('[data-ppl-disconnect="google-calendar"]'));
    click(confirm.querySelector("[data-ppl-bye]"));
    await flush();
    expect(disconnectCalendar).toHaveBeenCalledTimes(1);
    expect(disconnectCalendar).toHaveBeenCalledWith("cal-1");
    expect(notify.success).toHaveBeenCalledWith(
      "Google Calendar (me@x.com) disconnected"
    );
    expect(confirm.getAttribute("data-pk-sheet")).toBe("shut");
    expect(sheetOf("Google Calendar")?.getAttribute("data-pk-sheet")).toBe(
      "shut"
    );
  });

  it("Sync now in the account sheet queues that account and closes the sheet", async () => {
    syncAccountNow.mockResolvedValue({ ok: true, queued: 1 });
    mount(ConnectionsFace);
    click($('[data-ppl-conn="google-calendar"] .ppl-row-main'));
    click($('[data-ppl-sync="google-calendar"]'));
    await flush();
    expect(syncAccountNow).toHaveBeenCalledWith("calendar", "cal-1");
    expect(notify.success).toHaveBeenCalledWith("Syncing Google Calendar…");
    expect(sheetOf("Google Calendar")?.getAttribute("data-pk-sheet")).toBe(
      "shut"
    );
  });

  it("a failed disconnect keeps the data and says why", async () => {
    disconnectCalendar.mockResolvedValue({
      ok: false,
      error: "Server said no",
    });
    mount(ConnectionsFace);
    click($('[data-ppl-conn="google-calendar"] .ppl-row-main'));
    click($('[data-ppl-disconnect="google-calendar"]'));
    click($("[data-ppl-bye]"));
    await flush();
    expect(notify.error).toHaveBeenCalledWith("Server said no");
    expect(notify.success).not.toHaveBeenCalled();
  });

  it("search narrows the list, an empty result offers Show all", () => {
    mount(ConnectionsFace);
    type($<HTMLInputElement>("[data-ppl-search]")!, "zzz");
    expect(rowTitles()).toEqual([]);
    expect(text($(".pk-empty"))).toContain("Nothing matches “zzz”.");
    click($("[data-ppl-clear]"));
    expect(rowTitles().length).toBe(5);
  });

  it("the Connected chip keeps what is connected; All clears it", () => {
    mount(ConnectionsFace);
    click($('[data-ppl-chip="connected"]'));
    expect(rowTitles().sort()).toEqual(
      ["Google Calendar", "Notion", "Outlook Mail"].sort()
    );
    expect($('[data-ppl-chip="connected"]')!.getAttribute("aria-pressed")).toBe(
      "true"
    );
    click($('[data-ppl-chip="all"]'));
    expect(rowTitles().length).toBe(5);
  });

  it("the AI tools tab is a lock panel on Free and opens the paywall", () => {
    planQ = { data: { kind: "free" } };
    mount(ConnectionsFace);
    click($('[data-ppl-tab="ai"]'));
    expect($("[data-ppl-ai-promo]")).not.toBeNull();
    click($("[data-ppl-promo-plans]"));
    expect(usePhoneOverlays.getState().paywall).toBe(true);
    click($("[data-ppl-promo-try]"));
    expect(usePhoneOverlays.getState().paywall).toBe("AI tools");
    // the tab is remembered like the desktop's
    expect(window.localStorage.getItem("needt.connections.tab")).toBe("ai");
  });

  it("loading shows rows of bars; an error and offline offer Retry", () => {
    catalogQ = {
      status: "pending",
      fetchStatus: "fetching",
      data: undefined,
      error: null,
      refetch: jest.fn(),
    };
    mount(ConnectionsFace);
    expect($("[data-ppl-skeleton]")).not.toBeNull();
    expect(text($(".pk-sub"))).toBe("");

    const refetch = jest.fn();
    catalogQ = {
      status: "error",
      fetchStatus: "idle",
      data: undefined,
      error: new Error("x"),
      refetch,
    };
    mount(ConnectionsFace);
    expect($('[data-ppl-state="error"]')).not.toBeNull();
    expect(text($('[data-ppl-state="error"]'))).toContain("your connections");
    click($("[data-ppl-retry]"));
    expect(refetch).toHaveBeenCalled();

    catalogQ = {
      status: "pending",
      fetchStatus: "paused",
      data: undefined,
      error: null,
      refetch: jest.fn(),
    };
    mount(ConnectionsFace);
    expect(text($('[data-ppl-state="offline"]'))).toContain("offline");
  });
});

describe("Templates", () => {
  it("lists the person's templates; Use makes one page, tells and opens it", async () => {
    const undo = jest.fn();
    let finish!: (v: unknown) => void;
    mutateAsync.mockReturnValue(new Promise((r) => (finish = r)));
    mount(TemplatesFace);
    // the person's own first, then the set that comes with Needt
    expect($$(".ppl-card-title").map((e) => text(e))).toEqual([
      "Weekly review",
      "Trip",
      "Daily note",
      "Weekly review",
      "Product drop",
      "Meeting notes",
      "Resale listing",
      "Project brief",
    ]);
    expect(text($(".pk-sub"))).toBe("8 to start from");

    click($('[data-ppl-use="Weekly review"]'));
    click($('[data-ppl-use="Weekly review"]'));
    click($('[data-ppl-use="Trip"]'));
    expect(builtinAsync).not.toHaveBeenCalled();
    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(mutateAsync.mock.calls[0][0]).toMatchObject({
      templateId: "t1",
      title: expect.stringMatching(/^Weekly review — \d+ \w+$/),
    });
    await act(async () => finish({ result: { id: "pg9" }, undo }));
    expect(notify.success).toHaveBeenCalledTimes(1);
    expect(notify.success.mock.calls[0][0]).toBe(
      "Created from “Weekly review”"
    );
    expect(push).toHaveBeenCalledWith("/pages/pg9");
    // Undo sends the page to Trash through the mutation's own inverse
    notify.success.mock.calls[0][1].action.onClick();
    expect(undo).toHaveBeenCalled();
  });

  it("a built-in template makes a page through its own mutation", async () => {
    const undo = jest.fn();
    builtinAsync.mockResolvedValue({ result: { id: "pg7" }, undo });
    mount(TemplatesFace);
    click($('[data-ppl-use="Daily note"]'));
    await flush();
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(builtinAsync).toHaveBeenCalledWith({
      builtinId: "builtin:daily",
      title: expect.stringMatching(/^Daily note — \d+ \w+$/),
    });
    expect(notify.success.mock.calls[0][0]).toBe("Created from “Daily note”");
    expect(push).toHaveBeenCalledWith("/pages/pg7");
    notify.success.mock.calls[0][1].action.onClick();
    expect(undo).toHaveBeenCalled();
  });

  it("a press that comes back empty opens nothing and frees the button", async () => {
    mutateAsync.mockResolvedValueOnce({ result: null, undo: jest.fn() });
    mount(TemplatesFace);
    click($('[data-ppl-use="Trip"]'));
    await flush();
    expect(push).not.toHaveBeenCalled();
    mutateAsync.mockResolvedValueOnce({ result: { id: "x" }, undo: jest.fn() });
    click($('[data-ppl-use="Trip"]'));
    await flush();
    expect(push).toHaveBeenCalledWith("/pages/x");
  });

  it("with none saved, the built-in set is still there; a failed load shows the error", () => {
    templatesQ = ok([]);
    mount(TemplatesFace);
    expect($(".pk-empty")).toBeNull();
    expect($$(".ppl-card-title")).toHaveLength(6);
    expect(text($(".pk-sub"))).toBe("6 to start from");
    templatesQ = {
      status: "error",
      fetchStatus: "idle",
      data: undefined,
      error: new Error("x"),
      refetch: jest.fn(),
    };
    mount(TemplatesFace);
    expect($('[data-ppl-state="error"]')).not.toBeNull();
  });
});

describe("Shared", () => {
  it("rows carry the access; a row opens the page, the info button the access sheet", () => {
    mount(SharedFace);
    expect(rowTitles()).toEqual(["Plan", "Untitled"]);
    expect($$(".ppl-role").map((e) => text(e))).toEqual([
      "Can edit",
      "Can view",
    ]);
    expect(text($(".pk-sub"))).toBe("2 pages shared with you");
    click($('[data-ppl-shared="d1"] .ppl-row-main'));
    expect(push).toHaveBeenCalledWith("/pages/d1");

    click($('[data-ppl-access="d1"]'));
    const sheet = sheetOf("Access")!;
    expect(sheet.getAttribute("data-pk-sheet")).toBe("open");
    const on = Array.from(sheet.querySelectorAll(".ppl-perm.is-on")).map((e) =>
      text(e.querySelector(".ppl-perm-title"))
    );
    expect(on).toEqual(["Can edit"]);
    // nothing in it pretends to a route that is not there
    expect(text(sheet)).not.toMatch(/Ask to edit|Owner/);
    click(sheet.querySelector("[data-ppl-access-open]"));
    expect(push).toHaveBeenLastCalledWith("/pages/d1");
    expect(sheet.getAttribute("data-pk-sheet")).toBe("shut");
  });

  it("nothing shared yet: the empty state offers Documents", () => {
    sharedQ = ok([]);
    mount(SharedFace);
    expect(text($(".pk-empty"))).toContain("Nothing shared with you yet");
    expect(text($(".pk-sub"))).toBe("Nothing yet");
    click($("[data-ppl-go-docs]"));
    expect(push).toHaveBeenCalledWith("/pages");
  });
});

describe("Trash", () => {
  it("lists pages, tasks and moodboards with the days left and the 30-day line", () => {
    mount(TrashFace);
    expect($$(".pk-sec .pk-label").map((e) => text(e))).toEqual([
      "Pages",
      "Tasks",
      "Moodboards",
    ]);
    expect(rowTitles()).toEqual(["Brief", "Old task", "Ideas"]);
    expect(text($('[data-ppl-trash="task:k1"] .ppl-row-meta'))).toMatch(
      /from Home · \d+ days? left$/
    );
    expect(text($(".pk-sub"))).toBe("3 items · kept 30 days");
    // every kind can go for good
    expect($('[data-ppl-forever="pg1"]')).not.toBeNull();
    expect($('[data-ppl-forever="b1"]')).not.toBeNull();
    expect($('[data-ppl-forever="k1"]')).not.toBeNull();
    expect($("[data-ppl-empty]")).not.toBeNull();
    expect($("[data-ppl-restore-all]")).not.toBeNull();
  });

  it("Restore writes once, even on a double tap, and offers Undo", async () => {
    const undo = jest.fn();
    let finish!: (v: unknown) => void;
    restoreTask.mockReturnValue(new Promise((r) => (finish = r)));
    mount(TrashFace);
    click($('[data-ppl-restore="task:k1"]'));
    click($('[data-ppl-restore="task:k1"]'));
    expect(restoreTask).toHaveBeenCalledTimes(1);
    expect(restoreTask).toHaveBeenCalledWith("k1");
    await act(async () => finish({ undo }));
    expect(notify.success).toHaveBeenCalledWith(
      "Restored “Old task”",
      expect.objectContaining({
        action: expect.objectContaining({ label: "Undo" }),
      })
    );
    notify.success.mock.calls[0][1].action.onClick();
    expect(undo).toHaveBeenCalled();
    // free again afterwards
    restoreTask.mockResolvedValue({ undo });
    click($('[data-ppl-restore="task:k1"]'));
    expect(restoreTask).toHaveBeenCalledTimes(2);
  });

  it("a moodboard restores through the board mutation", async () => {
    trashBoardAsync.mockResolvedValue({ undo: jest.fn() });
    mount(TrashFace);
    click($('[data-ppl-restore="board:b1"]'));
    await flush();
    expect(trashBoardAsync).toHaveBeenCalledWith({ id: "b1", trashed: false });
    expect(notify.success.mock.calls[0][0]).toBe("Restored “Ideas”");
  });

  it("a page restores with Undo", async () => {
    const undo = jest.fn();
    trashDocAsync.mockResolvedValue({ undo });
    mount(TrashFace);
    click($('[data-ppl-restore="page:pg1"]'));
    await flush();
    expect(trashDocAsync).toHaveBeenCalledWith({ id: "pg1", trashed: false });
    expect(notify.success.mock.calls[0][0]).toBe("Restored “Brief”");
    notify.success.mock.calls[0][1].action.onClick();
    expect(undo).toHaveBeenCalled();
  });

  it("Delete forever asks first, says there is no Undo, then deletes once", async () => {
    deleteDocAsync.mockResolvedValue({});
    mount(TrashFace);
    click($('[data-ppl-forever="pg1"]'));
    // the first tap only opens the confirm
    expect(deleteDocAsync).not.toHaveBeenCalled();
    const sheet = $$(".pk-sheet-layer").find((l) =>
      text(l.querySelector(".pk-sheet-title")).startsWith("Delete “Brief”")
    )!;
    expect(sheet.getAttribute("data-pk-sheet")).toBe("open");
    expect(text(sheet)).toContain("can’t be undone");
    click(sheet.querySelector("[data-ppl-confirm]"));
    await flush();
    expect(deleteDocAsync).toHaveBeenCalledTimes(1);
    expect(deleteDocAsync).toHaveBeenCalledWith({ id: "pg1" });
    expect(notify.success.mock.calls[0][0]).toBe("Deleted “Brief” for good");
  });

  it("Delete forever on a task asks first, then deletes that task", async () => {
    deleteTaskAsync.mockResolvedValue({});
    mount(TrashFace);
    click($('[data-ppl-forever="k1"]'));
    expect(deleteTaskAsync).not.toHaveBeenCalled();
    const sheet = $$(".pk-sheet-layer").find((l) =>
      text(l.querySelector(".pk-sheet-title")).startsWith("Delete “Old task”")
    )!;
    click(sheet.querySelector("[data-ppl-confirm]"));
    await flush();
    expect(deleteTaskAsync).toHaveBeenCalledWith({ id: "k1" });
    expect(notify.success.mock.calls[0][0]).toBe("Deleted “Old task” for good");
  });

  it("Restore all puts back every page, task and moodboard, with one notice", async () => {
    trashDocAsync.mockResolvedValue({});
    trashBoardAsync.mockResolvedValue({});
    restoreTask.mockResolvedValue({});
    mount(TrashFace);
    click($("[data-ppl-restore-all]"));
    await flush();
    expect(trashDocAsync).toHaveBeenCalledWith({ id: "pg1", trashed: false });
    expect(trashBoardAsync).toHaveBeenCalledWith({ id: "b1", trashed: false });
    expect(restoreTask).toHaveBeenCalledWith("k1");
    expect(notify.success).toHaveBeenCalledTimes(1);
    expect(notify.success.mock.calls[0][0]).toBe("Restored 3 items");
  });

  it("Empty Trash names what goes, then deletes pages, tasks and moodboards", async () => {
    deleteDocAsync.mockResolvedValue({});
    deleteBoardAsync.mockResolvedValue({});
    deleteTaskAsync.mockResolvedValue({});
    mount(TrashFace);
    click($("[data-ppl-empty]"));
    expect(deleteDocAsync).not.toHaveBeenCalled();
    const sheet = $$(".pk-sheet-layer").find(
      (l) => text(l.querySelector(".pk-sheet-title")) === "Empty Trash?"
    )!;
    expect(text(sheet)).toContain("1 page, 1 task and 1 moodboard");
    click(sheet.querySelector("[data-ppl-confirm]"));
    await flush();
    expect(deleteDocAsync).toHaveBeenCalledWith({ id: "pg1" });
    expect(deleteBoardAsync).toHaveBeenCalledWith({ id: "b1" });
    expect(deleteTaskAsync).toHaveBeenCalledWith({ id: "k1" });
    expect(restoreTask).not.toHaveBeenCalled();
    expect(notify.success.mock.calls[0][0]).toBe("Trash emptied");
  });

  it("an empty Trash says where things land; a failed load offers Retry", () => {
    tasksQ = ok([]);
    boardsQ = ok([]);
    docsQ = ok([]);
    mount(TrashFace);
    expect(text($(".pk-empty"))).toContain("Trash is empty");
    expect($("[data-ppl-empty]")).toBeNull();
    expect(text($(".pk-sub"))).toBe(
      "Pages, tasks and moodboards stay here for 30 days"
    );
    boardsQ = {
      status: "error",
      fetchStatus: "idle",
      data: undefined,
      error: new Error("x"),
      refetch: jest.fn(),
    };
    mount(TrashFace);
    expect(text($('[data-ppl-state="error"]'))).toContain("Trash");
  });
});
