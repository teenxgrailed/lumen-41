import { RRule } from "rrule";

import { RecurrenceConverterFactory } from "../recurrence-converter-factory";
import {
  TodoistRecurrenceConverter,
  UnsupportedTodoistRecurrenceError,
  parseTodoistRecurrence,
} from "../todoist-recurrence-converter";

describe("parseTodoistRecurrence", () => {
  it.each([
    ["every day", "FREQ=DAILY"],
    ["daily", "FREQ=DAILY"],
    ["every! day", "FREQ=DAILY"],
    ["Every Day at 9am", "FREQ=DAILY"],
    ["every 3 days", "FREQ=DAILY;INTERVAL=3"],
    ["every other day", "FREQ=DAILY;INTERVAL=2"],
    ["every week", "FREQ=WEEKLY"],
    ["every 2 weeks", "FREQ=WEEKLY;INTERVAL=2"],
    ["every 6 months", "FREQ=MONTHLY;INTERVAL=6"],
    ["every month", "FREQ=MONTHLY"],
    ["every year", "FREQ=YEARLY"],
    ["yearly", "FREQ=YEARLY"],
    ["every weekday", "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"],
    ["every workday", "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"],
    ["every weekend", "FREQ=WEEKLY;BYDAY=SA,SU"],
    ["every mon, fri", "FREQ=WEEKLY;BYDAY=MO,FR"],
    ["every friday and monday", "FREQ=WEEKLY;BYDAY=MO,FR"],
    ["every tue,thu at 18:30", "FREQ=WEEKLY;BYDAY=TU,TH"],
    ["every fri at 6pm", "FREQ=WEEKLY;BYDAY=FR"],
    ["every other tuesday", "FREQ=WEEKLY;INTERVAL=2;BYDAY=TU"],
    ["every month on the 15th", "FREQ=MONTHLY;BYMONTHDAY=15"],
    ["every 3 months on the 1st", "FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=1"],
    ["every month on the last day", "FREQ=MONTHLY;BYMONTHDAY=-1"],
    ["every 15th", "FREQ=MONTHLY;BYMONTHDAY=15"],
    ["every 1st", "FREQ=MONTHLY;BYMONTHDAY=1"],
    ["every last day", "FREQ=MONTHLY;BYMONTHDAY=-1"],
    ["every day starting oct 1", "FREQ=DAILY"],
  ])("reads %j", (text, expected) => {
    const rule = parseTodoistRecurrence(text);
    expect(rule).toBe(expected);
    // Every rule it produces must be a valid RRULE.
    expect(() => RRule.fromString(`RRULE:${rule}`)).not.toThrow();
  });

  it.each([
    "every 3rd workday of the month",
    "every 2nd monday",
    "after 3 days",
    "every day until dec 31",
    "cada día",
    "",
    "every 32nd",
    "every 0 months on the 15th",
    "every 1000 months on the 15th",
    "every 0 days",
  ])("returns null for %j", (text) => {
    expect(parseTodoistRecurrence(text)).toBeNull();
  });
});

describe("TodoistRecurrenceConverter", () => {
  it("is what the factory hands out for TODOIST", () => {
    expect(RecurrenceConverterFactory.getConverter("todoist")).toBeInstanceOf(
      TodoistRecurrenceConverter
    );
  });

  it("converts to an RRULE: string and throws on unsupported wording", () => {
    const converter = new TodoistRecurrenceConverter();
    expect(converter.convertToRRule("every mon")).toBe(
      "RRULE:FREQ=WEEKLY;BYDAY=MO"
    );
    expect(() => converter.convertToRRule("every 2nd monday")).toThrow(
      UnsupportedTodoistRecurrenceError
    );
  });
});
