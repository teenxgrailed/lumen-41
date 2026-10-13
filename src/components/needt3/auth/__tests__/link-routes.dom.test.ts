/**
 * @jest-environment jsdom
 *
 * The two pages a link in a Needt mail opens, on both faces: "Set a new
 * password" (reset token) and "Confirm your email". The calls are the
 * existing endpoints; what is asserted is what each answer draws.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { V3ConfirmEmailRoute } from "../ConfirmEmailRoute";
import { V3ResetPasswordRoute } from "../ResetPasswordRoute";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/lib/needt3/fonts", () => ({ V3_FONT_CLASSES: "" }));
jest.mock("@/styles/v3-entry.css", () => ({}), { virtual: true });
jest.mock(
  "lucide-react",
  () =>
    new Proxy(
      { __esModule: true },
      { get: (t, k) => (k in t ? (t as never)[k] : () => null) }
    )
);
jest.mock("@/lib/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

type Answer = { status: number; body?: unknown } | "throw";
let answers: Record<string, Answer> = {};
const fetchMock = jest.fn(async (url: string) => {
  const answer = answers[url] ?? { status: 404 };
  if (answer === "throw") throw new Error("offline");
  return {
    ok: answer.status >= 200 && answer.status < 300,
    status: answer.status,
    json: async () => answer.body ?? {},
  };
});
const assign = jest.fn();

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  jest.clearAllMocks();
  answers = {};
  (globalThis as { fetch?: unknown }).fetch = fetchMock;
  Object.defineProperty(window, "location", {
    configurable: true,
    value: {
      href: "http://localhost/auth",
      origin: "http://localhost",
      host: "localhost",
      protocol: "http:",
      assign,
    },
  });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: false,
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

const q = <T extends Element>(sel: string) => host.querySelector<T>(sel);
const screen = () => q("[data-auth-screen]")?.getAttribute("data-auth-screen");
const face = () =>
  q("[data-auth-screen]")?.closest(".mau-scene") ? "phone" : "desktop";
const click = (sel: string) =>
  act(async () => {
    q<HTMLElement>(sel)!.dispatchEvent(
      new MouseEvent("click", { bubbles: true })
    );
  });
const type = (el: HTMLInputElement, value: string) =>
  act(() => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
const RESET = "/api/auth/reset-password/reset";
const CONFIRM = "/api/auth/email-verification/confirm";
const RESEND = "/api/auth/email-verification/request";

describe.each(["desktop", "phone"] as const)("on the %s face", (ui) => {
  const mountReset = () =>
    act(async () => {
      root.render(
        h(V3ResetPasswordRoute, {
          token: "tok-1",
          initialUi: ui,
          uiForced: true,
        })
      );
    });
  const mountConfirm = (email = "ana@x.ch", token = "tok-2") =>
    act(async () => {
      root.render(
        h(V3ConfirmEmailRoute, { email, token, initialUi: ui, uiForced: true })
      );
    });
  const password = () =>
    q<HTMLInputElement>('input[aria-label="New password"]')!;

  describe("set a new password", () => {
    it("draws the v3 step on this face", async () => {
      await mountReset();
      expect(screen()).toBe("reset-set");
      expect(face()).toBe(ui);
      expect(host.textContent).toContain("Set a new");
    });

    it("refuses what the server would refuse, without asking it", async () => {
      await mountReset();
      type(password(), "short");
      await click("[data-auth-save-password]");
      expect(host.textContent).toContain("Use at least 8 characters.");
      type(password(), "alllowercase1");
      await click("[data-auth-save-password]");
      expect(host.textContent).toContain(
        "Add an uppercase letter, a lowercase letter and a number."
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("sends the token and the password, then offers Sign in", async () => {
      answers[RESET] = { status: 200 };
      await mountReset();
      type(password(), "Newpass12");
      await click("[data-auth-save-password]");
      expect(fetchMock).toHaveBeenCalledWith(
        RESET,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ token: "tok-1", password: "Newpass12" }),
        })
      );
      expect(screen()).toBe("reset-saved");
      await click("[data-auth-go-signin]");
      expect(assign).toHaveBeenCalledWith("/auth/signin");
    });

    it("a dead link (400) offers a new one", async () => {
      answers[RESET] = { status: 400 };
      await mountReset();
      type(password(), "Newpass12");
      await click("[data-auth-save-password]");
      expect(screen()).toBe("reset-invalid");
      await click("[data-auth-new-link]");
      expect(assign).toHaveBeenCalledWith("/auth/reset-password");
    });

    it("the rate limit (429) is said and the form stays", async () => {
      answers[RESET] = { status: 429 };
      await mountReset();
      type(password(), "Newpass12");
      await click("[data-auth-save-password]");
      expect(screen()).toBe("reset-set");
      expect(q('[role="alert"]')?.textContent).toContain("Too many requests");
    });
  });

  describe("confirm your email", () => {
    it("waits for the press: opening the link spends nothing", async () => {
      await mountConfirm();
      expect(screen()).toBe("confirm-ready");
      expect(face()).toBe(ui);
      expect(host.textContent).toContain("ana@x.ch");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("confirmed → Continue to the app", async () => {
      answers[CONFIRM] = { status: 200, body: { status: "verified" } };
      await mountConfirm();
      await click("[data-auth-confirm]");
      expect(fetchMock).toHaveBeenCalledWith(
        CONFIRM,
        expect.objectContaining({
          body: JSON.stringify({ email: "ana@x.ch", token: "tok-2" }),
        })
      );
      expect(screen()).toBe("confirm-confirmed");
      await click("[data-auth-continue]");
      expect(assign).toHaveBeenCalledWith(
        "/settings?emailVerification=verified"
      );
    });

    it("expired → send a new link; the server's 429 is said", async () => {
      answers[CONFIRM] = { status: 200, body: { status: "expired" } };
      answers[RESEND] = { status: 429 };
      await mountConfirm();
      await click("[data-auth-confirm]");
      expect(screen()).toBe("confirm-expired");
      await click("[data-auth-resend-confirm]");
      expect(fetchMock).toHaveBeenLastCalledWith(
        RESEND,
        expect.objectContaining({ body: JSON.stringify({ email: "ana@x.ch" }) })
      );
      expect(q('[role="alert"]')?.textContent).toContain("Too many requests");
    });

    it("invalid → a new link is sent once", async () => {
      answers[CONFIRM] = { status: 200, body: { status: "invalid" } };
      answers[RESEND] = { status: 200, body: { sent: true } };
      await mountConfirm();
      await click("[data-auth-confirm]");
      expect(screen()).toBe("confirm-invalid");
      await click("[data-auth-resend-confirm]");
      expect(host.textContent).toContain("a new link is on its way");
      expect(q<HTMLButtonElement>("[data-auth-resend-confirm]")!.disabled).toBe(
        true
      );
    });

    it("a link without its token is a dead link from the start", async () => {
      await mountConfirm("ana@x.ch", "");
      expect(screen()).toBe("confirm-invalid");
      expect(q("[data-auth-confirm]")).toBeNull();
    });

    it("a server error keeps the button to try again", async () => {
      answers[CONFIRM] = "throw";
      await mountConfirm();
      await click("[data-auth-confirm]");
      expect(screen()).toBe("confirm-error");
      expect(q("[data-auth-confirm]")).not.toBeNull();
    });
  });
});
