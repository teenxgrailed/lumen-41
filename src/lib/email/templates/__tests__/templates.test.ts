import { sampleEmails } from "../catalog";
import { escapeHtml, renderEmail } from "../layout";

describe("email templates", () => {
  const emails = Object.entries(sampleEmails());

  it.each(emails)("%s matches its snapshot", (_name, mail) => {
    expect(mail).toMatchSnapshot();
  });

  const noButton = ["sign-in-code", "ops-alert"];
  it.each(emails)("%s has a plain-text twin and one button", (name, mail) => {
    expect(mail.text.length).toBeGreaterThan(20);
    if (!noButton.includes(name)) {
      expect(mail.text).toContain("https://use.needt.app");
    }
    expect((mail.html.match(/class="btn-a"/g) ?? []).length).toBe(
      noButton.includes(name) ? 0 : 1
    );
    expect(mail.html).toContain('name="color-scheme"');
    // One image only: the logo, absolute https, with alt text.
    const imgs = mail.html.match(/<img[^>]*>/gi) ?? [];
    expect(imgs).toHaveLength(1);
    expect(imgs[0]).toContain('src="https://needt.app/icon-192.png"');
    expect(imgs[0]).toMatch(/alt="Needt"/);
    expect(imgs[0]).toContain("width=");
    expect(mail.html).toContain("[data-ogsc]");
    expect(mail.html).toContain("[data-ogsb]");
    expect(mail.html).toContain("prefers-color-scheme:dark");
    expect(mail.html).not.toMatch(/var\(--/);
    expect(mail.html).not.toMatch(/#fff(fff)?\b|#000(000)?\b/i);
    expect(mail.html).toMatch(/<div style="display:none[^"]*">/);
  });

  it.each(emails)(
    "%s is 560 wide at most, with a dark-mode block",
    (_n, mail) => {
      expect(mail.html).toContain("max-width:560px");
      expect(mail.html).not.toMatch(/max-width:(?!560px)\d{3,}px;"/);
      expect(mail.html).toMatch(
        /@media \(prefers-color-scheme:dark\)\{[^}]*\.paper/
      );
      expect(mail.html).toContain('name="supported-color-schemes"');
      expect(mail.html).not.toMatch(/background-image|url\(/i);
    }
  );

  it("keeps the sign-in code in one piece, selectable as a unit", () => {
    const mail = sampleEmails()["sign-in-code"];
    expect(mail.html).toContain(">208670</td>");
    expect(mail.html).not.toMatch(/2\s+0\s+8|2<[^>]*>0<[^>]*>8/);
    expect(mail.html).toContain("user-select:all");
    expect(mail.html).toContain("letter-spacing:6px");
  });

  it("escapes every interpolation", () => {
    const mail = renderEmail({
      subject: "s",
      preheader: "<b>x</b>",
      heading: '<script>alert("1")</script>',
      paragraphs: ["a & b <i>"],
      button: { label: "go", url: 'https://x.test/?a="1"&b=2' },
    });
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).not.toContain("<i>");
    expect(escapeHtml("<&>\"'")).toBe("&lt;&amp;&gt;&quot;&#39;");
  });

  it("prints the site, never a placeholder, until the owner sets the address", () => {
    delete process.env.OPERATOR_POSTAL_ADDRESS;
    delete process.env.EMAIL_FOOTER_ADDRESS;
    expect(sampleEmails().welcome.text).toContain("Needt - needt.app");
    process.env.OPERATOR_POSTAL_ADDRESS = "Needt Ltd, 1 Street";
    expect(sampleEmails().welcome.text).toContain("Needt Ltd, 1 Street");
    delete process.env.OPERATOR_POSTAL_ADDRESS;
    process.env.EMAIL_FOOTER_ADDRESS = "Legacy Ltd, 2 Street";
    expect(sampleEmails().welcome.text).toContain("Legacy Ltd, 2 Street");
    delete process.env.EMAIL_FOOTER_ADDRESS;
  });

  it.each(emails)("%s renders no [OWNER or {{ placeholder", (_name, mail) => {
    delete process.env.OPERATOR_POSTAL_ADDRESS;
    delete process.env.EMAIL_FOOTER_ADDRESS;
    for (const out of [mail.subject, mail.html, mail.text]) {
      expect(out).not.toContain("[OWNER");
      expect(out).not.toContain("{{");
    }
  });

  const COMMERCIAL = ["trial-ending", "trial-ended"] as const;
  const WITH_UNSUBSCRIBE = [...COMMERCIAL, "daily-digest"] as const;

  it.each(WITH_UNSUBSCRIBE)(
    "%s carries a one-click unsubscribe link",
    (name) => {
      const mail = sampleEmails()[name];
      expect(mail.text).toContain(
        "Unsubscribe: https://use.needt.app/api/email/unsubscribe"
      );
      expect(mail.html).toContain(">Unsubscribe</a>");
    }
  );

  it.each(COMMERCIAL)("%s also carries the postal address", (name) => {
    const mail = sampleEmails()[name];
    expect(mail.text).toContain("1 Example Street, Example City");
    expect(mail.html).toContain("1 Example Street, Example City");
  });

  it("refuses to render a commercial mail whose footer is a placeholder", () => {
    expect(() =>
      renderEmail({
        subject: "s",
        preheader: "p",
        heading: "h",
        paragraphs: ["x"],
        kind: "commercial",
        unsubscribeUrl: "https://use.needt.app/api/email/unsubscribe?t=x",
        footer: { name: "{{NAME}}", address: "[OWNER: address]" },
      })
    ).toThrow("operator");
  });

  it("refuses to render a commercial mail with no footer and no address", () => {
    delete process.env.OPERATOR_POSTAL_ADDRESS;
    delete process.env.EMAIL_FOOTER_ADDRESS;
    expect(() =>
      renderEmail({
        subject: "s",
        preheader: "p",
        heading: "h",
        paragraphs: ["x"],
        kind: "commercial",
        unsubscribeUrl: "https://use.needt.app/api/email/unsubscribe?t=x",
      })
    ).toThrow("operator");
  });

  it("transactional mail has no unsubscribe footer", () => {
    const all = sampleEmails();
    for (const name of [
      "verify-email",
      "password-reset",
      "welcome",
      "booking-confirmed",
      "account-export",
      "student-verify",
      "student-recheck",
      "student-price-ending",
    ] as const) {
      expect(all[name].text).not.toMatch(/unsubscribe/i);
    }
  });

  it("refuses to render a commercial mail without an unsubscribe link", () => {
    expect(() =>
      renderEmail({
        subject: "s",
        preheader: "p",
        heading: "h",
        paragraphs: ["x"],
        kind: "commercial",
      })
    ).toThrow("unsubscribe");
  });
});
