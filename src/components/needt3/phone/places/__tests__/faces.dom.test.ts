/**
 * @jest-environment jsdom
 *
 * The Places routes' two faces share one controller: crossing 700 px swaps the
 * face and keeps what the person typed or has in flight, and a write that was
 * started on one face is not started again from the other.
 */
import { act, createElement as h, createElement as mockH } from "react";

import { type Root, createRoot } from "react-dom/client";

import { PhoneUiProvider } from "../../../root/phone-ui-context";
import {
  ConnectionsFace,
  SharedFace,
  TemplatesFace,
  TrashFace,
} from "../Faces";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type Ctl = Record<string, (...a: unknown[]) => unknown> & { q?: string };
const stub =
  (face: string, buttons: Record<string, (c: Ctl) => unknown>) =>
  (p: { c?: Ctl }) =>
    mockH(
      "i",
      { "data-face": face, "data-q": p.c?.q ?? "" },
      ...Object.entries(buttons).map(([name, run]) =>
        mockH("button", {
          key: name,
          "data-do": name,
          onClick: () => void run(p.c!),
        })
      )
    );

jest.mock("../../../connections/ConnectionsScreen", () => ({
  ConnectionsScreen: (p: { c: Ctl }) =>
    stub("conn-desktop", {
      type: (c) => c.setQ?.("abc"),
    })(p),
}));
jest.mock("../ConnectionsPhone", () => ({
  ConnectionsPhone: (p: { c: Ctl }) =>
    stub("conn-phone", {
      type: (c) => c.setQ?.("abc"),
    })(p),
}));
jest.mock("../../../places/TemplatesScreen", () => ({
  TemplatesScreen: (p: { c: Ctl }) =>
    stub("tpl-desktop", { use: (c) => c.makePage?.("t1", "Weekly") })(p),
}));
jest.mock("../TemplatesPhone", () => ({
  TemplatesPhone: (p: { c: Ctl }) =>
    stub("tpl-phone", { use: (c) => c.makePage?.("t1", "Weekly") })(p),
}));
jest.mock("../../../places/TrashScreen", () => ({
  TrashScreen: (p: { c: Ctl }) =>
    stub("trash-desktop", { restore: (c) => c.restoreTask?.("k1", "Old") })(p),
}));
jest.mock("../TrashPhone", () => ({
  TrashPhone: (p: { c: Ctl }) =>
    stub("trash-phone", { restore: (c) => c.restoreTask?.("k1", "Old") })(p),
}));
jest.mock("../../../places/SharedScreen", () => ({
  SharedScreen: () => mockH("i", { "data-face": "shared-desktop" }),
}));
jest.mock("../SharedPhone", () => ({
  SharedPhone: () => mockH("i", { "data-face": "shared-phone" }),
}));

jest.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
const push = jest.fn();
jest.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));
jest.mock("@/store/needt3-ui", () => ({
  useNeedt3Ui: (sel: (s: unknown) => unknown) =>
    sel({ openSettings: jest.fn() }),
}));
const success = jest.fn();
jest.mock("@/lib/notifications", () => ({
  notify: { success: (...a: unknown[]) => success(...a) },
}));
const idle = { status: "success", fetchStatus: "idle", error: null };
jest.mock("@/lib/needt3/hooks/catalog", () => ({
  useCatalog: () => ({ ...idle, data: { catalog: [], integrations: [] } }),
  connectToolkit: jest.fn(),
  disconnectCalendar: jest.fn(),
  disconnectMailbox: jest.fn(),
  disconnectToolkit: jest.fn(),
}));
jest.mock("@/lib/needt3/hooks/connections", () => ({
  useConnections: () => ({ ...idle, data: [] }),
}));
jest.mock("@/lib/needt3/hooks/plan", () => ({
  usePlan: () => ({ data: { kind: "monthly" } }),
}));
const mutateAsync = jest.fn();
jest.mock("@/lib/needt3/hooks/places", () => ({
  useTemplates: () => ({ ...idle, data: [] }),
  // isPending never turns true here: the guard under test is the controller's.
  useCreateFromTemplate: () => ({
    mutateAsync: (...a: unknown[]) => mutateAsync(...a),
    isPending: false,
  }),
  useSharedDocs: () => ({ ...idle, data: [] }),
}));
jest.mock("@/lib/needt3/hooks/settings", () => ({ useTimeZone: () => "UTC" }));
const restore = jest.fn();
jest.mock("@/lib/needt3/hooks/tasks", () => ({
  useTasks: () => ({ ...idle, data: [] }),
  useTrashTask: () => ({ restore: (...a: unknown[]) => restore(...a) }),
}));
jest.mock("@/lib/needt3/hooks/boards", () => ({
  useBoards: () => ({ ...idle, data: [] }),
  useTrashBoard: () => ({ mutateAsync: jest.fn() }),
}));
jest.mock("@/lib/needt3/hooks/projects", () => ({
  useProjects: () => ({ data: [] }),
}));

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  for (const m of [push, success, mutateAsync, restore]) m.mockReset();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const show = (ui: "phone" | "desktop", Face: () => unknown) =>
  act(() => root.render(h(PhoneUiProvider, { value: ui }, h(Face as never))));
const face = () => host.querySelector("[data-face]")!;
const press = (name: string) =>
  act(() => {
    (face().querySelector(`[data-do="${name}"]`) as HTMLElement).click();
  });

describe("the right face", () => {
  it.each([
    ["Connections", ConnectionsFace, "conn-phone", "conn-desktop"],
    ["Templates", TemplatesFace, "tpl-phone", "tpl-desktop"],
    ["Shared", SharedFace, "shared-phone", "shared-desktop"],
    ["Trash", TrashFace, "trash-phone", "trash-desktop"],
  ] as const)("%s: phone on a phone, desktop otherwise", (_n, Face, p, d) => {
    show("phone", Face);
    expect(face().getAttribute("data-face")).toBe(p);
    show("desktop", Face);
    expect(face().getAttribute("data-face")).toBe(d);
    show("phone", Face);
    expect(face().getAttribute("data-face")).toBe(p);
  });
});

describe("one controller above the switch", () => {
  it("Connections keeps what was typed when the window crosses 700 px", () => {
    show("desktop", ConnectionsFace);
    press("type");
    expect(face().getAttribute("data-q")).toBe("abc");
    show("phone", ConnectionsFace);
    expect(face().getAttribute("data-face")).toBe("conn-phone");
    expect(face().getAttribute("data-q")).toBe("abc");
    show("desktop", ConnectionsFace);
    expect(face().getAttribute("data-q")).toBe("abc");
  });

  it("Templates: a press in flight on one face is not repeated from the other, and its follow-up still runs", async () => {
    let finish!: (v: unknown) => void;
    mutateAsync.mockReturnValue(new Promise((r) => (finish = r)));
    show("desktop", TemplatesFace);
    press("use");
    show("phone", TemplatesFace);
    press("use");
    expect(mutateAsync).toHaveBeenCalledTimes(1);
    await act(async () => finish({ result: { id: "pg1" }, undo: jest.fn() }));
    expect(success).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/pages/pg1");
  });

  it("Trash: one Restore per item across the swap", async () => {
    let finish!: (v: unknown) => void;
    restore.mockReturnValue(new Promise((r) => (finish = r)));
    show("phone", TrashFace);
    press("restore");
    show("desktop", TrashFace);
    press("restore");
    expect(restore).toHaveBeenCalledTimes(1);
    await act(async () => finish({ undo: jest.fn() }));
    expect(success).toHaveBeenCalledTimes(1);
  });
});
