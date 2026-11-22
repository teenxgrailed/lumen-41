import {
  DEFAULT_SHEET_STYLE,
  SHEET_STYLES,
  isSheetStyle,
  sheetStyleFrom,
} from "../sheet-style";

describe("sheetStyleFrom", () => {
  it("defaults to the pop-up", () => {
    expect(DEFAULT_SHEET_STYLE).toBe("popup");
    expect(sheetStyleFrom(undefined)).toBe("popup");
    expect(sheetStyleFrom(null)).toBe("popup");
    expect(sheetStyleFrom({})).toBe("popup");
  });
  it("keeps the two options the account can still pick", () => {
    expect(sheetStyleFrom({ sheetStyle: "classic" })).toBe("classic");
    expect(sheetStyleFrom({ sheetStyle: "white" })).toBe("white");
    expect(sheetStyleFrom({ sheetStyle: "popup" })).toBe("popup");
  });
  it("falls back for a value it does not know", () => {
    expect(sheetStyleFrom({ sheetStyle: "glass" })).toBe("popup");
    expect(sheetStyleFrom({ sheetStyle: 3 })).toBe("popup");
    expect(isSheetStyle("glass")).toBe(false);
    expect(SHEET_STYLES).toEqual(["popup", "classic", "white"]);
  });
});
