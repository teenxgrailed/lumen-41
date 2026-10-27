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
    delete process.env.EMAIL_FOOTER_ADDRESS;
    expect(sampleEmails().welcome.text).toContain("[OWNER:");
    process.env.EMAIL_FOOTER_ADDRESS = "Needt Ltd, 1 Street";
    expect(sampleEmails().welcome.text).toContain("Needt Ltd, 1 Street");
    delete process.env.EMAIL_FOOTER_ADDRESS;
  });
});
