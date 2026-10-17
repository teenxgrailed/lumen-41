import {
  PinterestApiError,
  buildPinterestAuthorizeUrl,
  exchangePinterestCode,
  getPinterestOAuthConfig,
  listPinterestBoards,
  listPinterestPins,
  pinImages,
  refreshPinterestTokens,
} from "../client";

const config = { clientId: "123", clientSecret: "shh" };
const fetchMock = jest.fn();

function reply(status: number, body: unknown) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe("config and authorize URL", () => {
  it("is null without both env vars", () => {
    delete process.env.PINTEREST_CLIENT_ID;
    delete process.env.PINTEREST_CLIENT_SECRET;
    expect(getPinterestOAuthConfig()).toBeNull();
    process.env.PINTEREST_CLIENT_ID = "abc";
    expect(getPinterestOAuthConfig()).toBeNull();
    process.env.PINTEREST_CLIENT_SECRET = "def";
    expect(getPinterestOAuthConfig()).toEqual({
      clientId: "abc",
      clientSecret: "def",
    });
    delete process.env.PINTEREST_CLIENT_ID;
    delete process.env.PINTEREST_CLIENT_SECRET;
  });

  it("asks only for the read scopes", () => {
    const url = new URL(
      buildPinterestAuthorizeUrl(config, "st", "https://app.test/cb")
    );
    expect(url.origin + url.pathname).toBe("https://www.pinterest.com/oauth/");
    expect(url.searchParams.get("scope")).toBe("boards:read,pins:read");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("redirect_uri")).toBe("https://app.test/cb");
    expect(url.searchParams.get("state")).toBe("st");
  });
});

describe("token requests", () => {
  const tokenBody = {
    access_token: "pina_x",
    refresh_token: "pinr_y",
    expires_in: 2592000,
    refresh_token_expires_in: 5184000,
    scope: "boards:read pins:read",
  };

  it("exchanges a code with Basic auth and a continuous refresh token", async () => {
    fetchMock.mockReturnValueOnce(reply(200, tokenBody));
    const t = await exchangePinterestCode(
      config,
      "CODE",
      "https://app.test/cb"
    );
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.pinterest.com/v5/oauth/token");
    expect(init.headers.authorization).toBe(
      `Basic ${Buffer.from("123:shh").toString("base64")}`
    );
    const sent = new URLSearchParams(init.body);
    expect(sent.get("grant_type")).toBe("authorization_code");
    expect(sent.get("code")).toBe("CODE");
    expect(sent.get("continuous_refresh")).toBe("true");
    expect(t.accessToken).toBe("pina_x");
    expect(t.refreshToken).toBe("pinr_y");
    expect(t.refreshExpiresAt).toBeInstanceOf(Date);
  });

  it("refreshes with the refresh token", async () => {
    fetchMock.mockReturnValueOnce(reply(200, tokenBody));
    await refreshPinterestTokens(config, "pinr_old");
    const sent = new URLSearchParams(fetchMock.mock.calls[0][1].body);
    expect(sent.get("grant_type")).toBe("refresh_token");
    expect(sent.get("refresh_token")).toBe("pinr_old");
  });

  it("maps a refused grant to unauthorized", async () => {
    fetchMock.mockReturnValueOnce(reply(400, { message: "invalid_grant" }));
    await expect(refreshPinterestTokens(config, "x")).rejects.toMatchObject({
      code: "unauthorized",
    });
  });
});

describe("reads", () => {
  it("lists boards across pages", async () => {
    fetchMock
      .mockReturnValueOnce(
        reply(200, {
          items: [{ id: "1", name: "Shoot", pin_count: 12, privacy: "PUBLIC" }],
          bookmark: "next",
        })
      )
      .mockReturnValueOnce(
        reply(200, { items: [{ id: "2" }], bookmark: null })
      );
    const boards = await listPinterestBoards("tok");
    expect(boards).toEqual([
      { id: "1", name: "Shoot", pinCount: 12, privacy: "PUBLIC" },
      { id: "2", name: "Untitled board", pinCount: null, privacy: null },
    ]);
    expect(fetchMock.mock.calls[0][1].headers.authorization).toBe("Bearer tok");
    expect(String(fetchMock.mock.calls[1][0])).toContain("bookmark=next");
  });

  it("reads Pins with their picture sizes and the Pin page", async () => {
    fetchMock.mockReturnValueOnce(
      reply(200, {
        items: [
          {
            id: "99",
            title: " Night flash ",
            media: {
              images: {
                "600x": {
                  url: "https://i.pinimg.com/600x/a.jpg",
                  width: 600,
                  height: 900,
                },
                "1200x": {
                  url: "https://i.pinimg.com/1200x/a.jpg",
                  width: 1200,
                  height: 1800,
                },
                originals: { url: "http://insecure.example/a.jpg" },
              },
            },
          },
          { id: "not-a-number" },
        ],
        bookmark: "b",
      })
    );
    const page = await listPinterestPins("tok", "5", { pageSize: 25 });
    expect(page.bookmark).toBe("b");
    expect(page.pins).toHaveLength(1);
    expect(page.pins[0]).toMatchObject({
      id: "99",
      title: "Night flash",
      pinUrl: "https://www.pinterest.com/pin/99/",
    });
    // best size first; the http address is dropped
    expect(page.pins[0].images.map((i) => i.url)).toEqual([
      "https://i.pinimg.com/1200x/a.jpg",
      "https://i.pinimg.com/600x/a.jpg",
    ]);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/boards/5/pins");
    expect(String(fetchMock.mock.calls[0][0])).toContain("page_size=25");
  });

  it("falls back to a video Pin's cover image", () => {
    expect(
      pinImages({ cover_image_url: "https://i.pinimg.com/c.jpg" })
    ).toEqual([
      { url: "https://i.pinimg.com/c.jpg", width: null, height: null },
    ]);
    expect(pinImages(null)).toEqual([]);
  });

  it.each([
    [401, "unauthorized", {}],
    [403, "forbidden", { message: "nope" }],
    [403, "access_denied", { code: "PINNER_DATA_ACCESS_DENIED" }],
    [404, "not_found", {}],
    [429, "rate_limited", {}],
    [500, "unavailable", {}],
  ])("maps HTTP %s to %s", async (status, code, body) => {
    fetchMock.mockReturnValueOnce(reply(status as number, body));
    const err = await listPinterestBoards("tok").catch((e) => e);
    expect(err).toBeInstanceOf(PinterestApiError);
    expect(err.code).toBe(code);
  });
});
