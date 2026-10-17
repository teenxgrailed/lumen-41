import { dayStreak } from "../derive";

const TODAY = "2026-10-14";
const t = (dueDate: string | null, done: boolean) => ({ dueDate, done });

describe("dayStreak", () => {
  it("counts closed days in a row up to yesterday", () => {
    const tasks = [
      t("2026-10-13", true),
      t("2026-10-12", true),
      t("2026-10-11", true),
      t("2026-10-10", false),
      t("2026-10-09", true),
    ];
    expect(dayStreak(tasks, TODAY)).toEqual({ n: 3, todayClosed: false });
  });

  it("a day is closed only when everything due that day is done", () => {
    const tasks = [t("2026-10-13", true), t("2026-10-13", false)];
    expect(dayStreak(tasks, TODAY).n).toBe(0);
  });

  it("an open today cannot break it; a closed today joins it", () => {
    const base = [t("2026-10-13", true), t("2026-10-12", true)];
    expect(dayStreak([...base, t(TODAY, false)], TODAY)).toEqual({
      n: 2,
      todayClosed: false,
    });
    expect(dayStreak([...base, t(TODAY, true)], TODAY)).toEqual({
      n: 3,
      todayClosed: true,
    });
  });

  it("steps over days with nothing due, up to a week of them", () => {
    expect(
      dayStreak([t("2026-10-13", true), t("2026-10-09", true)], TODAY).n
    ).toBe(2);
    expect(
      dayStreak([t("2026-10-13", true), t("2026-10-01", true)], TODAY).n
    ).toBe(1);
  });

  it("ignores tasks with no due day, and is zero for no tasks", () => {
    expect(dayStreak([t(null, true)], TODAY).n).toBe(0);
    expect(dayStreak([], TODAY)).toEqual({ n: 0, todayClosed: false });
  });
});
