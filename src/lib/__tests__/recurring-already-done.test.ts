import { formatDateOnlyWithWeekday } from "../date-utils";
import {
  noticeRecurringAlreadyDone,
  recurringAlreadyDoneMessage,
} from "../recurring-already-done";

const info = jest.fn();
jest.mock("@/lib/notifications", () => ({
  notify: { info: (...a: unknown[]) => info(...a) },
}));

beforeEach(() => info.mockClear());

describe("the line shown when a repeat tick did nothing", () => {
  it("names the weekday and day of the next time", () => {
    expect(recurringAlreadyDoneMessage("2026-11-01")).toBe(
      "Already done today. Next time: Sun 1 Nov"
    );
  });

  it("drops the next time when the series has no date left", () => {
    expect(recurringAlreadyDoneMessage(null)).toBe("Already done today.");
  });

  it("does not slip a day, whatever the zone of the machine", () => {
    expect(formatDateOnlyWithWeekday("2026-11-01")).toBe("Sun 1 Nov");
  });
});

describe("telling the person", () => {
  it("shows the notice and reports that nothing was completed", () => {
    expect(
      noticeRecurringAlreadyDone({
        recurringAlreadyDone: { nextDueDate: "2026-11-01" },
      })
    ).toBe(true);
    expect(info).toHaveBeenCalledWith(
      "Already done today. Next time: Sun 1 Nov",
      expect.anything()
    );
  });

  it("stays quiet when the task was completed normally", () => {
    expect(noticeRecurringAlreadyDone({})).toBe(false);
    expect(noticeRecurringAlreadyDone(null)).toBe(false);
    expect(info).not.toHaveBeenCalled();
  });
});
