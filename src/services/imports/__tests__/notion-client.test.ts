import {
  type Clock,
  NOTION_RATE_RETRIES,
  NOTION_VERSION,
  NotionApiError,
  NotionClient,
  TokenBucket,
  buildNotionAuthorizeUrl,
  decodeNotionTokens,
  encodeNotionTokens,
  exchangeNotionCode,
  getNotionOAuthConfig,
  refreshNotionTokens,
} from "../notion/client";

/** A clock that only moves when something sleeps. */
function fakeClock(): Clock & { slept: number[]; time: number } {
  const clock = {
    time: 1_000_000,
    slept: [] as number[],
    now: () => clock.time,
    sleep: async (ms: number) => {
      clock.slept.push(ms);
      clock.time += ms;
    },
  };
  return clock;
}

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });

const CONFIG = { clientId: "cid", clientSecret: "secret" };

describe("TokenBucket", () => {
  it("lets a burst of three go at once, then paces one every third of a second", async () => {
    const clock = fakeClock();
    const bucket = new TokenBucket(clock);
    const stamps: number[] = [];
    for (let i = 0; i < 7; i += 1) {
      await bucket.take();
      stamps.push(clock.time - 1_000_000);
    }
    expect(stamps.slice(0, 3)).toEqual([0, 0, 0]);
    // 3 requests per second: each later request waits for a whole token.
    const gaps = stamps.slice(3).map((t, i, all) => t - (all[i - 1] ?? 0));
    expect(gaps[0]).toBeGreaterThanOrEqual(333);
    expect(gaps.slice(1).every((g) => g >= 333 && g <= 335)).toBe(true);
    expect(stamps[6]).toBeGreaterThanOrEqual(1_330);
    expect(clock.slept.every((ms) => ms > 0 && ms <= 334)).toBe(true);
  });

  it("refills while idle but never beyond the burst", async () => {
    const clock = fakeClock();
    const bucket = new TokenBucket(clock);
    for (let i = 0; i < 3; i += 1) await bucket.take();
    clock.time += 10_000;
    clock.slept.length = 0;
    for (let i = 0; i < 3; i += 1) await bucket.take();
    expect(clock.slept).toEqual([]);
    await bucket.take();
    expect(clock.slept).toHaveLength(1);
  });

  it("serves concurrent callers in order", async () => {
    const clock = fakeClock();
    const bucket = new TokenBucket(clock);
    const order: number[] = [];
    await Promise.all(
      [0, 1, 2, 3, 4].map((n) => bucket.take().then(() => order.push(n)))
    );
    expect(order).toEqual([0, 1, 2, 3, 4]);
  });
});

describe("NotionClient requests", () => {
  const tokens = { accessToken: "ntn_access", refreshToken: null };

  it("sends the version, the bearer token and reads the markdown endpoint", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      json({
        object: "page_markdown",
        id: "p",
        markdown: "# Hi",
        truncated: false,
        unknown_block_ids: [],
      })
    );
    const client = new NotionClient({ tokens, fetchImpl, clock: fakeClock() });
    const result = await client.getPageMarkdown("a1b2");
    expect(result.markdown).toBe("# Hi");
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.notion.com/v1/pages/a1b2/markdown");
    expect(init.method).toBe("GET");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer ntn_access",
      "Notion-Version": NOTION_VERSION,
    });
    expect(NOTION_VERSION).toBe("2026-03-11");
  });

  it("pages search and data source queries with 100 per page", async () => {
    const fetchImpl = jest
      .fn()
      .mockImplementation(async () => json({ results: [], has_more: false }));
    const client = new NotionClient({ tokens, fetchImpl, clock: fakeClock() });
    await client.search("data_source", "cur1");
    await client.queryDataSource("ds-1", "cur2");
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({
      filter: { property: "object", value: "data_source" },
      page_size: 100,
      start_cursor: "cur1",
    });
    expect(fetchImpl.mock.calls[1][0]).toBe(
      "https://api.notion.com/v1/data_sources/ds-1/query"
    );
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body)).toEqual({
      page_size: 100,
      start_cursor: "cur2",
    });
  });

  it("waits out Retry-After on a 429 (with jitter) and then succeeds", async () => {
    const clock = fakeClock();
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(
        json(
          { code: "rate_limited" },
          { status: 429, headers: { "retry-after": "7" } }
        )
      )
      .mockResolvedValueOnce(json({ ok: true }));
    const client = new NotionClient({
      tokens,
      fetchImpl,
      clock,
      random: () => 0.5,
    });
    await expect(client.getBlock("b")).resolves.toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(clock.slept).toContain(7_125);
  });

  it("backs off exponentially when there is no Retry-After, and caps Retry-After at a minute", async () => {
    const clock = fakeClock();
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(json({}, { status: 529 }))
      .mockResolvedValueOnce(
        json({}, { status: 429, headers: { "retry-after": "600" } })
      )
      .mockResolvedValueOnce(json({ ok: 1 }));
    const client = new NotionClient({
      tokens,
      fetchImpl,
      clock,
      random: () => 0,
    });
    await client.getBlock("b");
    expect(clock.slept.filter((ms) => ms >= 1_000)).toEqual([1_000, 60_000]);
  });

  it("gives up on a 429 that never ends, after a bounded number of retries", async () => {
    const clock = fakeClock();
    const fetchImpl = jest
      .fn()
      .mockImplementation(async () =>
        json({}, { status: 429, headers: { "retry-after": "1" } })
      );
    const client = new NotionClient({
      tokens,
      fetchImpl,
      clock,
      random: () => 0,
    });
    await expect(client.getBlock("b")).rejects.toMatchObject({
      code: "rate_limited",
      status: 429,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(NOTION_RATE_RETRIES + 1);
  });

  it("does not retry a blocked connection", async () => {
    const fetchImpl = jest.fn().mockImplementation(async () =>
      json(
        {
          additional_data: {
            rate_limit_reason: "public_api_request_blocked",
          },
        },
        { status: 429 }
      )
    );
    const client = new NotionClient({ tokens, fetchImpl, clock: fakeClock() });
    await expect(client.getBlock("b")).rejects.toMatchObject({
      code: "rate_limited",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries a transient 503 a couple of times, then reports unavailable", async () => {
    const fetchImpl = jest
      .fn()
      .mockImplementation(async () => json({}, { status: 503 }));
    const client = new NotionClient({
      tokens,
      fetchImpl,
      clock: fakeClock(),
      random: () => 0,
    });
    await expect(client.getBlock("b")).rejects.toMatchObject({
      code: "unavailable",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("maps 401, 403 and 404 to errors that carry no token", async () => {
    for (const [status, code] of [
      [401, "unauthorized"],
      [403, "forbidden"],
      [404, "not_found"],
    ] as const) {
      const fetchImpl = jest.fn().mockResolvedValue(json({}, { status }));
      const client = new NotionClient({
        tokens,
        fetchImpl,
        clock: fakeClock(),
      });
      const error = await client.getBlock("b").catch((e) => e);
      expect(error).toBeInstanceOf(NotionApiError);
      expect(error.code).toBe(code);
      expect(error.message).not.toContain("ntn_access");
    }
  });

  it("paces its own requests through the bucket", async () => {
    const clock = fakeClock();
    const fetchImpl = jest.fn().mockImplementation(async () => json({}));
    const client = new NotionClient({ tokens, fetchImpl, clock });
    for (let i = 0; i < 6; i += 1) await client.getBlock("b");
    expect(clock.time - 1_000_000).toBeGreaterThanOrEqual(1_000);
  });
});

describe("Notion refresh tokens", () => {
  it("refreshes once on a 401 and retries with the new access token", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(json({}, { status: 401 }))
      .mockResolvedValueOnce(
        json({ access_token: "new_access", refresh_token: "new_refresh" })
      )
      .mockResolvedValueOnce(json({ ok: true }));
    const client = new NotionClient({
      tokens: { accessToken: "old", refreshToken: "r1" },
      oauth: CONFIG,
      fetchImpl,
      clock: fakeClock(),
    });
    await expect(client.getBlock("b")).resolves.toEqual({ ok: true });
    const [tokenUrl, tokenInit] = fetchImpl.mock.calls[1];
    expect(tokenUrl).toBe("https://api.notion.com/v1/oauth/token");
    expect(JSON.parse(tokenInit.body)).toEqual({
      grant_type: "refresh_token",
      refresh_token: "r1",
    });
    expect(fetchImpl.mock.calls[2][1].headers.Authorization).toBe(
      "Bearer new_access"
    );
  });

  it("fails as unauthorized without a refresh token, and when the refresh itself is refused", async () => {
    const plain = jest.fn().mockResolvedValue(json({}, { status: 401 }));
    await expect(
      new NotionClient({
        tokens: { accessToken: "a", refreshToken: null },
        oauth: CONFIG,
        fetchImpl: plain,
        clock: fakeClock(),
      }).getBlock("b")
    ).rejects.toMatchObject({ code: "unauthorized" });
    expect(plain).toHaveBeenCalledTimes(1);

    const refused = jest
      .fn()
      .mockResolvedValueOnce(json({}, { status: 401 }))
      .mockResolvedValueOnce(json({ error: "invalid_grant" }, { status: 400 }));
    await expect(
      new NotionClient({
        tokens: { accessToken: "a", refreshToken: "r" },
        oauth: CONFIG,
        fetchImpl: refused,
        clock: fakeClock(),
      }).getBlock("b")
    ).rejects.toMatchObject({ code: "unauthorized" });
  });

  it("does not loop on a 401 after a refresh", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(json({}, { status: 401 }))
      .mockResolvedValueOnce(json({ access_token: "n", refresh_token: null }))
      .mockResolvedValue(json({}, { status: 401 }));
    const client = new NotionClient({
      tokens: { accessToken: "a", refreshToken: "r" },
      oauth: CONFIG,
      fetchImpl,
      clock: fakeClock(),
    });
    await expect(client.getBlock("b")).rejects.toMatchObject({
      code: "unauthorized",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});

describe("Notion OAuth helpers", () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  it("reads the client id and secret from the environment, null when either is missing", () => {
    delete process.env.NOTION_CLIENT_ID;
    delete process.env.NOTION_CLIENT_SECRET;
    expect(getNotionOAuthConfig()).toBeNull();
    process.env.NOTION_CLIENT_ID = " cid ";
    expect(getNotionOAuthConfig()).toBeNull();
    process.env.NOTION_CLIENT_SECRET = "sec";
    expect(getNotionOAuthConfig()).toEqual({
      clientId: "cid",
      clientSecret: "sec",
    });
  });

  it("builds the authorize URL Notion documents", () => {
    const url = new URL(
      buildNotionAuthorizeUrl(
        CONFIG,
        "the-state",
        "https://use.needt.app/api/imports/notion/callback"
      )
    );
    expect(`${url.origin}${url.pathname}`).toBe(
      "https://api.notion.com/v1/oauth/authorize"
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      owner: "user",
      client_id: "cid",
      redirect_uri: "https://use.needt.app/api/imports/notion/callback",
      response_type: "code",
      state: "the-state",
    });
  });

  it("exchanges a code with HTTP Basic auth and a JSON body, and keeps the refresh token", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(
        json({ access_token: "acc", refresh_token: "ref", bot_id: "b" })
      );
    const tokens = await exchangeNotionCode(
      CONFIG,
      "the-code",
      "https://app/cb",
      fetchImpl
    );
    expect(tokens).toEqual({ accessToken: "acc", refreshToken: "ref" });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.notion.com/v1/oauth/token");
    expect(init.headers.Authorization).toBe(
      `Basic ${Buffer.from("cid:secret").toString("base64")}`
    );
    expect(JSON.parse(init.body)).toEqual({
      grant_type: "authorization_code",
      code: "the-code",
      redirect_uri: "https://app/cb",
    });
  });

  it("accepts a token response without a refresh token", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(json({ access_token: "acc", refresh_token: null }));
    await expect(
      exchangeNotionCode(CONFIG, "c", "https://app/cb", fetchImpl)
    ).resolves.toEqual({
      accessToken: "acc",
      refreshToken: null,
    });
  });

  it("fails cleanly when Notion refuses the code or sends no token, never echoing secrets", async () => {
    const refused = jest
      .fn()
      .mockResolvedValue(
        json({ error: "invalid_grant", detail: "secret" }, { status: 400 })
      );
    const error = await exchangeNotionCode(
      CONFIG,
      "c",
      "https://app/cb",
      refused
    ).catch((e) => e);
    expect(error).toBeInstanceOf(NotionApiError);
    expect(error.message).not.toMatch(/secret|invalid_grant/);
    const empty = jest.fn().mockResolvedValue(json({}));
    await expect(
      exchangeNotionCode(CONFIG, "c", "https://app/cb", empty)
    ).rejects.toMatchObject({ code: "bad_response" });
    const down = jest.fn().mockRejectedValue(new Error("boom secret"));
    await expect(refreshNotionTokens(CONFIG, "r", down)).rejects.toMatchObject({
      code: "unavailable",
    });
  });

  it("stores a bare access token, or both tokens in one envelope", () => {
    expect(
      encodeNotionTokens({ accessToken: "ntn_abc", refreshToken: null })
    ).toBe("ntn_abc");
    const both = encodeNotionTokens({ accessToken: "a", refreshToken: "r" });
    expect(decodeNotionTokens(both)).toEqual({
      accessToken: "a",
      refreshToken: "r",
    });
    expect(decodeNotionTokens("ntn_abc")).toEqual({
      accessToken: "ntn_abc",
      refreshToken: null,
    });
    expect(() => decodeNotionTokens("{broken")).toThrow(NotionApiError);
  });
});
