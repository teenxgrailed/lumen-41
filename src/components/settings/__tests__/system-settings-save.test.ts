import { saveSystemSettings } from "@/components/settings/system-settings-save";

import { notify } from "@/lib/notifications";

jest.mock("@/lib/notifications", () => ({ notify: { error: jest.fn() } }));
jest.mock("@/lib/logger", () => ({ logger: { error: jest.fn() } }));

const fetchMock = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = fetchMock as unknown as typeof fetch;
});

function respond(status: number, body: unknown) {
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    })
  );
}

describe("saveSystemSettings", () => {
  it("hands the saved settings to the store", async () => {
    respond(200, { googleClientSecret: "••••••••" });
    const apply = jest.fn();

    await expect(
      saveSystemSettings({ googleClientSecret: "new-value" }, apply)
    ).resolves.toBe(true);

    expect(apply).toHaveBeenCalledWith({ googleClientSecret: "••••••••" });
    expect(notify.error).not.toHaveBeenCalled();
  });

  it.each([401, 500])(
    "keeps an error body out of the store on %i and says so",
    async (status) => {
      respond(status, { error: "Unauthorized" });
      const apply = jest.fn();

      await expect(
        saveSystemSettings({ resendApiKey: "new-value" }, apply)
      ).resolves.toBe(false);

      expect(apply).not.toHaveBeenCalled();
      expect(notify.error).toHaveBeenCalledTimes(1);
    }
  );

  it("reports a network failure", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const apply = jest.fn();

    await expect(
      saveSystemSettings({ resendApiKey: "new-value" }, apply)
    ).resolves.toBe(false);

    expect(apply).not.toHaveBeenCalled();
    expect(notify.error).toHaveBeenCalledTimes(1);
  });
});
