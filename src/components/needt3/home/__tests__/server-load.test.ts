import { withServerLoad } from "../derive";

const day = (date: string, planned: number, cap: number) =>
  ({
    date,
    d: 1,
    short: "Mon",
    title: "",
    sub: "",
    tasks: [],
    events: [],
    planned,
    cap,
  }) as never;

describe("withServerLoad", () => {
  it("takes the server's hours and load where it has the day", () => {
    const out = withServerLoad(
      [day("2026-07-06", 30, 540), day("2026-07-07", 10, 540)],
      [{ date: "2026-07-06", workingMinutes: 480, plannedMinutes: 600 }]
    );
    expect(out[0]).toMatchObject({ cap: 480, planned: 600 });
    expect(out[1]).toMatchObject({ cap: 540, planned: 10 });
  });

  it("keeps the local estimate without server data", () => {
    const days = [day("2026-07-06", 30, 540)];
    expect(withServerLoad(days, undefined)).toEqual(days);
  });
});
