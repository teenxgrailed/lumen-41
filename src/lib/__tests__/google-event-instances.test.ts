import getGoogleEvent from "@/lib/google-calendar";

const instances = jest.fn();
const get = jest.fn();

jest.mock("@/lib/logger", () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));
jest.mock("@/store/settings", () => ({ useSettingsStore: {} }));
jest.mock("@/lib/google", () => ({
  createGoogleOAuthClient: async () => ({ setCredentials: jest.fn() }),
}));
jest.mock("@/lib/token-manager", () => ({
  TokenManager: {
    getInstance: () => ({
      getTokens: async () => ({
        accessToken: "a",
        refreshToken: "r",
        expiresAt: new Date(Date.now() + 3_600_000),
      }),
    }),
  },
}));
jest.mock("googleapis", () => ({
  google: { calendar: () => ({ events: { get, instances } }) },
}));

describe("recurring event instances", () => {
  beforeEach(() => jest.clearAllMocks());

  it("follows nextPageToken so no instance is missing from the list", async () => {
    get.mockResolvedValue({
      data: { id: "master", recurrence: ["RRULE:FREQ=DAILY"] },
    });
    instances
      .mockResolvedValueOnce({
        data: { items: [{ id: "i1" }, { id: "i2" }], nextPageToken: "p2" },
      })
      .mockResolvedValueOnce({ data: { items: [{ id: "i3" }] } });

    const result = await getGoogleEvent("acct", "user", "cal", "master");

    expect(result.instances.map((i) => i.id)).toEqual(["i1", "i2", "i3"]);
    expect(instances).toHaveBeenCalledTimes(2);
    expect(instances.mock.calls[1][0]).toMatchObject({ pageToken: "p2" });
  });
});
