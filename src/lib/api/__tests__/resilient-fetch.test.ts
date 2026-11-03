import { resetResilientFetch, resilientFetch } from "../resilient-fetch";

const json = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const sleep = jest.fn(async () => undefined);
let fetchMock: jest.Mock;

beforeEach(() => {
  resetResilientFetch();
  sleep.mockClear();
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe("resilientFetch: reads survive a deploy", () => {
  it("retries a GET after 502/503/504 and returns the first good answer", async () => {
    fetchMock
      .mockResolvedValueOnce(json(502))
      .mockResolvedValueOnce(json(503))
      .mockResolvedValueOnce(json(200, { ok: true }));
    const res = await resilientFetch("/api/tasks", undefined, { sleep });
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenNthCalledWith(1, 300);
    expect(sleep).toHaveBeenNthCalledWith(2, 900);
  });

  it("gives up after two retries and hands back the last 5xx", async () => {
    fetchMock.mockImplementation(async () => json(504));
    const res = await resilientFetch("/api/tasks", undefined, { sleep });
    expect(res.status).toBe(504);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("retries a GET after a network error", async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(json(200));
    const res = await resilientFetch("/api/tasks", undefined, { sleep });
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws the network error once the retries are used", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(
      resilientFetch("/api/tasks", undefined, { sleep })
    ).rejects.toThrow("Failed to fetch");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("never repeats a write on 5xx or on a network error", async () => {
    fetchMock.mockResolvedValueOnce(json(502));
    const res = await resilientFetch(
      "/api/tasks",
      { method: "POST", body: "{}" },
      { sleep }
    );
    expect(res.status).toBe(502);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockClear();
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(
      resilientFetch("/api/tasks", { method: "PATCH", body: "{}" }, { sleep })
    ).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry a plain client or server error", async () => {
    fetchMock.mockResolvedValueOnce(json(500));
    expect(
      (await resilientFetch("/api/tasks", undefined, { sleep })).status
    ).toBe(500);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("resilientFetch: a 401 while signed in", () => {
  it("asks the session once and repeats the call when it is still valid", async () => {
    fetchMock
      .mockResolvedValueOnce(json(401))
      .mockResolvedValueOnce(json(200, { user: { id: "u1" } }))
      .mockResolvedValueOnce(json(200, { tasks: [] }));
    const res = await resilientFetch("/api/user/settings", undefined, {
      sleep,
    });
    expect(res.status).toBe(200);
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      "/api/user/settings",
      "/api/auth/session",
      "/api/user/settings",
    ]);
  });

  it("lets the 401 stand when the session is really gone", async () => {
    fetchMock
      .mockResolvedValueOnce(json(401))
      .mockResolvedValueOnce(json(200, {}));
    const res = await resilientFetch("/api/user/settings", undefined, {
      sleep,
    });
    expect(res.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("repeats a 401 call only once", async () => {
    fetchMock
      .mockResolvedValueOnce(json(401))
      .mockResolvedValueOnce(json(200, { user: { id: "u1" } }))
      .mockResolvedValueOnce(json(401));
    const res = await resilientFetch("/api/user/settings", undefined, {
      sleep,
    });
    expect(res.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not probe the session for the auth routes themselves", async () => {
    fetchMock.mockResolvedValueOnce(json(401));
    const res = await resilientFetch("/api/auth/session", undefined, { sleep });
    expect(res.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
