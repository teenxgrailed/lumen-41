import { ComposioIntegrationProvider } from "../composio-provider";

jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

function json(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

describe("Composio connection deletion", () => {
  const fetchMock = jest.fn();
  const originalFetch = global.fetch;
  const previousKey = process.env.COMPOSIO_API_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
    process.env.COMPOSIO_API_KEY = "composio-test-key";
  });

  afterAll(() => {
    global.fetch = originalFetch;
    if (previousKey === undefined) delete process.env.COMPOSIO_API_KEY;
    else process.env.COMPOSIO_API_KEY = previousKey;
  });

  it("deletes stored and listed connections and revokes them upstream", async () => {
    fetchMock
      .mockResolvedValueOnce(
        json(200, {
          items: [
            { id: "ca_listed", user_id: "user-1" },
            { id: "ca_other", user_id: "someone-else" },
          ],
          next_cursor: null,
        })
      )
      .mockResolvedValueOnce(json(200, { success: true }))
      .mockResolvedValueOnce(json(404, { error: "not found" }));

    const result = await new ComposioIntegrationProvider().deleteUserConnections(
      "user-1",
      ["ca_stored"]
    );

    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls[0]).toBe(
      "https://backend.composio.dev/api/v3.1/connected_accounts?user_ids=user-1&limit=100"
    );
    expect(urls.slice(1)).toEqual([
      "https://backend.composio.dev/api/v3.1/connected_accounts/ca_stored?revoke_on_delete=true",
      "https://backend.composio.dev/api/v3.1/connected_accounts/ca_listed?revoke_on_delete=true",
    ]);
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: "DELETE" });
    expect(result).toEqual({ deleted: ["ca_stored", "ca_listed"], failed: [] });
  });

  it("does nothing without an API key", async () => {
    delete process.env.COMPOSIO_API_KEY;

    await expect(
      new ComposioIntegrationProvider().deleteUserConnections("user-1", ["x"])
    ).resolves.toEqual({ deleted: [], failed: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
