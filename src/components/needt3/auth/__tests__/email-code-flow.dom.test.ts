/**
 * @jest-environment jsdom
 *
 * Sign in with a mailed code, on both faces: address -> "Send code" -> six
 * digits (typed or pasted) -> signed in; the resend countdown; "use a
 * different email"; the "Use password" link that reveals the old form; a new
 * address typed on the sign-in tab asking for the age box.
 */
import { act, createElement as h, useState } from "react";

import { type Root, createRoot } from "react-dom/client";

import { PhoneAuth } from "../../phone/auth";
import { AuthScreen } from "../AuthScreen";
import type { EmailCodeApi } from "../email-code-logic";

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

const send = jest.fn();
const verify = jest.fn();
const onDone = jest.fn();
const onMode = jest.fn();

function Harness({
  face,
  mode = "login",
  startPassword = false,
}: {
  face: "desktop" | "phone";
  mode?: "login" | "signup";
  startPassword?: boolean;
}) {
  const [usePassword, setUsePassword] = useState(startPassword);
  const emailCode: EmailCodeApi = { send, verify, usePassword, setUsePassword };
  const Screen = face === "phone" ? PhoneAuth : AuthScreen;
  return h(Screen, {
    mode,
    onMode,
    onDone,
    onSubmit: async () => ({ ok: true }),
    emailCode,
  });
}

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  send.mockResolvedValue("sent");
  verify.mockResolvedValue("ok");
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
  jest.useRealTimers();
  jest.restoreAllMocks();
  act(() => root.unmount());
  host.remove();
});

const q = <T extends Element>(sel: string) => host.querySelector<T>(sel);
const mount = (props: Parameters<typeof Harness>[0]) =>
  act(async () => {
    root.render(h(Harness, props));
  });
const type = (el: HTMLInputElement, value: string) =>
  act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
const click = (el: Element | null) =>
  act(async () => {
    (el as HTMLElement).click();
  });
const emailInput = () =>
  q<HTMLInputElement>('input[aria-label="Email"]') as HTMLInputElement;
const codeInput = () => q<HTMLInputElement>('input[aria-label="Code"]');

async function sendFor(address: string) {
  await type(emailInput(), address);
  await click(q("[data-auth-send-code]"));
}

describe.each([["desktop"], ["phone"]] as const)("the %s face", (face) => {
  it("opens on the email field and no password", async () => {
    await mount({ face });
    expect(emailInput()).not.toBeNull();
    expect(q('input[type="password"]')).toBeNull();
    expect(q("[data-auth-send-code]")).not.toBeNull();
    expect(q("[data-auth-use-password]")).not.toBeNull();
  });

  it("does not send for an address without an @", async () => {
    await mount({ face });
    await sendFor("nope");
    expect(send).not.toHaveBeenCalled();
    expect(q("[data-auth-code-step]")).toBeNull();
  });

  it("sends the code, then takes it with the one-time-code hints", async () => {
    await mount({ face });
    await sendFor("Person@Example.com");
    expect(send).toHaveBeenCalledWith("person@example.com");
    const code = codeInput();
    expect(code).not.toBeNull();
    expect(code?.getAttribute("autocomplete")).toBe("one-time-code");
    expect(code?.getAttribute("inputmode")).toBe("numeric");
  });

  it("signs in as soon as six digits are in", async () => {
    await mount({ face });
    await sendFor("person@example.com");
    await type(codeInput() as HTMLInputElement, "12345");
    expect(verify).not.toHaveBeenCalled();
    await type(codeInput() as HTMLInputElement, "123456");
    expect(verify).toHaveBeenCalledWith({
      email: "person@example.com",
      code: "123456",
      ageConfirmed: false,
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("reads a pasted code with a space or a dash", async () => {
    await mount({ face });
    await sendFor("person@example.com");
    await type(codeInput() as HTMLInputElement, "123 456");
    expect(verify).toHaveBeenCalledWith(
      expect.objectContaining({ code: "123456" })
    );
  });

  it("says so when the code is wrong and stays on the code step", async () => {
    verify.mockResolvedValue("wrong");
    await mount({ face });
    await sendFor("person@example.com");
    await type(codeInput() as HTMLInputElement, "000000");
    expect(onDone).not.toHaveBeenCalled();
    expect(host.textContent).toContain("That code didn’t work");
    expect(codeInput()).not.toBeNull();
  });

  it("holds the resend for 60 seconds, then sends again", async () => {
    await mount({ face });
    await sendFor("person@example.com");
    expect(q("[data-auth-resend-code]")).toBeNull();
    expect(q("[data-auth-resend]")?.textContent).toContain("resend in 0:60");
    for (let i = 0; i < 60; i += 1) {
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });
    }
    const again = q("[data-auth-resend-code]");
    expect(again).not.toBeNull();
    await click(again);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("goes back to the address with 'Use a different email'", async () => {
    await mount({ face });
    await sendFor("person@example.com");
    await click(q("[data-auth-change-email]"));
    expect(q("[data-auth-code-step]")).toBeNull();
    expect(emailInput().value).toBe("person@example.com");
  });

  it("shows the rate-limit line and stays on the address", async () => {
    send.mockResolvedValue("limited");
    await mount({ face });
    await sendFor("person@example.com");
    expect(host.textContent).toContain("Too many requests");
    expect(q("[data-auth-code-step]")).toBeNull();
  });

  it("reveals the old form behind 'Use password' and can go back", async () => {
    await mount({ face });
    await click(q("[data-auth-use-password]"));
    expect(q("[data-auth-send-code]")).toBeNull();
    await act(async () => {
      // the desktop asks for the address before the password field appears
      if (face === "desktop") {
        await type(emailInput(), "person@example.com");
        (q("[data-auth-submit]") as HTMLElement).click();
      }
    });
    expect(q('input[type="password"]')).not.toBeNull();
    await click(q("[data-auth-use-code]"));
    expect(q("[data-auth-send-code]")).not.toBeNull();
  });

  it("keeps the sign-up copy and 'Use password' on the sign-up tab", async () => {
    await mount({ face, mode: "signup" });
    expect(q("[data-auth-use-password]")).not.toBeNull();
    expect(host.textContent).toContain("Create your");
  });

  it("asks for the age box when the server says the address is new", async () => {
    verify.mockResolvedValue("age");
    await mount({ face });
    await sendFor("new@example.com");
    await type(codeInput() as HTMLInputElement, "123456");
    expect(onMode).toHaveBeenCalledWith("signup");
    expect(host.textContent).toContain("Tick the box");
    expect(onDone).not.toHaveBeenCalled();
  });

  it("in sign-up, will not send before the 16+ box is ticked", async () => {
    await mount({ face, mode: "signup" });
    await sendFor("new@example.com");
    expect(send).not.toHaveBeenCalled();
  });
});
