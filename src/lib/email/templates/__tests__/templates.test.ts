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
    expect(mail.html).not.toMatch(/<img/i);
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

  it("marks the missing legal address loudly until the owner sets it", () => {
    delete process.env.OPERATOR_POSTAL_ADDRESS;
    delete process.env.EMAIL_FOOTER_ADDRESS;
    expect(sampleEmails().welcome.text).toContain("[OWNER:");
    process.env.OPERATOR_POSTAL_ADDRESS = "Needt Ltd, 1 Street";
    expect(sampleEmails().welcome.text).toContain("Needt Ltd, 1 Street");
    delete process.env.OPERATOR_POSTAL_ADDRESS;
    process.env.EMAIL_FOOTER_ADDRESS = "Legacy Ltd, 2 Street";
    expect(sampleEmails().welcome.text).toContain("Legacy Ltd, 2 Street");
    delete process.env.EMAIL_FOOTER_ADDRESS;
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
    process.env.OPERATOR_POSTAL_ADDRESS = "Needt Ltd, 1 Street";
    const mail = sampleEmails()[name];
    delete process.env.OPERATOR_POSTAL_ADDRESS;
    expect(mail.text).toContain("Needt Ltd, 1 Street");
    expect(mail.html).toContain("Needt Ltd, 1 Street");
  });

  it("transactional mail has no unsubscribe footer", () => {
    const all = sampleEmails();
    for (const name of [
      "verify-email",
      "password-reset",
      "welcome",
      "reminder",
      "booking-confirmed",
      "account-export",
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
