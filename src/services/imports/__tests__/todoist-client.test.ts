import {
  TODOIST_SYNC_URL,
  TodoistApiError,
  buildTodoistAuthorizeUrl,
  exchangeTodoistCode,
  fetchTodoistSnapshot,
} from "../todoist/client";
import fixture from "./fixtures/todoist-sync.json";

function respond(status: number, body: unknown = {}) {
  return jest.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    })
  ) as unknown as typeof fetch;
}

describe("Todoist client", () => {
  it("asks for read-only scope with the state", () => {
    const url = new URL(
      buildTodoistAuthorizeUrl({ clientId: "cid", clientSecret: "x" }, "st")
    );
    expect(url.origin + url.pathname).toBe(
      "https://app.todoist.com/oauth/authorize"
    );
    expect(url.searchParams.get("scope")).toBe("data:read");
    expect(url.searchParams.get("state")).toBe("st");
    expect(url.searchParams.get("client_id")).toBe("cid");
  });

  it("does one full sync with a bearer token and parses the payload", async () => {
    const fetchImpl = respond(200, fixture);
    const snapshot = await fetchTodoistSnapshot("tok", fetchImpl);
    expect(snapshot.items).toHaveLength(fixture.items.length);
    const [url, init] = jest.mocked(fetchImpl).mock.calls[0];
    expect(url).toBe(TODOIST_SYNC_URL);
    expect((init!.headers as Record<string, string>).Authorization).toBe(
      "Bearer tok"
    );
    const body = init!.body as URLSearchParams;
    expect(body.get("sync_token")).toBe("*");
    expect(JSON.parse(body.get("resource_types")!)).toEqual(
      expect.arrayContaining(["projects", "sections", "items", "labels"])
    );
  });

  it.each([
    [401, "unauthorized"],
    [403, "unauthorized"],
    [429, "rate_limited"],
    [502, "unavailable"],
    [400, "bad_response"],
  ])("maps HTTP %i to %s", async (status, code) => {
    await expect(
      fetchTodoistSnapshot("tok", respond(status))
    ).rejects.toMatchObject({ code });
  });

  it("rejects a payload that is not a sync response", async () => {
    await expect(
      fetchTodoistSnapshot("tok", respond(200, { items: "nope" }))
    ).rejects.toBeInstanceOf(TodoistApiError);
  });

  it("exchanges a code for an access token", async () => {
    const fetchImpl = respond(200, {
      access_token: "abc",
      token_type: "Bearer",
    });
    await expect(
      exchangeTodoistCode(
        { clientId: "cid", clientSecret: "secret" },
        "code-1",
        fetchImpl
      )
    ).resolves.toBe("abc");
    const body = jest.mocked(fetchImpl).mock.calls[0][1]!
      .body as URLSearchParams;
    expect(body.get("code")).toBe("code-1");
    expect(body.get("client_secret")).toBe("secret");
  });
});
