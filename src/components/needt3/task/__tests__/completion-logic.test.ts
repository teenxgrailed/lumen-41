import { FOLD_MS, STRIKE_HOLD_MS, remoteChanges } from "../completion-logic";

const t = (id: string, done: boolean) => ({ id, done });
const none = { closed: [], reopened: [] };

describe("remoteChanges", () => {
  it("keeps the whole exit inside 600 to 900 ms", () => {
    expect(STRIKE_HOLD_MS + FOLD_MS).toBeGreaterThanOrEqual(600);
    expect(STRIKE_HOLD_MS + FOLD_MS).toBeLessThanOrEqual(900);
  });

  it("reports nothing without a previous read or when the list is the same", () => {
    const list = [t("a", false)];
    expect(remoteChanges(undefined, list, {})).toEqual(none);
    expect(remoteChanges(list, list, {})).toEqual(none);
  });

  it("finds a task that was open and is done now", () => {
    expect(
      remoteChanges(
        [t("a", false), t("b", false)],
        [t("a", true), t("b", false)],
        {}
      )
    ).toEqual({ closed: ["a"], reopened: [] });
  });

  it("skips a task this screen is already playing", () => {
    expect(
      remoteChanges([t("a", false)], [t("a", true)], { a: "strike" })
    ).toEqual(none);
  });

  it("ignores tasks that appear, vanish or were already done", () => {
    expect(
      remoteChanges(
        [t("a", true), t("gone", false)],
        [t("a", true), t("new", true)],
        {}
      )
    ).toEqual(none);
  });

  it("reports a playing task that is open again", () => {
    expect(
      remoteChanges([t("a", true)], [t("a", false)], { a: "collapse" })
    ).toEqual({ closed: [], reopened: ["a"] });
    expect(remoteChanges([t("a", true)], [t("a", false)], {})).toEqual(none);
  });
});
