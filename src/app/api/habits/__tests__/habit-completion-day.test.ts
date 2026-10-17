import { NextRequest } from "next/server";

import { DELETE, PUT } from "@/app/api/habits/[id]/completions/[date]/route";
import { setHabitCompletionToday } from "@/services/habits/habit-service";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { addCalendarDays, formatInTimeZone, newDate } from "@/lib/date-utils";

jest.mock("@/lib/auth/api-auth", () => ({ authenticateRequest: jest.fn() }));
jest.mock("@/services/habits/habit-service", () => {
  class HabitCompletionDateError extends Error {}
  return {
    HabitCompletionDateError,
    setHabitCompletionToday: jest.fn(),
  };
});

const auth = authenticateRequest as jest.Mock;
const set = setHabitCompletionToday as jest.Mock;
const dayKey = (back: number) =>
  formatInTimeZone(addCalendarDays(newDate(), -back), "UTC", "yyyy-MM-dd");

const call = (fn: typeof PUT, date: string) =>
  fn(new NextRequest("http://localhost/api/habits/h1/completions/x"), {
    params: Promise.resolve({ id: "h1", date }),
  }) as Promise<Response>;

describe("PUT/DELETE /api/habits/[id]/completions/[date]", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    auth.mockResolvedValue({
      userId: "u1",
      workspace: { workspaceId: "ws-1" },
    });
  });

  it("marks a past day, passing the day through", async () => {
    set.mockResolvedValue({ habitId: "h1", date: dayKey(3), completed: true });
    const res = await call(PUT, dayKey(3));
    expect(res.status).toBe(200);
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        habitId: "h1",
        completed: true,
        dateKey: dayKey(3),
      })
    );
  });

  it("unmarks with DELETE", async () => {
    set.mockResolvedValue({ habitId: "h1", date: dayKey(3), completed: false });
    await call(DELETE, dayKey(3));
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ completed: false })
    );
  });

  it("answers 404 for a habit that is not the caller's", async () => {
    set.mockResolvedValue(null);
    expect((await call(PUT, dayKey(1))).status).toBe(404);
  });

  it("answers 400 when the service refuses the day (future, not a date)", async () => {
    const { HabitCompletionDateError } = jest.requireMock(
      "@/services/habits/habit-service"
    );
    set.mockRejectedValue(new HabitCompletionDateError("in the future"));
    expect((await call(PUT, "2999-01-01")).status).toBe(400);
  });

  it("refuses a day more than 400 days back without touching the data", async () => {
    const res = await call(PUT, dayKey(401));
    expect(res.status).toBe(400);
    expect(set).not.toHaveBeenCalled();
  });

  it("answers the auth failure as is", async () => {
    auth.mockResolvedValue({ response: new Response(null, { status: 401 }) });
    expect((await call(PUT, dayKey(1))).status).toBe(401);
    expect(set).not.toHaveBeenCalled();
  });
});
