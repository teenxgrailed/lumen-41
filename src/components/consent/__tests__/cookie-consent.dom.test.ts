/**
 * @jest-environment jsdom
 *
 * The cookie banner: shows on the first visit, Accept and Decline set the
 * shared cookie and hide it, Umami is not in the page before consent and is
 * added after Accept, and Cookie settings reopens it.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import {
  CONSENT_COOKIE,
  consentCookie,
  openCookieSettings,
  parseConsent,
} from "@/lib/cookie-consent";

import { CookieConsent } from "../CookieConsent";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

function clearCookie() {
  document.cookie = `${CONSENT_COOKIE}=; Max-Age=0; Path=/`;
}

function mount(id: string | null = "site-id") {
  act(() => {
    root.render(h(CookieConsent, { umamiWebsiteId: id ?? undefined }));
  });
}

const banner = () =>
  document.querySelector<HTMLElement>('section[aria-label="Cookie consent"]');
const umami = () => document.querySelector("script[data-needt-umami]");
const button = (name: string) =>
  Array.from(banner()?.querySelectorAll("button") ?? []).find(
    (b) => b.textContent === name
  ) as HTMLButtonElement;

beforeEach(() => {
  clearCookie();
  window.localStorage.clear();
  document.head
    .querySelectorAll("script[data-needt-umami]")
    .forEach((n) => n.remove());
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("CookieConsent", () => {
  it("shows on the first visit with two equal buttons and a privacy link", () => {
    mount();
    expect(banner()).not.toBeNull();
    expect(button("Accept").className).toBe(button("Decline").className);
    expect(banner()?.querySelector("a")?.getAttribute("href")).toBe("/privacy");
    expect(umami()).toBeNull();
  });

  it("Accept sets the cookie, hides the banner and injects Umami", () => {
    mount();
    expect(umami()).toBeNull();
    act(() => button("Accept").click());
    expect(document.cookie).toContain(`${CONSENT_COOKIE}=accepted`);
    expect(banner()).toBeNull();
    const script = umami();
    expect(script?.getAttribute("src")).toBe(
      "https://stats.needt.app/script.js"
    );
    expect(script?.getAttribute("data-website-id")).toBe("site-id");
  });

  it("Decline sets the cookie, hides the banner and never injects Umami", () => {
    mount();
    act(() => button("Decline").click());
    expect(document.cookie).toContain(`${CONSENT_COOKIE}=declined`);
    expect(banner()).toBeNull();
    expect(umami()).toBeNull();
    expect(window.localStorage.getItem("umami.disabled")).toBe("1");
  });

  it("does not show again once a choice is saved, and a saved Accept loads Umami", () => {
    document.cookie = `${CONSENT_COOKIE}=accepted; Path=/`;
    mount();
    expect(banner()).toBeNull();
    expect(umami()).not.toBeNull();
  });

  it("a saved Decline shows nothing and loads nothing", () => {
    document.cookie = `${CONSENT_COOKIE}=declined; Path=/`;
    mount();
    expect(banner()).toBeNull();
    expect(umami()).toBeNull();
  });

  it("a saved choice re-syncs umami.disabled from the shared cookie", () => {
    window.localStorage.setItem("umami.disabled", "1");
    document.cookie = `${CONSENT_COOKIE}=accepted; Path=/`;
    mount();
    expect(window.localStorage.getItem("umami.disabled")).toBeNull();
    act(() => root.unmount());
    root = createRoot(host);
    document.cookie = `${CONSENT_COOKIE}=declined; Path=/`;
    mount();
    expect(window.localStorage.getItem("umami.disabled")).toBe("1");
  });

  it("a malformed cookie is no choice: no throw, the banner shows", () => {
    document.cookie = `${CONSENT_COOKIE}=%E0%A4%A; Path=/`;
    expect(() => mount()).not.toThrow();
    expect(banner()).not.toBeNull();
    expect(umami()).toBeNull();
  });

  it("injects nothing when no Umami website id is configured", () => {
    mount(null);
    act(() => button("Accept").click());
    expect(umami()).toBeNull();
  });

  it("Cookie settings reopens the banner; Escape closes it without changing the choice", () => {
    document.cookie = `${CONSENT_COOKIE}=declined; Path=/`;
    mount();
    expect(banner()).toBeNull();
    act(() => openCookieSettings());
    expect(banner()).not.toBeNull();
    act(() => {
      banner()?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      );
    });
    expect(banner()).toBeNull();
    expect(parseConsent(document.cookie)).toBe("declined");
    act(() => openCookieSettings());
    act(() => button("Accept").click());
    expect(parseConsent(document.cookie)).toBe("accepted");
    expect(umami()).not.toBeNull();
  });

  it("Escape on the first visit leaves the banner open", () => {
    mount();
    act(() => {
      banner()?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      );
    });
    expect(banner()).not.toBeNull();
  });
});

describe("consent cookie", () => {
  it("is scoped to .needt.app, Lax, Secure, 180 days on needt hosts", () => {
    for (const host of ["needt.app", "use.needt.app"]) {
      const c = consentCookie("accepted", host, true);
      expect(c).toContain("needt_consent=accepted");
      expect(c).toContain("Domain=.needt.app");
      expect(c).toContain("SameSite=Lax");
      expect(c).toContain("Secure");
      expect(c).toContain("Max-Age=15552000");
    }
  });

  it("has no Domain on localhost", () => {
    expect(consentCookie("declined", "localhost", false)).not.toContain(
      "Domain"
    );
  });

  it("parses only the two valid values", () => {
    expect(parseConsent("a=1; needt_consent=declined")).toBe("declined");
    expect(parseConsent("needt_consent=maybe")).toBeNull();
    expect(parseConsent("")).toBeNull();
    expect(parseConsent("needt_consent=%E0%A4%A")).toBeNull();
  });
});
