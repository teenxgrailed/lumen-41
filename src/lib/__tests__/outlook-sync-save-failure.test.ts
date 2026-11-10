import { syncOutlookCalendar } from "@/lib/outlook-sync";

const findFirst = jest.fn();
const create = jest.fn();
const update = jest.fn();
const updateMany = jest.fn();

jest.mock("@/lib/logger", () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    calendarEvent: {
      findFirst: (...a: unknown[]) => findFirst(...a),
      create: (...a: unknown[]) => create(...a),
      update: (...a: unknown[]) => update(...a),
      updateMany: (...a: unknown[]) => updateMany(...a),
    },
  },
}));

function clientReturning(value: object[]) {
  const request = {
    header: () => request,
    get: async () => ({
      value,
      "@odata.deltaLink": "https://graph/delta?$deltatoken=new",
    }),
  };
  return { api: () => request } as never;
}

const event = {
  id: "e1",
  subject: "Standup",
  start: { dateTime: "2026-11-10T09:00:00", timeZone: "UTC" },
  end: { dateTime: "2026-11-10T09:30:00", timeZone: "UTC" },
};

describe("Outlook delta sync save failures", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    findFirst.mockResolvedValue(null);
  });

  it("throws when an event cannot be saved, so the new delta token is not stored", async () => {
    create.mockRejectedValue(new Error("db timeout"));
    await expect(
      syncOutlookCalendar(
        clientReturning([event]),
        { id: "f", url: "cal" },
        "old-token"
      )
    ).rejects.toThrow(/could not save 1/);
  });

  it("returns the new token when every save works", async () => {
    create.mockResolvedValue({});
    const result = await syncOutlookCalendar(
      clientReturning([event]),
      { id: "f", url: "cal" },
      "old-token"
    );
    expect(result.nextSyncToken).toBe("new");
  });
});
