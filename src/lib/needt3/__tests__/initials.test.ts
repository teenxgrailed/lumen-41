import { badgeCount } from "@/components/needt3/phone/menu/status";

import { initialsOf } from "../initials";

describe("initialsOf", () => {
  it("takes the first letter of up to two words", () => {
    expect(initialsOf("Jonas Weber")).toBe("JW");
    expect(initialsOf("Print Atelier Zürich")).toBe("PA");
    expect(initialsOf("madonna")).toBe("M");
  });

  it("skips words with no letter or number", () => {
    expect(initialsOf("Jonas & Weber")).toBe("JW");
    expect(initialsOf("- Weber")).toBe("W");
    expect(initialsOf("7 Eleven")).toBe("7E");
  });

  it("falls back to ? when nothing is left", () => {
    expect(initialsOf("")).toBe("?");
    expect(initialsOf(null)).toBe("?");
    expect(initialsOf("   ")).toBe("?");
    expect(initialsOf("🙂 &")).toBe("?");
  });

  it("never cuts a character in half", () => {
    // U+1D4D0 is a letter outside the BMP (a surrogate pair)
    expect(initialsOf("\u{1D4D0}lice")).toBe("\u{1D4D0}");
    // e + combining acute stays one grapheme
    expect(initialsOf("élise")).toBe("É");
  });

  it("honours the limit", () => {
    expect(initialsOf("Ada Lovelace", 1)).toBe("A");
  });
});

describe("badgeCount", () => {
  it("caps at 99+", () => {
    expect(badgeCount(1)).toBe("1");
    expect(badgeCount(99)).toBe("99");
    expect(badgeCount(100)).toBe("99+");
    expect(badgeCount(12345)).toBe("99+");
  });
});
