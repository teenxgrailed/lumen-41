import { createElement as h } from "react";

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

function render(name: keyof typeof PAGES): string {
  return renderToStaticMarkup(h(PAGES[name]));
}

describe("published legal pages", () => {
  it.each(Object.keys(PAGES) as (keyof typeof PAGES)[])(
    "%s renders a finished document",
    (name) => {
      const html = render(name);
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

  it("names the operator, the seller and the governing law", () => {
    const privacy = render("privacy");
    const terms = render("terms");
    expect(privacy).toContain("privacy@needt.app");
    expect(privacy).toContain("DataRep");
    expect(terms).toContain("Armitage Labs OÜ");
    expect(terms).toContain("https://www.creem.io/buyer-terms");
    expect(terms).toContain("Kyiv, Ukraine");
    expect(terms).toContain("90 days");
  });

  it("links the three documents to each other", () => {
    for (const name of Object.keys(PAGES) as (keyof typeof PAGES)[]) {
      const html = render(name);
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
  it("is filled and printed on both documents", () => {
    expect(isUnfilled(LEGAL_PLACEHOLDERS.OPERATOR_FULL_NAME)).toBe(false);
    expect(render("privacy")).toContain(LEGAL_PLACEHOLDERS.OPERATOR_FULL_NAME);
    expect(render("terms")).toContain(LEGAL_PLACEHOLDERS.OPERATOR_FULL_NAME);
  });
});

/*
 * Ships skipped on purpose (owner decision 2026-10-12): DataRep has not
 * assigned Needt a contact yet, and CI must stay green while the pages go
 * live with the interim wording. Fill DATAREP_CONTACT in
 * src/lib/legal/operator.ts, then change `describe.skip` to `describe`.
 */
describe.skip("DataRep contact is filled (un-skip once DataRep assigns it)", () => {
  it("DATAREP_CONTACT is filled", () => {
    expect(isUnfilled(LEGAL_PLACEHOLDERS.DATAREP_CONTACT)).toBe(false);
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

  it("prints no registration claim until DMCA_AGENT_REG_NO is set", () => {
    delete process.env.DMCA_AGENT_REG_NO;
    expect(termsMarkdown()).not.toContain("registration number");
    expect(render("terms")).not.toContain("registration number");
  });

  it("prints the registration number once it is set", () => {
    process.env.DMCA_AGENT_REG_NO = "DMCA-1234567";
    expect(termsMarkdown()).toContain("registration number **DMCA-1234567**");
    expect(render("terms")).toContain("DMCA-1234567");
  });
});
