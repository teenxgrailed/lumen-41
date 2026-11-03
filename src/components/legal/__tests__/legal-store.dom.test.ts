/**
 * @jest-environment jsdom
 *
 * /terms in a store build (iOS app, Mac App Store): the plans, prices and
 * free-trial sections are one neutral sentence; the rest of the document is
 * unchanged. A browser reads the full text. /privacy is the same in both.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { privacyMarkdown } from "@/lib/legal/documents/privacy";
import { termsMarkdown } from "@/lib/legal/documents/terms";

import { LegalDocument } from "../LegalDocument";
import { STORE_PLANS_NOTICE } from "../WebOnly";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  delete (window as unknown as { __needtNative?: unknown }).__needtNative;
});

const asStore = () => {
  (window as unknown as { __needtNative?: unknown }).__needtNative = {
    platform: "mac-swift",
    distribution: "appstore",
  };
};
const render = (markdown: string) =>
  act(() => root.render(h(LegalDocument, { markdown })));

describe("/terms", () => {
  it("browser: the full plans, prices and trial", () => {
    render(termsMarkdown());
    expect(host.textContent).toContain("$7 per month");
    expect(host.textContent).toContain("Lifetime:");
    expect(host.textContent).toContain("Free trial");
    expect(host.textContent).not.toContain(STORE_PLANS_NOTICE);
  });

  it("store build: one neutral sentence in place of 5.1 and 5.2", () => {
    asStore();
    render(termsMarkdown());
    const text = host.textContent ?? "";
    expect(text).toContain(STORE_PLANS_NOTICE);
    expect(text).not.toMatch(/\$\s?\d|per month|per year|Free trial/);
    expect(host.querySelector("[id='5-1-plans']")).toBeNull();
    expect(host.querySelector("[id='5-2-free-trial']")).toBeNull();
  });

  it("store build: the rest of the document stays, including sections 5 and 6", () => {
    asStore();
    render(termsMarkdown());
    for (const id of [
      "5-plans-trial-and-payment",
      "5-3-who-sells-to-you-creem",
      "5-5-refunds-and-the-right-of-withdrawal",
      "6-ai-features-and-fair-use",
    ]) {
      expect(host.querySelector(`[id="${id}"]`)).not.toBeNull();
    }
    expect(host.querySelector("a[href='https://needt.app']")).toBeNull();
  });
});

describe("/privacy", () => {
  it("keeps the processor disclosure in a store build", () => {
    asStore();
    render(privacyMarkdown());
    expect(host.textContent).toContain("Creem");
    expect(host.textContent).not.toContain(STORE_PLANS_NOTICE);
  });
});
