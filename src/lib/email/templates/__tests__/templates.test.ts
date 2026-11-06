import { sampleEmails } from "../catalog";
import { escapeHtml, renderEmail } from "../layout";

describe("email templates", () => {
  const emails = Object.entries(sampleEmails());

  it.each(emails)("%s matches its snapshot", (_name, mail) => {
    expect(mail).toMatchSnapshot();
  });

  it.each(emails)("%s has a plain-text twin and one button", (_name, mail) => {
    expect(mail.text.length).toBeGreaterThan(20);
    expect(mail.text).toContain("https://use.needt.app");
    expect((mail.html.match(/class="btn-a"/g) ?? []).length).toBe(1);
    expect(mail.html).toContain('name="color-scheme"');
    // One image only: the logo, absolute https, with the wordmark as text beside it.
    const imgs = mail.html.match(/<img[^>]*>/gi) ?? [];
    expect(imgs).toHaveLength(1);
    expect(imgs[0]).toContain('src="https://use.needt.app/icons/icon-192.png"');
    expect(imgs[0]).toContain("width=");
    expect(mail.html).toContain("[data-ogsc]");
    expect(mail.html).toContain("[data-ogsb]");
    expect(mail.html).toContain("prefers-color-scheme:dark");
    expect(mail.html).not.toMatch(/var\(--/);
    expect(mail.html).not.toMatch(/#fff(fff)?\b|#000(000)?\b/i);
    expect(mail.html).toMatch(/<div style="display:none[^"]*">/);
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
