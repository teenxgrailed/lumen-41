import type { ReactElement } from "react";

import PrivacyPage from "@/app/privacy/page";
import SubprocessorsPage from "@/app/subprocessors/page";
import TermsPage from "@/app/terms/page";
import { renderToStaticMarkup } from "react-dom/server";

import { privacyMarkdown } from "../documents/privacy";
import { subprocessorsMarkdown } from "../documents/subprocessors";
import { termsMarkdown } from "../documents/terms";
import { parseMarkdown } from "../markdown";
import {
  LEGAL_EFFECTIVE_DATE,
  LEGAL_PLACEHOLDERS,
  formatLegalDate,
  isUnfilled,
} from "../operator";

const PAGES = {
  privacy: PrivacyPage,
  terms: TermsPage,
  subprocessors: SubprocessorsPage,
} as const;

// The terms page reads the `apple_iap` flag for the reader when it is served.
const mockFlag = jest.fn(async (): Promise<boolean> => false);
const mockConfigured = jest.fn(() => true);
const mockSession = jest.fn(
  async (): Promise<{ user: { id: string } } | null> => null
);
jest.mock("@/lib/feature-flags", () => ({
  isFeatureEnabled: () => mockFlag(),
  isFeatureEnabledForEveryone: () => mockFlag(),
}));
jest.mock("@/lib/apple-iap/config", () => ({
  isAppleIapConfigured: () => mockConfigured(),
}));
jest.mock("@/lib/auth/auth-options", () => ({
  getAuthOptions: async () => ({}),
}));
jest.mock("next-auth/next", () => ({
  getServerSession: () => mockSession(),
}));
jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(async () => undefined) },
}));

async function render(name: keyof typeof PAGES): Promise<string> {
  const page = PAGES[name] as () => ReactElement | Promise<ReactElement>;
  return renderToStaticMarkup(await page());
}

describe("published legal pages", () => {
  it.each(Object.keys(PAGES) as (keyof typeof PAGES)[])(
    "%s renders a finished document",
    async (name) => {
      const html = await render(name);
      expect(html).toContain("<h1");
      expect(html).toContain(formatLegalDate(LEGAL_EFFECTIVE_DATE));
      // No review marker and no raw template placeholder reaches a reader:
      // unfilled constants are printed as their interim wording.
      expect(html).not.toContain("[[CHECK");
      expect(html).not.toContain("CHECK:");
      expect(html).not.toMatch(/\{\{|\}\}/);
      expect(html).not.toContain("draft");
      expect(html).not.toContain("undefined");
    }
  );

  it("promises an unconditional 14-day refund and states the real cancel path", () => {
    const terms = termsMarkdown();
    expect(terms).toContain("14-day refund, no questions asked");
    expect(terms).toContain("including Lifetime");
    expect(terms).not.toContain("We do not refund automatically");
    expect(terms).not.toContain("We look at each request");
    expect(terms).toContain("Settings → Plan & billing → Invoices and payment");
    expect(terms).not.toContain("Settings → Billing → Manage billing");
  });

  it("discloses the self-hosted Umami counter instead of denying analytics", () => {
    const privacy = privacyMarkdown();
    const subs = subprocessorsMarkdown();
    expect(privacy).toContain("Umami");
    expect(privacy).toContain("stats.needt.app");
    expect(privacy).toContain("needt.dl.boost");
    expect(privacy).not.toContain("There is no analytics or tracking script");
    expect(subs).toContain("Umami");
    expect(subs).not.toContain("no analytics or tracking scripts in the app");
  });

  it("names the operator, the seller and the governing law", async () => {
    const privacy = await render("privacy");
    const terms = await render("terms");
    expect(privacy).toContain("privacy@needt.app");
    expect(privacy).not.toContain("DataRep");
    expect(terms).toContain("Armitage Labs OÜ");
    expect(terms).toContain("https://www.creem.io/buyer-terms");
    expect(terms).toContain("Kyiv, Ukraine");
    expect(terms).toContain("90 days");
  });

  it("links the three documents to each other", async () => {
    for (const name of Object.keys(PAGES) as (keyof typeof PAGES)[]) {
      const html = await render(name);
      expect(html).toContain('href="/terms"');
      expect(html).toContain('href="/privacy"');
      expect(html).toContain('href="/subprocessors"');
    }
  });

  it.each([
    ["privacy", privacyMarkdown],
    ["terms", termsMarkdown],
    ["subprocessors", subprocessorsMarkdown],
  ] as const)("%s: every table row is as wide as its header", (_name, doc) => {
    const tables = parseMarkdown(doc()).filter(
      (block) => block.type === "table"
    );
    for (const table of tables) {
      if (table.type !== "table") continue;
      for (const row of table.rows) {
        expect(row).toHaveLength(table.head.length);
      }
    }
  });
});

describe("web-only blocks", () => {
  it("terms keep exactly one: sections 5.1 and 5.2, the prices and the trial", () => {
    const only = parseMarkdown(termsMarkdown()).filter(
      (block) => block.type === "web-only"
    );
    expect(only).toHaveLength(1);
    const first = only[0];
    if (first?.type !== "web-only") throw new Error("not a web-only block");
    const headings = first.children
      .filter((b) => b.type === "heading")
      .map((b) => (b.type === "heading" ? b.id : ""));
    expect(headings).toEqual(["5-1-plans", "5-2-free-trial"]);
  });

  it("terms keep one web-billing block (5.3 to 5.6) and one app-store block per use", () => {
    const blocks = parseMarkdown(termsMarkdown());
    const ids = (type: string) =>
      blocks
        .filter((b) => b.type === type)
        .flatMap((b) =>
          "children" in b
            ? b.children
                .filter((c) => c.type === "heading")
                .map((c) => (c.type === "heading" ? c.id : ""))
            : []
        );
    expect(ids("web-billing")).toEqual([
      "5-3-who-sells-to-you-creem",
      "5-4-renewal-and-cancellation",
      "5-5-refunds-and-the-right-of-withdrawal",
      "5-6-price-changes",
    ]);
    expect(ids("app-store")).toEqual(["5-7-purchases-in-the-app-store"]);
  });

  it("the App Store subsection carries the Apple rules and no prices", () => {
    const terms = termsMarkdown();
    const start = terms.indexOf("### 5.7 Purchases in the App Store");
    const end = terms.indexOf("\n---", start);
    const section = terms.slice(start, end);
    expect(section).toContain("Apple is the seller");
    expect(section).toContain(
      "at least 24 hours before the current period ends"
    );
    expect(section).toContain("https://reportaproblem.apple.com/");
    expect(section).toContain(
      "Licensed Application End User License Agreement"
    );
    expect(section).not.toMatch(/\$\s?\d|CHF|EUR|€/);
  });

  it("the website billing sections say they cover website purchases only", () => {
    const terms = termsMarkdown();
    const start = terms.indexOf("### 5.3 ");
    const end = terms.indexOf("### 5.7 ");
    const web = terms.slice(start, end);
    expect(web).toContain("Paid plans bought on the website are sold by");
    expect(web).toContain("A Pro subscription bought on the website renews");
    expect(web).toContain(
      "An App Store subscription is not cancelled by deleting your account"
    );
    expect(web).toContain(
      "It does **not** cover a plan bought in the iOS app through the App Store"
    );
    expect(web).toContain("Within 14 days of any payment on the website");
    expect(web).toContain("We may change the website prices");
    expect(web).not.toContain("section 5.7");
  });

  it("privacy and subprocessors name Apple next to Creem", () => {
    for (const text of [privacyMarkdown(), subprocessorsMarkdown()]) {
      expect(text).toContain("**Creem**");
      expect(text).toContain("**Apple**");
      expect(text).toContain("transaction identifier");
      expect(text).toContain("no card data");
    }
  });

  it("parses a fenced block and keeps the text around it", () => {
    const blocks = parseMarkdown(
      [
        "Before.",
        "",
        "::: web-only",
        "",
        "Price $7.",
        "",
        ":::",
        "",
        "After.",
      ].join("\n")
    );
    expect(blocks.map((b) => b.type)).toEqual([
      "paragraph",
      "web-only",
      "paragraph",
    ]);
  });
});

describe("markdown subset", () => {
  it("parses headings, lists, tables, quotes and inline marks", () => {
    const blocks = parseMarkdown(
      [
        "# Title",
        "",
        "Text with **bold**, `code` and [a link](/x).",
        "",
        "- one",
        "- two",
        "",
        "| A | B |",
        "| --- | --- |",
        "| 1 | 2 |",
        "",
        "> quoted",
        "",
        "---",
      ].join("\n")
    );
    expect(blocks.map((block) => block.type)).toEqual([
      "heading",
      "paragraph",
      "list",
      "table",
      "quote",
      "rule",
    ]);
    expect(blocks[0]).toMatchObject({ level: 1, id: "title" });
    expect(blocks[1]).toMatchObject({
      children: [
        { type: "text", value: "Text with " },
        { type: "strong" },
        { type: "text", value: ", " },
        { type: "code", value: "code" },
        { type: "text", value: " and " },
        { type: "link", href: "/x" },
        { type: "text", value: "." },
      ],
    });
  });
});

describe("legal date", () => {
  it("formats without a time zone", () => {
    expect(formatLegalDate("2026-10-12")).toBe("12 October 2026");
    expect(formatLegalDate("2027-01-01")).toBe("1 January 2027");
    expect(() => formatLegalDate("12.10.2026")).toThrow();
  });
});

describe("operator name", () => {
  it("is filled and printed on both documents", async () => {
    expect(isUnfilled(LEGAL_PLACEHOLDERS.OPERATOR_FULL_NAME)).toBe(false);
    expect(await render("privacy")).toContain(
      LEGAL_PLACEHOLDERS.OPERATOR_FULL_NAME
    );
    expect(await render("terms")).toContain(
      LEGAL_PLACEHOLDERS.OPERATOR_FULL_NAME
    );
  });
});

describe("DMCA section of the Terms", () => {
  const saved = process.env.DMCA_AGENT_REG_NO;
  afterEach(() => {
    if (saved === undefined) delete process.env.DMCA_AGENT_REG_NO;
    else process.env.DMCA_AGENT_REG_NO = saved;
  });

  it("explains notice and counter-notice and names the legal email", () => {
    const terms = termsMarkdown();
    expect(terms).toContain("## 18. Copyright complaints (DMCA)");
    expect(terms).toContain("counter-notice");
    expect(terms).toContain("privacy@needt.app");
    expect(terms).toContain("## 19. Contact");
  });

  it("prints no registration claim until DMCA_AGENT_REG_NO is set", async () => {
    delete process.env.DMCA_AGENT_REG_NO;
    expect(termsMarkdown()).not.toContain("registration number");
    expect(await render("terms")).not.toContain("registration number");
  });

  it("prints the registration number once it is set", async () => {
    process.env.DMCA_AGENT_REG_NO = "DMCA-1234567";
    expect(termsMarkdown()).toContain("registration number **DMCA-1234567**");
    expect(await render("terms")).toContain("DMCA-1234567");
  });
});

describe("terms page and App Store purchases", () => {
  const APP_STORE_ID = 'id="5-7-purchases-in-the-app-store"';
  afterEach(() => {
    mockFlag.mockReset().mockResolvedValue(false);
    mockConfigured.mockReset().mockReturnValue(true);
    mockSession.mockReset().mockResolvedValue(null);
  });

  it("shows 5.7 when apple_iap is on and the server is configured", async () => {
    mockFlag.mockResolvedValue(true);
    expect(await render("terms")).toContain(APP_STORE_ID);
  });

  it("uses the reader's own flag when signed in", async () => {
    mockSession.mockResolvedValue({ user: { id: "reviewer" } });
    mockFlag.mockResolvedValue(true);
    expect(await render("terms")).toContain(APP_STORE_ID);
  });

  it("hides 5.7 when the APPLE_IAP_* env is missing", async () => {
    mockFlag.mockResolvedValue(true);
    mockConfigured.mockReturnValue(false);
    expect(await render("terms")).not.toContain(APP_STORE_ID);
  });

  it("hides 5.7 when the flag cannot be read", async () => {
    mockFlag.mockRejectedValue(new Error("db down"));
    expect(await render("terms")).not.toContain(APP_STORE_ID);
  });
});
