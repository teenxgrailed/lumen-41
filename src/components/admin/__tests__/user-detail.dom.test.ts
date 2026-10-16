/**
 * @jest-environment jsdom
 *
 * User detail: the facts, a confirm dialog before every action, the typed
 * email before a deletion, and no buttons for removing or deleting yourself.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { V3PortalScope } from "@/components/needt3/ctx/PortalScope";

import { UserDetailScreen } from "../UserDetailScreen";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const push = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/admin/users/u2",
}));
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: Record<string, unknown>) =>
    h("a", { href, ...rest }, children as never),
}));

const user = {
  id: "u2",
  email: "pat@example.com",
  name: null,
  role: "user",
  isActive: true,
  createdAt: "2026-09-01T10:00:00.000Z",
  lastSignInAt: "2026-10-15T08:30:00.000Z",
  trialEndsAt: "2026-10-20T00:00:00.000Z",
  plan: "PRO",
  subscription: null,
  providers: { signIn: ["google"], calendar: ["outlook"], mail: [] },
  deletionScheduledFor: null,
};

let host: HTMLDivElement;
let root: Root;
let calls: Array<{ url: string; init?: RequestInit }>;

beforeEach(() => {
  push.mockClear();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  calls = [];
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = "";
});

async function mount(viewerId: string, actionStatus = 200) {
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (init?.method === "POST") {
      return {
        ok: actionStatus === 200,
        status: actionStatus,
        json: async () =>
          actionStatus === 200
            ? { message: "Done." }
            : { error: "Refused for a reason." },
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ user, audit: [], viewerId }),
    };
  }) as unknown as typeof fetch;
  await act(async () => {
    root.render(h(V3PortalScope, null, h(UserDetailScreen, { userId: "u2" })));
  });
}

const act$ = (name: string) =>
  host.querySelector<HTMLButtonElement>(`[data-admin-act="${name}"]`)!;
const confirmButton = () =>
  document.querySelector<HTMLButtonElement>("[data-admin-confirm]");
const posts = () => calls.filter((c) => c.init?.method === "POST");

async function click(el: Element) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("UserDetailScreen", () => {
  it("shows plan, trial end, created, last sign-in, role and provider names", async () => {
    await mount("admin-1");
    const text = host.textContent ?? "";
    expect(text).toContain("pat@example.com");
    expect(text).toContain("Pro");
    expect(text).toContain("2026-10-20");
    expect(text).toContain("2026-09-01");
    expect(text).toContain("2026-10-15 08:30");
    expect(text).toContain("google");
    expect(text).toContain("outlook");
  });

  it("asks before it acts, and sends nothing until confirmed", async () => {
    await mount("admin-1");
    await click(act$("sign-out"));
    expect(confirmButton()).not.toBeNull();
    expect(posts()).toHaveLength(0);
    await click(confirmButton()!);
    expect(posts()).toHaveLength(1);
    expect(posts()[0].url).toBe("/api/admin/users/u2/actions");
    expect(JSON.parse(String(posts()[0].init?.body))).toEqual({
      action: "sign_out_everywhere",
    });
  });

  it("keeps the delete button off until the email is typed", async () => {
    await mount("admin-1");
    await click(act$("delete"));
    expect(confirmButton()?.disabled).toBe(true);
    const input = document.querySelector<HTMLInputElement>(
      'input[aria-label="Confirmation text"]'
    )!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )!.set!;
      setter.call(input, "pat@example.com");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(confirmButton()?.disabled).toBe(false);
    await click(confirmButton()!);
    expect(JSON.parse(String(posts()[0].init?.body))).toEqual({
      action: "delete_account",
      confirmEmail: "pat@example.com",
    });
    expect(push).toHaveBeenCalledWith("/admin/users");
  });

  it("shows the server's refusal in the dialog and stays open", async () => {
    await mount("admin-1", 409);
    await click(act$("sign-out"));
    await click(confirmButton()!);
    expect(document.body.textContent).toContain("Refused for a reason.");
    expect(confirmButton()).not.toBeNull();
  });

  it("offers no admin removal or deletion for your own account", async () => {
    await mount("u2");
    expect(act$("set-admin").disabled).toBe(true);
    expect(act$("delete").disabled).toBe(true);
  });
});
