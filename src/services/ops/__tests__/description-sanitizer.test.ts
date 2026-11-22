import { RICH_TEXT_DESCRIPTION_PREFIX } from "@/lib/task-description-prefix";

import {
  sanitizeDescriptionForStorage,
  setDescriptionSanitizer,
} from "../description-sanitizer";

describe("description sanitizer slot", () => {
  it("plain text needs no sanitizer", () => {
    expect(sanitizeDescriptionForStorage("  hello  ")).toBe("hello");
    expect(sanitizeDescriptionForStorage("   ")).toBeUndefined();
    expect(sanitizeDescriptionForStorage(5)).toBeUndefined();
  });

  it("a rich description is refused until a sanitizer is registered, then handed to it", () => {
    const rich = `${RICH_TEXT_DESCRIPTION_PREFIX}<p>x</p>`;
    expect(() => sanitizeDescriptionForStorage(rich)).toThrow(
      "Rich text descriptions"
    );
    setDescriptionSanitizer((value) => `clean:${String(value)}`);
    expect(sanitizeDescriptionForStorage(rich)).toBe(`clean:${rich}`);
  });
});
