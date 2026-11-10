import { collectAccountExport } from "@/services/account/account-export";

import { prisma } from "@/lib/prisma";

jest.mock("@/services/ai/memory", () => ({
  listMemoriesForExport: jest.fn().mockResolvedValue([]),
}));
jest.mock("@/lib/email/email-service", () => ({ EmailService: {} }));
jest.mock("@/lib/email/templates/notifications", () => ({
  getAccountExportTemplate: jest.fn(),
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const calls: Record<string, jest.Mock> = {};
jest.mock("@/lib/prisma", () => ({
  prisma: new Proxy(
    {},
    {
      get: (_t, model: string) =>
        new Proxy(
          {},
          {
            get: (_m, method: string) => {
              const key = `${model}.${method}`;
              if (!calls[key]) {
                calls[key] = jest
                  .fn()
                  .mockResolvedValue(method === "findMany" ? [] : null);
              }
              return calls[key];
            },
          }
        ),
    }
  ),
}));

describe("collectAccountExport", () => {
  it("includes goals, check-ins, habit completions and the other user tables", async () => {
    void prisma;
    calls["user.findUnique"] = jest.fn().mockResolvedValue({ id: "u1" });
    const payload = await collectAccountExport("u1");

    for (const key of [
      "goals",
      "goalCheckIns",
      "personalBlocks",
      "closedDays",
      "dailyHighlights",
      "morningBriefs",
      "weekFocuses",
      "hubItems",
      "hubNotes",
      "hubThreads",
      "notifications",
      "taskWaits",
      "importRuns",
    ]) {
      expect(payload.data).toHaveProperty(key);
    }
    expect(calls["goal.findMany"]).toHaveBeenCalledWith({
      where: { userId: "u1" },
    });
    expect(calls["habit.findMany"].mock.calls[0][0].include).toEqual(
      expect.objectContaining({ completions: true })
    );
  });
});
