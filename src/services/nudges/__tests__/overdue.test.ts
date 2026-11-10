import { isDeadlineOverdue } from "../proactive-assist";

jest.mock("@/lib/prisma", () => ({ prisma: {} }));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

describe("isDeadlineOverdue", () => {
  // Zurich is UTC+1 in November: local midnight of 10.11 is 09.11 23:00Z.
  const zone = "Europe/Zurich";
  const now = new Date("2026-11-10T14:00:00Z");

  it("is not overdue when due today", () => {
    expect(isDeadlineOverdue(new Date("2026-11-09T23:00:00Z"), now, zone)).toBe(
      false
    );
  });

  it("is overdue when due yesterday", () => {
    expect(isDeadlineOverdue(new Date("2026-11-08T23:00:00Z"), now, zone)).toBe(
      true
    );
  });

  it("is not overdue without a deadline", () => {
    expect(isDeadlineOverdue(null, now, zone)).toBe(false);
  });
});
