import { contentDisposition } from "@/lib/content-disposition";

describe("contentDisposition", () => {
  it("produces a header value the Headers constructor accepts for non-Latin1 names", () => {
    for (const name of ["фото.png", "🔥.png", "Screenshot 10.31 AM.png"]) {
      const value = contentDisposition("inline", name);
      expect(() => new Headers({ "Content-Disposition": value })).not.toThrow();
    }
  });

  it("keeps an ASCII fallback and an encoded real name", () => {
    expect(contentDisposition("attachment", "фото.png")).toBe(
      "attachment; filename=\"____.png\"; filename*=UTF-8''%D1%84%D0%BE%D1%82%D0%BE.png"
    );
  });

  it("neutralises quotes and line breaks", () => {
    const value = contentDisposition("inline", 'a"b\r\nc.png');
    expect(value).not.toMatch(/[\r\n]/);
    expect(value).toContain('filename="a_b__c.png"');
  });
});
