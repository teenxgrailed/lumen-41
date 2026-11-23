import { folderStyleRows } from "../folder-style-rows";

describe("folderStyleRows", () => {
  it("is Auto then the six looks, a tick on the current one", () => {
    const rows = folderStyleRows(4, jest.fn());
    expect(rows.map((r) => r.label)).toEqual([
      "Auto (random)",
      "Frosted white",
      "Coloured glass",
      "Papers peeking",
      "Stamp and clip",
      "App icons",
      "Dark frosted",
    ]);
    expect(rows.filter((r) => r.hint === "✓").map((r) => r.label)).toEqual([
      "Stamp and clip",
    ]);
  });
  it("ticks Auto when none is stored", () => {
    expect(folderStyleRows(null, jest.fn())[0].hint).toBe("✓");
  });
  it("picks, and does nothing for the look it already has", () => {
    const pick = jest.fn();
    const rows = folderStyleRows(2, pick);
    rows[2].run?.();
    expect(pick).not.toHaveBeenCalled();
    rows[6].run?.();
    expect(pick).toHaveBeenLastCalledWith(6);
    rows[0].run?.();
    expect(pick).toHaveBeenLastCalledWith(null);
  });
});
