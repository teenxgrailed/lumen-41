import {
  SIMPLIFIED_WINDOW_MS,
  easyStartRowState,
  useRecentSimplified,
} from "../easy-start-row";

const now = 1_700_000_000_000;

describe("easyStartRowState", () => {
  it("draws a row with no entry and no proposal as before", () => {
    expect(easyStartRowState({ entry: null, now })).toBeNull();
    expect(easyStartRowState({ entry: "", now })).toBeNull();
    expect(easyStartRowState({ now })).toBeNull();
  });

  it("is normal for a row with an entry", () => {
    expect(easyStartRowState({ entry: "Open the file", now })).toBe("normal");
  });

  it("is simplified, with Undo, inside the window", () => {
    const recent = { actionId: "a1", at: now - 1000 };
    expect(easyStartRowState({ entry: "Open the file", recent, now })).toBe(
      "simplified"
    );
  });

  it("goes back to normal once the window has passed", () => {
    const recent = { actionId: "a1", at: now - SIMPLIFIED_WINDOW_MS };
    expect(easyStartRowState({ entry: "Open the file", recent, now })).toBe(
      "normal"
    );
  });

  it("is suggest while a proposal is pending, with or without an entry", () => {
    expect(easyStartRowState({ entry: null, proposalId: "p1", now })).toBe(
      "suggest"
    );
    expect(easyStartRowState({ entry: "x", proposalId: "p1", now })).toBe(
      "suggest"
    );
  });

  it("leaves a finished task alone in every state", () => {
    const recent = { actionId: "a1", at: now };
    expect(
      easyStartRowState({
        entry: "x",
        done: true,
        proposalId: "p",
        recent,
        now,
      })
    ).toBeNull();
  });
});

describe("useRecentSimplified", () => {
  beforeEach(() => useRecentSimplified.setState({ byTask: {} }));

  it("remembers the action per task and forgets it after Undo", () => {
    const s = useRecentSimplified.getState();
    s.record("t1", "a1", 5);
    s.record("t2", "a2", 6);
    expect(useRecentSimplified.getState().byTask.t1).toEqual({
      actionId: "a1",
      at: 5,
    });
    useRecentSimplified.getState().forget("t1");
    expect(useRecentSimplified.getState().byTask).toEqual({
      t2: { actionId: "a2", at: 6 },
    });
  });
});
