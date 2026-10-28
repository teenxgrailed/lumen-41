import { moveEnd, moveStart } from "../CreateCard";

describe("the create card's range", () => {
  it("moving the start carries the end with it", () => {
    expect(moveStart(10, 11.5, 14 * 60)).toEqual({ at: 14, end: 15.5 });
    expect(moveStart(10, 11.5, 14 * 60 + 7)).toEqual({ at: 14, end: 15.5 });
  });

  it("keeps the day: the end stops at 24:00, the start before the last quarter", () => {
    expect(moveStart(10, 12, 23 * 60)).toEqual({ at: 23, end: 24 });
    expect(moveStart(10, 12, 24 * 60)).toEqual({ at: 23.75, end: 24 });
  });

  it("sets the end when it is after the start", () => {
    expect(moveEnd(10, 11, 12 * 60 + 30)).toEqual({ at: 10, end: 12.5 });
  });

  it("an end at or before the start keeps the length", () => {
    expect(moveEnd(10, 11.5, 9 * 60)).toEqual({ at: 10, end: 11.5 });
    expect(moveEnd(10, 11.5, 10 * 60)).toEqual({ at: 10, end: 11.5 });
  });

  it("00:00 after a start means midnight", () => {
    expect(moveEnd(22, 23, 0)).toEqual({ at: 22, end: 24 });
  });
});
