import { createElement as h } from "react";

import SupportPage from "@/app/support/page";
import { renderToStaticMarkup } from "react-dom/server";

import { supportMarkdown } from "../documents/support";
import { PRIVACY_EMAIL, SUPPORT_EMAIL } from "../operator";

const html = renderToStaticMarkup(h(SupportPage));

describe("public support page", () => {
  it("shows the support email, the response time and the FAQ", () => {
    expect(html).toContain("<h1");
    expect(html).toContain(">Support<");
    expect(html).toContain(SUPPORT_EMAIL);
    expect(html).toContain(`href="mailto:${SUPPORT_EMAIL}"`);
    expect(html).toContain("within two working days");
    expect(html).toContain("system browser sheet");
    expect(html).toContain("Settings → Account → Delete account");
    expect(html).toContain("7 days");
    expect(html).toContain("Settings → Data &amp; privacy");
    expect(html).toContain("Settings → your name (Apple ID) → Subscriptions");
    expect(html).toContain(
      'href="https://apps.apple.com/account/subscriptions"'
    );
    expect(html).toContain(`href="mailto:${PRIVACY_EMAIL}"`);
    expect(html).toContain('href="/terms"');
    expect(html).toContain('href="/privacy"');
  });

  it("states no price and offers no purchase or checkout", () => {
    const text = `${supportMarkdown()}\n${html}`;
    expect(text).not.toMatch(/[$€£]|\bCHF\b|\bEUR\b|\bUSD\b/);
    expect(text).not.toMatch(
      /price|checkout|purchase|\bbuy\b|upgrade|lifetime|creem|trial/i
    );
    expect(text).not.toMatch(/\/settings\?section=billing/);
  });

  it("names the brand only: no founder name, no postal address", () => {
    expect(html).not.toContain("Nataliia");
    expect(html).not.toMatch(/\{\{|\}\}|undefined/);
    expect(html).not.toMatch(/postal|street|\bstr\.|\bUkraine\b/i);
  });
});
