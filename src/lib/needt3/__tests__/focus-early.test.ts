import {
  GIFT_MS,
  announceEarlyFinish,
  clearFocusGift,
  earlyNotice,
  parseFocusEnded,
  showFocusGift,
  useFocusGift,
} from "../focus-early";

const success = jest.fn();
jest.mock("@/lib/notifications", () => ({
  notify: { success: (...a: unknown[]) => success(...a) },
}));

const early = {
  sessionId: "s1",
  status: "early",
  message: "Done 12 min early",
  minutes: 12,
  taskId: "t1",
  taskTitle: "German homework",
};

beforeEach(() => {
  jest.useFakeTimers();
  success.mockClear();
  clearFocusGift();
});
afterEach(() => {
  clearFocusGift();
  jest.useRealTimers();
});

describe("the green slice", () => {
  it("shows the returned minutes for 2.4 s, then goes", () => {
    expect(GIFT_MS).toBe(2400);
    showFocusGift(12);
    expect(useFocusGift.getState().gift).toMatchObject({ minutes: 12 });
    jest.advanceTimersByTime(GIFT_MS - 1);
    expect(useFocusGift.getState().gift).not.toBeNull();
    jest.advanceTimersByTime(1);
    expect(useFocusGift.getState().gift).toBeNull();
  });

  it("a newer one replaces the older and gets its own full 2.4 s (new key replays the animation)", () => {
    showFocusGift(12);
    const first = useFocusGift.getState().gift!;
    jest.advanceTimersByTime(2000);
    showFocusGift(5);
    const second = useFocusGift.getState().gift!;
    expect(second.minutes).toBe(5);
    expect(second.key).not.toBe(first.key);
    jest.advanceTimersByTime(2000);
    expect(useFocusGift.getState().gift).not.toBeNull();
    jest.advanceTimersByTime(400);
    expect(useFocusGift.getState().gift).toBeNull();
  });

  it("nothing given back shows nothing", () => {
    showFocusGift(0);
    showFocusGift(-3);
    expect(useFocusGift.getState().gift).toBeNull();
  });
});

describe("the early-finish event", () => {
  it("reads the payload; a malformed one is empty", () => {
    expect(parseFocusEnded(JSON.stringify(early))).toMatchObject({
      minutes: 12,
    });
    expect(parseFocusEnded("nope")).toEqual({});
    expect(parseFocusEnded("null")).toEqual({});
  });

  it("makes the toast: the line, the task and the minutes back", () => {
    expect(earlyNotice(early)).toEqual({
      title: "Done 12 min early",
      description: "German homework · focus ended, 12 min back in your day",
      taskId: "t1",
      minutes: 12,
    });
    expect(earlyNotice({ ...early, taskTitle: undefined })?.description).toBe(
      "focus ended, 12 min back in your day"
    );
    // a plain done (the clock had run out) and other statuses say nothing
    expect(earlyNotice({ status: "done" })).toBeNull();
    expect(earlyNotice({ ...early, status: "notify" })).toBeNull();
  });
});

describe("Done N min early: toast, Undo and slice", () => {
  it("raises the toast with an Undo and starts the slice", () => {
    expect(announceEarlyFinish(early, jest.fn())).toBe(true);
    const [title, opts] = success.mock.calls[0];
    expect(title).toBe("Done 12 min early");
    expect(opts).toMatchObject({
      description: "German homework · focus ended, 12 min back in your day",
      dedupeKey: "focus-early-s1",
      action: { label: "Undo" },
    });
    expect(useFocusGift.getState().gift).toMatchObject({ minutes: 12 });
  });

  it("Undo opens the task again and takes the slice away", () => {
    const reopen = jest.fn().mockResolvedValue(undefined);
    announceEarlyFinish(early, reopen);
    success.mock.calls[0][1].action.onClick();
    expect(reopen).toHaveBeenCalledWith("t1");
    expect(useFocusGift.getState().gift).toBeNull();
  });

  it("a failing reopen is the mutation's to report, not an unhandled rejection", async () => {
    const reopen = jest.fn().mockRejectedValue(new Error("offline"));
    announceEarlyFinish(early, reopen);
    success.mock.calls[0][1].action.onClick();
    await Promise.resolve();
    expect(reopen).toHaveBeenCalled();
  });

  it("without a task there is no Undo; without minutes there is no slice", () => {
    announceEarlyFinish({ ...early, taskId: undefined }, jest.fn());
    expect(success.mock.calls[0][1].action).toBeUndefined();
    clearFocusGift();
    success.mockClear();
    announceEarlyFinish({ ...early, minutes: undefined }, jest.fn());
    expect(success).toHaveBeenCalledTimes(1);
    expect(useFocusGift.getState().gift).toBeNull();
  });

  it("says nothing when the clock had already run out", () => {
    expect(announceEarlyFinish({ status: "done" }, jest.fn())).toBe(false);
    expect(success).not.toHaveBeenCalled();
  });
});
