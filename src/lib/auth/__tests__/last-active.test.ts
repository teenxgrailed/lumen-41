import { resetLastActiveMemory, touchLastActive } from "../last-active";

const updateMany = jest.fn();

jest.mock("@/lib/prisma", () => ({
  prisma: { user: { updateMany: (...args: unknown[]) => updateMany(...args) } },
}));
jest.mock("@/lib/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const T0 = new Date("2026-11-03T10:00:00.000Z");
const minutesLater = (count: number) => new Date(T0.getTime() + count * 60_000);

describe("touchLastActive", () => {
  beforeEach(() => {
    updateMany.mockReset();
    updateMany.mockResolvedValue({ count: 1 });
    resetLastActiveMemory();
  });

  it("writes on the first call", async () => {
    await touchLastActive("u1", T0);
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(updateMany.mock.calls[0][0].data).toEqual({ lastActiveAt: T0 });
  });

  it("writes at most once an hour per person", async () => {
    await touchLastActive("u1", T0);
    await touchLastActive("u1", minutesLater(30));
    await touchLastActive("u1", minutesLater(59));
    expect(updateMany).toHaveBeenCalledTimes(1);
    await touchLastActive("u1", minutesLater(61));
    expect(updateMany).toHaveBeenCalledTimes(2);
  });

  it("tracks people separately", async () => {
    await touchLastActive("u1", T0);
    await touchLastActive("u2", T0);
    expect(updateMany).toHaveBeenCalledTimes(2);
  });

  it("makes the database write conditional on the stored value", async () => {
    await touchLastActive("u1", T0);
    const where = updateMany.mock.calls[0][0].where;
    expect(where.id).toBe("u1");
    expect(where.OR).toEqual([
      { lastActiveAt: null },
      { lastActiveAt: { lt: new Date(T0.getTime() - 3_600_000) } },
    ]);
  });

  it("never throws when the database fails", async () => {
    updateMany.mockRejectedValue(new Error("db down"));
    await expect(touchLastActive("u1", T0)).resolves.toBeUndefined();
  });
});
