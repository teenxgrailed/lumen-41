/**
 * @jest-environment jsdom
 *
 * The phone reader over mocked data hooks: back, the ⋯ menu per role, the
 * keyboard's Done, Delete with Undo, no access; Page Style with the desktop's
 * Pro gates (a Free or still-loading plan gets the paywall instead of a
 * write, a stale plan's 403 does too); Share (full access only, invite
 * checks, roles, General access).
 */
import { act, createElement as h, createElement as mockH } from "react";

import { readFileSync } from "fs";
import { join } from "path";
import { type Root, createRoot } from "react-dom/client";

import type { V3Doc } from "@/lib/needt3/map";

import { PhoneUiProvider } from "../../../root/phone-ui-context";
import { usePhoneOverlays } from "../../overlays/store";
import { phoneCover } from "../../shell/cover";
import { DocumentFace } from "../Faces";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../../document/DocumentScreen", () => ({
  DocumentScreen: (p: { editorSlot: (el: HTMLElement | null) => void }) =>
    mockH(
      "i",
      { "data-face": "doc-desktop" },
      mockH("div", { ref: p.editorSlot })
    ),
}));
jest.mock("../../../root/V3Root", () => ({ useDesignV3: () => true }));
jest.mock("@/lib/notifications", () => ({
  notify: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const push = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/pages/d1",
}));

const invalidate = jest.fn();
jest.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    invalidateQueries: (...a: unknown[]) => invalidate(...a),
    getQueryData: () => undefined,
  }),
}));

jest.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { id: "u1", name: "Ana", email: "ana@x.io", image: null } },
  }),
}));

interface Q {
  status: "pending" | "error" | "success";
  fetchStatus: "fetching" | "paused" | "idle";
  data: V3Doc | undefined;
  error: unknown;
  refetch: jest.Mock;
}
let query: Q;
const update = jest.fn();
const trash = jest.fn();
jest.mock("@/lib/needt3/hooks/docs", () => ({
  useDoc: () => query,
  useUpdateDoc: () => ({ mutateAsync: (...a: unknown[]) => update(...a) }),
  useTrashDoc: () => ({ mutateAsync: (...a: unknown[]) => trash(...a) }),
  usePageEditSync: () => undefined,
}));

let plan: { kind: string } | undefined;
jest.mock("@/lib/needt3/hooks/plan", () => ({
  usePlan: () => ({ data: plan }),
}));

let access:
  | { myRole: string | null; ownerId: string; workspaceId: string }
  | undefined;
let grants: unknown[];
let published = false;
const setGrant = jest.fn();
const setLink = jest.fn();
jest.mock("@/lib/needt3/hooks/doc-share", () => ({
  useDocAccess: () => ({ data: access, isLoading: !access }),
  useDocGrants: () => ({ data: grants }),
  useDocInvitees: () => ({
    data: [
      { userId: "u2", name: "Bo", email: "bo@x.io", image: null },
      { userId: "u1", name: "Ana", email: "ana@x.io", image: null },
    ],
  }),
  useDocLink: () => ({
    data: { published, url: published ? "https://n/p/abc" : null },
  }),
  useSetDocGrant: () => ({
    mutateAsync: (...a: unknown[]) => setGrant(...a),
    isPending: false,
  }),
  useSetDocLink: () => ({ mutateAsync: (...a: unknown[]) => setLink(...a) }),
}));

const doc = (over: Partial<V3Doc> = {}): V3Doc => ({
  id: "d1",
  title: "Plan",
  icon: null,
  coverUrl: null,
  isFavorite: false,
  trashedAt: null,
  projectId: null,
  style: null,
  createdAt: "2026-10-01T10:00:00.000Z",
  updatedAt: "2026-10-05T10:00:00.000Z",
  ...over,
});
const ok = (d: V3Doc): Q => ({
  status: "success",
  fetchStatus: "idle",
  data: d,
  error: null,
  refetch: jest.fn(),
});

class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  push.mockClear();
  invalidate.mockClear();
  update.mockReset().mockResolvedValue({ result: null, undo: jest.fn() });
  trash.mockReset().mockResolvedValue({ result: null, undo: jest.fn() });
  setGrant.mockReset().mockResolvedValue({ undo: jest.fn() });
  setLink.mockReset().mockResolvedValue({ undo: jest.fn() });
  plan = { kind: "free" };
  access = { myRole: "FULL_ACCESS", ownerId: "u1", workspaceId: "w1" };
  grants = [];
  published = false;
  usePhoneOverlays.setState({ paywall: false });
  query = ok(doc());
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = RO;
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (q: string) => ({
      matches: q.includes("reduce"),
      media: q,
      addEventListener() {},
      removeEventListener() {},
    }),
  });
  jest
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockImplementation(() => null);
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get: () => 400,
  });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  jest.restoreAllMocks();
  act(() => root.unmount());
  host.remove();
  delete (HTMLElement.prototype as { offsetWidth?: number }).offsetWidth;
});

const app = (ui: "phone" | "desktop") =>
  h(PhoneUiProvider, {
    value: ui,
    children: h(DocumentFace, {
      pageId: "d1",
      children: h(
        "div",
        null,
        h("input", { "data-editor-field": "", "aria-label": "Title" }),
        h("div", {
          "data-assistant-avoid": "",
          "aria-label": "Page editing actions",
        })
      ),
    }),
  });
const mount = () => act(() => root.render(app("phone")));
const $ = <T extends Element>(sel: string) => host.querySelector<T>(sel)!;
const click = (el: Element) =>
  act(() => {
    (el as HTMLElement).click();
  });
const flush = () => act(async () => undefined);
const item = (id: string) =>
  host.querySelector<HTMLElement>(`[data-pd-item='${id}']`);
const openMenu = () => click($("[data-pd-more='doc']"));

describe("reader chrome", () => {
  it("back leaves for the list", () => {
    mount();
    click($("[data-pd-back]"));
    expect(push).toHaveBeenCalledWith("/pages");
  });

  it("the ⋯ menu holds Page Style, Share, Pin, Copy link and Delete", () => {
    mount();
    openMenu();
    expect($("[data-pd-menu]").getAttribute("data-pd-menu")).toBe("open");
    expect(
      Array.from(host.querySelectorAll("[data-pd-item]")).map((e) =>
        e.getAttribute("data-pd-item")
      )
    ).toEqual(["style", "share", "pin", "link", "delete"]);
  });

  it("until the role is known only Copy link is offered", () => {
    access = undefined;
    mount();
    openMenu();
    expect(
      Array.from(host.querySelectorAll("[data-pd-item]")).map((e) =>
        e.getAttribute("data-pd-item")
      )
    ).toEqual(["link"]);
  });

  it("a viewer can only copy the link", () => {
    access = { ownerId: "u1", workspaceId: "w1", myRole: "VIEWER" };
    mount();
    openMenu();
    expect(
      Array.from(host.querySelectorAll("[data-pd-item]")).map((e) =>
        e.getAttribute("data-pd-item")
      )
    ).toEqual(["link"]);
  });

  it("Pin writes isFavorite", async () => {
    mount();
    openMenu();
    click(item("pin")!);
    await flush();
    expect(update).toHaveBeenCalledWith({
      id: "d1",
      patch: { isFavorite: true },
    });
  });

  it("Delete moves the page to Trash and goes back to the list", async () => {
    mount();
    openMenu();
    click(item("delete")!);
    await flush();
    expect(trash).toHaveBeenCalledWith({ id: "d1", trashed: true });
    expect(push).toHaveBeenCalledWith("/pages");
  });

  it("the keyboard swaps ⋯ for Done and takes menu A's place", () => {
    mount();
    expect($("[data-pd-more='doc']")).not.toBeNull();
    const input = $<HTMLInputElement>("input[data-editor-field]");
    act(() => input.focus());
    expect($("[data-pd-acc='done']")).not.toBeNull();
    expect(host.querySelector("[data-pd-more='doc']")).toBeNull();
    expect(phoneCover.active()).toBe(true);
    click($("[data-pd-acc='done']"));
    expect(document.activeElement).not.toBe(input);
    expect($("[data-pd-more='doc']")).not.toBeNull();
    expect(phoneCover.active()).toBe(false);
  });

  it("a tap in the first 300 ms of the page's life is not swallowed", () => {
    jest.spyOn(performance, "now").mockReturnValue(5);
    mount();
    click($("[data-pd-back]"));
    expect(push).toHaveBeenCalledWith("/pages");
  });

  it("no access shows the state instead of the page", () => {
    query = {
      status: "error",
      fetchStatus: "idle",
      data: undefined,
      error: Object.assign(new Error("Forbidden"), { status: 403 }),
      refetch: jest.fn(),
    };
    mount();
    expect($("[data-st-noaccess]")).not.toBeNull();
    expect(host.querySelector("[data-editor-field]")).toBeNull();
    // the way out is still there
    click($("[data-pd-back]"));
    expect(push).toHaveBeenCalledWith("/pages");
  });

  it("a failed load offers Retry", () => {
    query = {
      status: "error",
      fetchStatus: "idle",
      data: undefined,
      error: new Error("boom"),
      refetch: jest.fn(),
    };
    mount();
    click($("[data-st-retry]"));
    expect(query.refetch).toHaveBeenCalledTimes(1);
  });

  it("draws the page in its own backdrop, font and cover", () => {
    query = ok(
      doc({
        coverUrl: "https://n/c.jpg",
        style: { backdrop: "dunes", page: "paper", font: "serif" },
      })
    );
    mount();
    expect($(".pd-doc").classList.contains("has-bd")).toBe(true);
    expect($("[data-doc-sheet]").getAttribute("data-dc-font")).toBe("serif");
    expect($("[data-mb-cover]")).not.toBeNull();
  });
});

describe("Page Style", () => {
  const openStyle = () => {
    mount();
    openMenu();
    click(item("style")!);
  };

  it("a free plan gets the paywall for a backdrop, not a write", () => {
    openStyle();
    click($("[data-pd-bg='gradient']"));
    expect(update).not.toHaveBeenCalled();
    expect(usePhoneOverlays.getState().paywall).toBe("Document themes");
  });

  it("a plan that has not loaded counts as Free", () => {
    plan = undefined;
    openStyle();
    click($("[data-pd-bg='image']"));
    expect(update).not.toHaveBeenCalled();
    expect(usePhoneOverlays.getState().paywall).toBe("Document themes");
  });

  it("a Pro plan writes the backdrop", () => {
    plan = { kind: "monthly" };
    openStyle();
    click($("[data-pd-bg='gradient']"));
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0].patch.style.backdrop).toBe("mist");
    expect(usePhoneOverlays.getState().paywall).toBe(false);
  });

  it("font is free on every plan, and keeps the other style keys", () => {
    query = ok(doc({ style: { backdrop: "none", page: "rose", wide: true } }));
    openStyle();
    click($("[data-pd-font='mono']"));
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0]).toEqual({
      id: "d1",
      patch: {
        style: expect.objectContaining({
          font: "mono",
          page: "rose",
          wide: true,
        }),
        coverUrl: null,
      },
    });
  });

  it("Default is a free preset; the others add a backdrop and are Pro", () => {
    openStyle();
    click($("[data-pd-preset='default']"));
    expect(update).toHaveBeenCalledTimes(1);
    expect(usePhoneOverlays.getState().paywall).toBe(false);
    click($("[data-pd-preset='paper']"));
    expect(update).toHaveBeenCalledTimes(1);
    expect(usePhoneOverlays.getState().paywall).toBe("Document themes");
    expect($("[data-pd-preset='paper']").hasAttribute("data-pro-locked")).toBe(
      true
    );
    expect(
      $("[data-pd-preset='default']").hasAttribute("data-pro-locked")
    ).toBe(false);
  });

  it("the server's UPGRADE_REQUIRED refreshes the plan and opens the paywall", async () => {
    plan = { kind: "monthly" };
    const { ApiError } = jest.requireActual("@/lib/needt3/hooks/core");
    update.mockRejectedValue(new ApiError(403, "UPGRADE_REQUIRED"));
    openStyle();
    click($("[data-pd-bg='image']"));
    await flush();
    expect(invalidate).toHaveBeenCalled();
    expect(usePhoneOverlays.getState().paywall).toBe("Document themes");
  });

  it("Solid asks for the page colour; three are free, the rest open the paywall", () => {
    openStyle();
    click($("[data-pd-bg='solid']"));
    expect(update).toHaveBeenCalledTimes(1);
    expect($("[data-pd-colors='page']")).not.toBeNull();
    click($("[data-pd-swatch='paper']"));
    expect(update).toHaveBeenCalledTimes(2);
    expect(update.mock.calls[1][0].patch.style.page).toBe("paper");
    // The Pro colours are marked and stop at the paywall.
    expect($("[data-pd-swatch='rose']").hasAttribute("data-pro-locked")).toBe(
      true
    );
    expect(
      $("[data-pd-swatch='graphite']").hasAttribute("data-pro-locked")
    ).toBe(false);
    click($("[data-pd-swatch='rose']"));
    expect(update).toHaveBeenCalledTimes(2);
    expect(usePhoneOverlays.getState().paywall).toBe("Document themes");
  });

  it("every page colour is open to Pro", () => {
    plan = { kind: "monthly" };
    openStyle();
    click($("[data-pd-bg='solid']"));
    click($("[data-pd-swatch='rose']"));
    expect(update.mock.calls[1][0].patch.style.page).toBe("rose");
    expect($("[data-pd-swatch='rose']").hasAttribute("data-pro-locked")).toBe(
      false
    );
  });

  it("a cover is Pro: Art and Image are marked and open the paywall on Free", () => {
    openStyle();
    expect($("[data-pd-cover='art']").hasAttribute("data-pro-locked")).toBe(
      true
    );
    expect($("[data-pd-cover='image']").hasAttribute("data-pro-locked")).toBe(
      true
    );
    click($("[data-pd-cover='art']"));
    expect(update).not.toHaveBeenCalled();
    expect(usePhoneOverlays.getState().paywall).toBe("Document themes");
  });

  it("Pro can pick a cover art", () => {
    plan = { kind: "monthly" };
    openStyle();
    click($("[data-pd-cover='art']"));
    expect(update.mock.calls[0][0].patch.coverUrl).toMatch(/^art:/);
  });

  it("the backdrop's look and blur appear only with a backdrop", () => {
    plan = { kind: "monthly" };
    query = ok(doc({ style: { backdrop: "ocean", page: "sky" } }));
    openStyle();
    expect($("[data-pd-look='faded']")).not.toBeNull();
    click($("[data-pd-look='faded']"));
    expect(update.mock.calls[0][0].patch.style.bdLook).toBe("faded");
    click($("[data-pd-blur]"));
    expect(update.mock.calls[1][0].patch.style.bdBlur).toBe(true);
  });

  it("with no backdrop there is no look or blur row", () => {
    openStyle();
    expect(host.querySelector("[data-pd-look]")).toBeNull();
    expect(host.querySelector("[data-pd-blur]")).toBeNull();
  });

  it("Cover None removes a picture, and does nothing when there is none", () => {
    openStyle();
    click($("[data-pd-cover='none']"));
    expect(update).not.toHaveBeenCalled();
    act(() => root.unmount());
    root = createRoot(host);
    query = ok(doc({ coverUrl: "https://n/c.jpg" }));
    openStyle();
    click($("[data-pd-cover='none']"));
    expect(update.mock.calls[0][0].patch.coverUrl).toBeNull();
  });
});

describe("Share", () => {
  const openShare = () => {
    mount();
    openMenu();
    click(item("share")!);
  };
  const typeEmail = (v: string) =>
    act(() => {
      const input = $<HTMLInputElement>("[data-pd-invite]");
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )!.set!.call(input, v);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

  it("only full access can change who sees the page", () => {
    access = { ownerId: "u1", workspaceId: "w1", myRole: "EDITOR" };
    openShare();
    expect($("[data-share-locked]")).not.toBeNull();
    expect(host.querySelector("[data-pd-invite]")).toBeNull();
  });

  it("invites a workspace member with the chosen role", async () => {
    openShare();
    expect($<HTMLButtonElement>("[data-share-invite]").disabled).toBe(true);
    typeEmail("bo@x.io");
    expect($<HTMLButtonElement>("[data-share-invite]").disabled).toBe(false);
    click($("[data-share-invite]"));
    await flush();
    expect(setGrant).toHaveBeenCalledWith({
      pageId: "d1",
      person: expect.objectContaining({ userId: "u2" }),
      role: "VIEWER",
    });
  });

  it("refuses an address outside the workspace, an invalid one and the owner", () => {
    openShare();
    typeEmail("nobody@else.io");
    expect($<HTMLButtonElement>("[data-share-invite]").disabled).toBe(true);
    expect(host.textContent).toContain("Only people in this workspace");
    typeEmail("nope");
    expect($<HTMLButtonElement>("[data-share-invite]").disabled).toBe(true);
    typeEmail("ana@x.io");
    expect($<HTMLButtonElement>("[data-share-invite]").disabled).toBe(true);
  });

  it("General access publishes and unpublishes the read-only link", async () => {
    openShare();
    const radios = host.querySelectorAll(
      "[data-share-access] button[role='radio']"
    );
    click(radios[1]);
    await flush();
    expect(setLink).toHaveBeenCalledWith({ pageId: "d1", on: true });
    setLink.mockClear();
    // already private: choosing Private again changes nothing
    click(radios[0]);
    expect(setLink).not.toHaveBeenCalled();
  });

  it("a person's row opens their roles, and Remove takes the access away", async () => {
    grants = [
      {
        userId: "u2",
        name: "Bo",
        email: "bo@x.io",
        image: null,
        role: "VIEWER",
      },
    ];
    openShare();
    click($("[data-share-member='bo@x.io']"));
    const labels = Array.from(host.querySelectorAll(".pk-act-label")).map(
      (e) => e.textContent
    );
    expect(labels).toEqual(
      expect.arrayContaining(["Can view", "Can edit", "Full access", "Remove"])
    );
    const edit = Array.from(host.querySelectorAll<HTMLElement>(".pk-act")).find(
      (e) => e.textContent?.includes("Can edit")
    )!;
    click(edit);
    await flush();
    expect(setGrant).toHaveBeenCalledWith({
      pageId: "d1",
      person: expect.objectContaining({ userId: "u2" }),
      role: "EDITOR",
    });
  });
});

describe("two faces, one state", () => {
  const face = (ui: "phone" | "desktop") => act(() => root.render(app(ui)));

  it("a Delete that lands after the width crossed 700 px still leaves the page", async () => {
    let done!: (v: unknown) => void;
    trash.mockReturnValue(
      new Promise((r) => {
        done = r;
      })
    );
    face("phone");
    openMenu();
    click(item("delete")!);
    face("desktop");
    expect($("[data-face='doc-desktop']")).not.toBeNull();
    await act(async () => {
      done({ result: null, undo: jest.fn() });
    });
    expect(trash).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/pages");
  });

  it("unmounting with the menu out leaves no moving flag on the host", () => {
    const frame = document.createElement("div");
    frame.setAttribute("data-v2p-host", "");
    document.body.appendChild(frame);
    const r2 = createRoot(frame);
    act(() => r2.render(app("phone")));
    click(frame.querySelector("[data-pd-more='doc']")!);
    expect(frame.hasAttribute("data-pk-moving")).toBe(true);
    act(() => r2.unmount());
    expect(frame.hasAttribute("data-pk-moving")).toBe(false);
    frame.remove();
  });
});

describe("Share: the invite field's error", () => {
  it("is announced and tied to the field", () => {
    access = { myRole: "FULL_ACCESS", ownerId: "u1", workspaceId: "w1" };
    mount();
    openMenu();
    click(item("share")!);
    const input = $<HTMLInputElement>("[data-pd-invite]");
    expect(input.getAttribute("aria-describedby")).toBeNull();
    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )!.set!.call(input, "nope");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const id = input.getAttribute("aria-describedby")!;
    const msg = document.getElementById(id)!;
    expect(msg.getAttribute("role")).toBe("alert");
    expect(msg.textContent).toContain("full email");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("enterkeyhint")).toBe("send");
    expect(input.getAttribute("autocomplete")).toBe("off");
  });
});

describe("the editor's action bar", () => {
  const read = (path: string) =>
    readFileSync(join(process.cwd(), path), "utf8");

  it("is not positioned from the reader's stylesheet: the reader's transform would make it fixed to the reader", () => {
    const css = read("src/styles/v3-overrides/docs.css");
    expect(css).not.toMatch(/\[aria-label="Page editing actions"\]\s*\{/);
  });

  it("floats as a pill with side margins at the bottom of the screen and is hidden until the editor has focus", () => {
    const css = read("src/app/globals.css");
    const rule = css.slice(
      css.indexOf(".needt-page-bar {"),
      css.indexOf("}", css.indexOf(".needt-page-bar {"))
    );
    expect(rule).toContain("position: fixed");
    expect(rule).toMatch(/left:\s*10px;/);
    expect(rule).toMatch(/right:\s*10px;/);
    expect(rule).toMatch(/border-radius:\s*24px;/);
    expect(css).toMatch(
      /\.needt-page-bar\[data-shown="false"\]\s*\{[^}]*visibility:\s*hidden/
    );
  });

  it("keeps the editor from springing and from re-blurring a document-tall layer while typing", () => {
    const css = read("src/styles/v3-overrides/docs.css");
    expect(css).toMatch(
      /\.pd-reader-scroll\s*\{[^}]*overscroll-behavior:\s*none/
    );
    expect(css).toMatch(
      /\.pd-reader\.is-editing \.pd-doc\.is-blur::before\s*\{[^}]*filter:\s*none/
    );
  });
});
