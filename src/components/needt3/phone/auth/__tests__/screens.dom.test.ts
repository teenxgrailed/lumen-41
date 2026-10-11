/**
 * @jest-environment jsdom
 *
 * The phone's sign-in and the "Build your menu" step, mounted for real:
 * - closed sign-ups show the waitlist line and no "Create one"; while the
 *   answer is unknown neither is drawn; open sign-ups show "Create one";
 * - a bad pair never reaches the host, a good one is sent trimmed;
 * - a cancelled drag never reorders the pill, a second pointerdown is
 *   ignored, a drag that moved swallows the click, an unmount lets go.
 */
import { act, createElement as h, useState } from "react";

import { type Root, createRoot } from "react-dom/client";

import { MenuStep } from "../MenuStep";
import { PhoneAuth, type PhoneAuthProps } from "../PhoneAuth";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: query.includes("reduce"),
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }),
  });
  // jsdom has no canvas: the sky engine bails out on a null context
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
const qa = (sel: string) => Array.from(host.querySelectorAll(sel));

function pointer(
  type: string,
  p: { x?: number; id?: number; kind?: string } = {}
) {
  const e = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: p.x ?? 0,
    clientY: 0,
  });
  Object.defineProperty(e, "pointerId", { value: p.id ?? 1 });
  Object.defineProperty(e, "pointerType", { value: p.kind ?? "touch" });
  return e;
}
const fire = (el: Element | Window, type: string, p = {}) =>
  act(() => {
    el.dispatchEvent(pointer(type, p));
  });
const click = (el: Element) =>
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

function typeInto(el: HTMLInputElement, value: string) {
  act(() => {
    const set = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!;
    set.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const flush = () => act(async () => {});

function mountAuth(over: Partial<PhoneAuthProps> = {}) {
  const props: PhoneAuthProps = {
    mode: "login",
    onMode: jest.fn(),
    onDone: jest.fn(),
    onSubmit: jest.fn(async () => ({ ok: true })),
    ...over,
  };
  act(() => root.render(h(PhoneAuth, props)));
  return props;
}

describe("phone sign-in: closed sign-ups", () => {
  it("while the answer is unknown, neither Create one nor the waitlist is drawn", () => {
    mountAuth({ allowSignup: false, signupClosed: false });
    expect(q("[data-auth-switch]")).toBeNull();
    expect(q("[data-auth-waitlist]")).toBeNull();
  });

  it("closed: the waitlist line with its link, and no way to a sign-up form", () => {
    mountAuth({ allowSignup: false, signupClosed: true });
    const line = q("[data-auth-waitlist]")!;
    expect(line.textContent).toBe("New here? Join the waitlist at needt.app.");
    expect(line.querySelector("a")!.getAttribute("href")).toBe(
      "https://needt.app"
    );
    expect(q("[data-auth-switch]")).toBeNull();
  });

  it("open: Create one, and no waitlist", () => {
    const props = mountAuth({ allowSignup: true, signupClosed: false });
    expect(q("[data-auth-waitlist]")).toBeNull();
    click(q("[data-auth-switch]")!);
    expect(props.onMode).toHaveBeenCalledWith("signup");
  });

  it("someone already on the sign-up form keeps it, without the waitlist", () => {
    mountAuth({ mode: "signup", allowSignup: false, signupClosed: true });
    expect(q("[data-auth-waitlist]")).toBeNull();
    expect(q("[data-auth-switch]")).not.toBeNull();
  });
});

describe("phone sign-in: the form", () => {
  const email = () => q<HTMLInputElement>('input[type="email"]')!;
  const password = () => q<HTMLInputElement>('input[type="password"]')!;
  const submit = () =>
    act(() => {
      q<HTMLFormElement>("form")!.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      );
    });

  it("a bad pair never reaches the host and says what is wrong", () => {
    const props = mountAuth();
    typeInto(email(), "ana");
    typeInto(password(), "short");
    submit();
    expect(props.onSubmit).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Include an @ in the address.");
    expect(email().getAttribute("aria-invalid")).toBe("true");
    expect(password().getAttribute("aria-invalid")).toBe("true");
  });

  it("a good pair is sent with the address trimmed, then onDone", async () => {
    const props = mountAuth();
    typeInto(email(), "  ana@x.ch ");
    typeInto(password(), "12345678");
    submit();
    await flush();
    expect(props.onSubmit).toHaveBeenCalledWith({
      mode: "login",
      email: "ana@x.ch",
      password: "12345678",
    });
    expect(props.onDone).toHaveBeenCalledTimes(1);
  });

  it("a refusal stays on the screen and marks the password", async () => {
    const props = mountAuth({
      onSubmit: jest.fn(async () => ({ ok: false, reason: "wrong" as const })),
    });
    typeInto(email(), "ana@x.ch");
    typeInto(password(), "12345678");
    submit();
    await flush();
    expect(props.onDone).not.toHaveBeenCalled();
    expect(host.textContent).toContain("That email and password do not match.");
    expect(password().getAttribute("aria-invalid")).toBe("true");
  });

  it("a network failure offers Retry and sends the same request again", async () => {
    const onSubmit = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, network: true })
      .mockResolvedValueOnce({ ok: true });
    const props = mountAuth({ onSubmit });
    typeInto(email(), "ana@x.ch");
    typeInto(password(), "12345678");
    submit();
    await flush();
    expect(host.textContent).toContain("check your connection");
    jest.useFakeTimers();
    click(q("[data-auth-retry]")!);
    await act(async () => {
      jest.advanceTimersByTime(700);
    });
    jest.useRealTimers();
    await flush();
    expect(onSubmit).toHaveBeenCalledTimes(2);
    expect(props.onDone).toHaveBeenCalledTimes(1);
  });

  it("only the providers the host reports are drawn", () => {
    mountAuth();
    expect(q(".mau-pair")).toBeNull();
    mountAuth({
      providers: [{ id: "google", label: "Google", icon: () => null }],
    });
    expect(qa(".mau-pair button")).toHaveLength(1);
    expect(host.textContent).toContain("or with email");
  });

  it("recovery: the address, then the link sent; the server's 429 is shown", async () => {
    const onRecover = jest
      .fn()
      .mockResolvedValueOnce("limited")
      .mockResolvedValueOnce(true);
    mountAuth({ onRecover });
    click(q("[data-auth-forgot]")!);
    expect(q('[data-auth-screen="recover-ask"]')).not.toBeNull();
    typeInto(email(), "ana@x.ch");
    click(q("[data-auth-send-link]")!);
    await flush();
    expect(host.textContent).toContain("Too many requests, try again later");
    click(q("[data-auth-send-link]")!);
    await flush();
    expect(q('[data-auth-screen="recover-sent"]')).not.toBeNull();
    expect(host.textContent).toContain("It works for 1 hour.");
    expect(onRecover).toHaveBeenLastCalledWith("ana@x.ch");
  });
});

/* ── Build your menu ───────────────────────────────────────────────────────── */

function Harness({
  start,
  seen,
  moving,
}: {
  start: string[];
  seen: { menu: string[] };
  moving?: (on: boolean) => void;
}) {
  const [menu, setMenu] = useState(start);
  seen.menu = menu;
  return h(MenuStep, {
    menu,
    onMenu: setMenu,
    onDefault: () => setMenu(["home", "docs", "ask"]),
    onMoving: moving,
  });
}

function mountMenu(start = ["home", "docs", "ask"], moving?: jest.Mock) {
  const seen = { menu: start };
  act(() => root.render(h(Harness, { start, seen, moving })));
  return seen;
}
const slot = (k: number) => q<HTMLButtonElement>(`[data-ma-slot="${k}"]`)!;

describe("Build your menu", () => {
  it("a tile takes the next free slot; a full pill shakes instead", () => {
    const seen = mountMenu(["home", "docs"]);
    click(q('[data-ma-tile="tasks"]')!);
    expect(seen.menu).toEqual(["home", "docs", "tasks"]);
    click(q('[data-ma-tile="mail"]')!);
    expect(seen.menu).toEqual(["home", "docs", "tasks"]);
    expect(q(".ma-menu-pill")!.className).toContain("is-nudge");
    expect(q("[data-ma-say]")!.textContent).toContain("The pill holds three");
  });

  it("a tap on a slot empties it", () => {
    const seen = mountMenu();
    click(slot(1));
    expect(seen.menu).toEqual(["home", "ask"]);
  });

  it("a drag that ends reorders, and the click after it is swallowed", () => {
    const moving = jest.fn();
    const seen = mountMenu(undefined, moving);
    fire(slot(0), "pointerdown", { x: 0, id: 4 });
    fire(window, "pointermove", { x: 40, id: 4 });
    expect(moving).toHaveBeenLastCalledWith(true);
    expect(slot(0).className).toContain("is-lifted");
    fire(window, "pointerup", { x: 40, id: 4 });
    expect(seen.menu).toEqual(["docs", "ask", "home"]);
    expect(moving).toHaveBeenLastCalledWith(false);
    expect(slot(2).style.transform).toBe("");
    // the click the browser fires after the pointerup must not empty a slot
    click(slot(2));
    expect(seen.menu).toEqual(["docs", "ask", "home"]);
  });

  it("a cancelled pointer never reorders and puts every slot back", () => {
    const moving = jest.fn();
    const seen = mountMenu(undefined, moving);
    fire(slot(0), "pointerdown", { x: 0, id: 4 });
    fire(window, "pointermove", { x: 40, id: 4 });
    fire(window, "pointercancel", { id: 4 });
    expect(seen.menu).toEqual(["home", "docs", "ask"]);
    expect(moving).toHaveBeenLastCalledWith(false);
    expect(slot(0).className).not.toContain("is-lifted");
    for (let k = 0; k < 3; k++) expect(slot(k).style.transform).toBe("");
  });

  it("a press that stays under the slop is still a tap", () => {
    const seen = mountMenu();
    fire(slot(0), "pointerdown", { x: 0, id: 4 });
    fire(window, "pointermove", { x: 3, id: 4 });
    fire(window, "pointerup", { x: 3, id: 4 });
    expect(seen.menu).toEqual(["home", "docs", "ask"]);
    click(slot(0));
    expect(seen.menu).toEqual(["docs", "ask"]);
  });

  it("a second pointerdown while one slot is held is not a second drag", () => {
    const seen = mountMenu();
    fire(slot(0), "pointerdown", { x: 0, id: 4 });
    fire(slot(1), "pointerdown", { x: 0, id: 9 });
    fire(window, "pointermove", { x: 40, id: 9 });
    expect(slot(1).className).not.toContain("is-lifted");
    fire(window, "pointerup", { x: 40, id: 9 });
    expect(seen.menu).toEqual(["home", "docs", "ask"]);
    // the first finger is still the drag
    fire(window, "pointermove", { x: 40, id: 4 });
    fire(window, "pointerup", { x: 40, id: 4 });
    expect(seen.menu).toEqual(["docs", "ask", "home"]);
  });

  it("leaving the step mid-drag lets go: nothing is committed afterwards", () => {
    const seen = mountMenu();
    fire(slot(0), "pointerdown", { x: 0, id: 4 });
    fire(window, "pointermove", { x: 40, id: 4 });
    act(() => root.render(h("div")));
    fire(window, "pointerup", { x: 40, id: 4 });
    expect(seen.menu).toEqual(["home", "docs", "ask"]);
  });

  it("the arrow keys move the focused slot", () => {
    const seen = mountMenu();
    act(() => {
      slot(0).dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })
      );
    });
    expect(seen.menu).toEqual(["docs", "home", "ask"]);
  });

  it("Reset is offered only off the default and restores it", () => {
    const seen = mountMenu(["tasks", "docs", "ask"]);
    click(q("[data-ma-menu-reset]")!);
    expect(seen.menu).toEqual(["home", "docs", "ask"]);
    expect(q("[data-ma-menu-reset]")).toBeNull();
  });
});
