import fs from "node:fs";
import path from "node:path";

import { getEmailCodeTemplate } from "../email-code";

// EMAIL_PREVIEW_DIR=/scratch npx jest email-code writes the HTML for a
// browser screenshot; skipped otherwise.
(process.env.EMAIL_PREVIEW_DIR ? it : it.skip)("writes a preview", () => {
  const dir = process.env.EMAIL_PREVIEW_DIR as string;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "email-code.html"),
    getEmailCodeTemplate({ code: "208670" }).html
  );
});

describe("getEmailCodeTemplate", () => {
  const mail = getEmailCodeTemplate({ code: "208670" });

  it("keeps the subject format", () => {
    expect(mail.subject).toBe("208670 is your Needt code");
  });

  it("shows the code in the body and the hidden preheader", () => {
    expect(mail.html).toContain(">208670</td>");
    expect(mail.html).toMatch(/display:none[^>]*>208670 is your Needt code/);
  });

  it("shows the logo with alt text and no other image", () => {
    const imgs = mail.html.match(/<img[^>]*>/gi) ?? [];
    expect(imgs).toHaveLength(1);
    expect(imgs[0]).toContain('alt="Needt"');
  });

  it("does not split the code with spaces or markup", () => {
    expect(mail.html).not.toMatch(/2\s+0\s+8\s+6\s+7\s+0/);
    expect(mail.html).toContain("user-select:all");
  });

  it("wears the shared 560 px layout", () => {
    expect(mail.html).toContain("max-width:560px");
  });

  it("declares light and dark support", () => {
    expect(mail.html).toContain('name="color-scheme" content="light dark"');
    expect(mail.html).toContain("prefers-color-scheme:dark");
    expect(mail.html).toContain("[data-ogsc]");
  });

  it("has a plain-text alternative with the code", () => {
    expect(mail.text).toContain("208670");
    expect(mail.text).toContain("Expires in 10 minutes.");
    expect(mail.text).not.toMatch(/<[a-z]/i);
  });

  it("escapes the code", () => {
    expect(getEmailCodeTemplate({ code: "<b>" }).html).not.toContain("<b>");
  });
});
