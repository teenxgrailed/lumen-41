import {
  RICH_TEXT_DESCRIPTION_PREFIX,
  plainTaskDescriptionForStorage,
} from "../task-description-prefix";

describe("plainTaskDescriptionForStorage", () => {
  it("trims plain text and drops empty values", () => {
    expect(plainTaskDescriptionForStorage("  note  ")).toBe("note");
    expect(plainTaskDescriptionForStorage("   ")).toBeUndefined();
    expect(plainTaskDescriptionForStorage(42)).toBeUndefined();
  });

  it("never stores imported text as rich HTML", () => {
    const forged = `${RICH_TEXT_DESCRIPTION_PREFIX}${RICH_TEXT_DESCRIPTION_PREFIX}<img src=x onerror=alert(1)>`;
    const stored = plainTaskDescriptionForStorage(forged);
    expect(stored?.startsWith(RICH_TEXT_DESCRIPTION_PREFIX)).toBe(false);
  });
});
