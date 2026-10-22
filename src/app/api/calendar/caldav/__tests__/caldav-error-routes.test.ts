/**
 * Proves the CalDAV connection routes (`test`, `auth`, `available`) report a
 * login failure through the shared classifier: a connection failure
 * (`fetch failed`, #117) becomes a connection message + 502, while a genuine
 * credentials rejection (`Invalid credentials`, #122) stays the credentials
 * message + 401. `classifyCalDAVError` is exercised for real; only the login
 * primitive and the auth/db boundaries are mocked.
 */
import {
  UnsafeFetchError,
  assertPublicHost,
} from "@/services/oauth/safe-fetch";

import { authenticateRequest, requireAuth } from "@/lib/auth/api-auth";
import { canAddCalendar } from "@/lib/entitlements";
import { prisma } from "@/lib/prisma";

import * as utils from "../utils";

jest.mock("@/lib/auth/api-auth", () => ({
  authenticateRequest: jest.fn(),
  requireAuth: jest.fn(),
}));
jest.mock("@/lib/entitlements", () => ({ canAddCalendar: jest.fn() }));
jest.mock("@/services/oauth/safe-fetch", () => ({
  ...jest.requireActual("@/services/oauth/safe-fetch"),
  assertPublicHost: jest.fn(),
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    connectedAccount: { findUnique: jest.fn(), create: jest.fn() },
    calendarFeed: { findMany: jest.fn() },
  },
}));

const mockAuthenticateRequest = authenticateRequest as jest.MockedFunction<
  typeof authenticateRequest
>;
const mockRequireAuth = requireAuth as jest.MockedFunction<typeof requireAuth>;
const mockCanAddCalendar = canAddCalendar as jest.MockedFunction<
  typeof canAddCalendar
>;
const mockAssertPublicHost = assertPublicHost as jest.MockedFunction<
  typeof assertPublicHost
>;

/** Narrows a route handler's `Response | undefined` return to a defined Response. */
function assertResponse<T>(res: T | undefined): T {
  if (res == null) throw new Error("expected a route response, got undefined");
  return res;
}

const FETCH_FAILED = new TypeError("fetch failed");
const INVALID_CREDS = new Error("Invalid credentials");

function jsonRequest(body: unknown) {
  return {
    json: async () => body,
    url: "http://localhost/api/calendar/caldav/test",
  } as unknown as Parameters<(typeof import("../test/route"))["POST"]>[0];
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  // The servers in these tests are public unless a test says otherwise.
  mockAssertPublicHost.mockResolvedValue(undefined);
});

describe("CalDAV test route classifies login failures", () => {
  beforeEach(() => {
    mockRequireAuth.mockResolvedValue(null);
    jest
      .spyOn(utils, "createCalDAVClient")
      .mockReturnValue({} as ReturnType<typeof utils.createCalDAVClient>);
  });

  it("returns a connection error (502) for `fetch failed`", async () => {
    jest.spyOn(utils, "loginToCalDAVServer").mockRejectedValue(FETCH_FAILED);
    const { POST } = await import("../test/route");

    const res = await POST(
      jsonRequest({
        serverUrl: "https://dav.local",
        username: "u",
        password: "p",
      })
    );
    const data = await res.json();

    expect(res.status).toBe(502);
    expect(data.error.toLowerCase()).toContain("connect");
    expect(data.error.toLowerCase()).not.toContain("credentials");
    expect(data.details).toBe("fetch failed");
  });

  it("returns an auth error (401) for `Invalid credentials`", async () => {
    jest.spyOn(utils, "loginToCalDAVServer").mockRejectedValue(INVALID_CREDS);
    const { POST } = await import("../test/route");

    const res = await POST(
      jsonRequest({
        serverUrl: "https://dav.local",
        username: "u",
        password: "p",
      })
    );
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data.error.toLowerCase()).toContain("credentials");
  });

  it("classifies a post-login `fetch failed` during path verification as a connection error (502)", async () => {
    jest.spyOn(utils, "loginToCalDAVServer").mockResolvedValue(true);
    jest.spyOn(utils, "fetchCalDAVCalendars").mockRejectedValue(FETCH_FAILED);
    const { POST } = await import("../test/route");

    const res = await POST(
      jsonRequest({
        serverUrl: "https://dav.local",
        username: "u",
        password: "p",
        path: "/dav/calendars/u/",
      })
    );
    const data = await res.json();

    expect(res.status).toBe(502);
    expect(data.error.toLowerCase()).toContain("connect");
  });

  it("classifies a post-login `fetch failed` during discovery (no path) as a connection error (502)", async () => {
    jest.spyOn(utils, "loginToCalDAVServer").mockResolvedValue(true);
    jest.spyOn(utils, "fetchCalDAVCalendars").mockRejectedValue(FETCH_FAILED);
    const { POST } = await import("../test/route");

    const res = await POST(
      jsonRequest({
        serverUrl: "https://dav.local",
        username: "u",
        password: "p",
      })
    );
    const data = await res.json();

    expect(res.status).toBe(502);
    expect(data.error.toLowerCase()).toContain("connect");
  });
});

describe("CalDAV auth route classifies login failures", () => {
  beforeEach(() => {
    mockAuthenticateRequest.mockResolvedValue({ userId: "user-1" } as never);
    mockCanAddCalendar.mockResolvedValue({
      allowed: true,
      limit: 1,
      used: 0,
      remaining: 1,
      upgradeRequired: false,
      plan: "FREE",
    });
    jest
      .spyOn(utils, "createCalDAVClient")
      .mockReturnValue({} as ReturnType<typeof utils.createCalDAVClient>);
  });

  it("returns a connection error (502) for `fetch failed`", async () => {
    jest.spyOn(utils, "loginToCalDAVServer").mockRejectedValue(FETCH_FAILED);
    const { POST } = await import("../auth/route");

    const res = assertResponse(
      await POST(
        jsonRequest({
          serverUrl: "https://dav.local",
          username: "u",
          password: "p",
        })
      )
    );
    const data = await res.json();

    expect(res.status).toBe(502);
    expect(data.error.toLowerCase()).toContain("connect");
    expect(data.error.toLowerCase()).not.toContain("credentials");
  });

  it("returns an auth error (401) for `Invalid credentials`", async () => {
    jest.spyOn(utils, "loginToCalDAVServer").mockRejectedValue(INVALID_CREDS);
    const { POST } = await import("../auth/route");

    const res = assertResponse(
      await POST(
        jsonRequest({
          serverUrl: "https://dav.local",
          username: "u",
          password: "p",
        })
      )
    );
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data.error.toLowerCase()).toContain("credentials");
  });

  it("classifies a post-login `fetch failed` during path validation as a connection error (502)", async () => {
    jest.spyOn(utils, "loginToCalDAVServer").mockResolvedValue(true);
    jest.spyOn(utils, "fetchCalDAVCalendars").mockRejectedValue(FETCH_FAILED);
    const { POST } = await import("../auth/route");

    const res = assertResponse(
      await POST(
        jsonRequest({
          serverUrl: "https://dav.local",
          username: "u",
          password: "p",
          path: "/dav/calendars/u/",
        })
      )
    );
    const data = await res.json();

    expect(res.status).toBe(502);
    expect(data.error.toLowerCase()).toContain("connect");
  });

  it("keeps a malformed path (local URL construction error) as a 400 bad-path, not a 502", async () => {
    jest.spyOn(utils, "loginToCalDAVServer").mockResolvedValue(true);
    jest.spyOn(utils, "formatAbsoluteUrl").mockImplementation(() => {
      throw new Error("Invalid base URL: https://dav.local");
    });
    const fetchSpy = jest
      .spyOn(utils, "fetchCalDAVCalendars")
      .mockResolvedValue([]);
    const { POST } = await import("../auth/route");

    const res = assertResponse(
      await POST(
        jsonRequest({
          serverUrl: "https://dav.local",
          username: "u",
          password: "p",
          path: "/bad path/",
        })
      )
    );
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error.toLowerCase()).toContain("path");
    expect(data.error.toLowerCase()).not.toContain("connect");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("CalDAV available route classifies login failures", () => {
  beforeEach(() => {
    mockAuthenticateRequest.mockResolvedValue({ userId: "user-1" } as never);
    (prisma.connectedAccount.findUnique as jest.Mock).mockResolvedValue({
      id: "acc-1",
      provider: "CALDAV",
      caldavUrl: "https://dav.local",
      caldavUsername: "u",
      accessToken: "p",
      userId: "user-1",
    });
    jest
      .spyOn(utils, "createCalDAVClient")
      .mockReturnValue({} as ReturnType<typeof utils.createCalDAVClient>);
  });

  function getRequest() {
    return {
      url: "http://localhost/api/calendar/caldav/available?accountId=acc-1",
    } as unknown as Parameters<(typeof import("../available/route"))["GET"]>[0];
  }

  it("returns a connection error (502) for `fetch failed`", async () => {
    jest.spyOn(utils, "loginToCalDAVServer").mockRejectedValue(FETCH_FAILED);
    const { GET } = await import("../available/route");

    const res = assertResponse(await GET(getRequest()));
    const data = await res.json();

    expect(res.status).toBe(502);
    expect(data.error.toLowerCase()).toContain("connect");
    expect(data.error.toLowerCase()).not.toContain("credentials");
  });

  it("returns an auth error (401) for `Invalid credentials`", async () => {
    jest.spyOn(utils, "loginToCalDAVServer").mockRejectedValue(INVALID_CREDS);
    const { GET } = await import("../available/route");

    const res = assertResponse(await GET(getRequest()));
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data.error.toLowerCase()).toContain("credentials");
  });

  it("classifies a post-login `fetch failed` (calendar discovery) as a connection error (502)", async () => {
    // Login succeeds, but the next CalDAV network hop fails with fetch failed.
    jest.spyOn(utils, "loginToCalDAVServer").mockResolvedValue(true);
    jest.spyOn(utils, "fetchCalDAVCalendars").mockRejectedValue(FETCH_FAILED);
    const { GET } = await import("../available/route");

    const res = assertResponse(await GET(getRequest()));
    const data = await res.json();

    expect(res.status).toBe(502);
    expect(data.error.toLowerCase()).toContain("connect");
  });
});

describe("CalDAV add-calendar route classifies login failures", () => {
  beforeEach(() => {
    mockAuthenticateRequest.mockResolvedValue({ userId: "user-1" } as never);
    (prisma.connectedAccount.findUnique as jest.Mock).mockResolvedValue({
      id: "acc-1",
      provider: "CALDAV",
      caldavUrl: "https://dav.local",
      caldavUsername: "u",
      accessToken: "p",
      userId: "user-1",
    });
    jest
      .spyOn(utils, "createCalDAVClient")
      .mockReturnValue({} as ReturnType<typeof utils.createCalDAVClient>);
  });

  function addRequest() {
    return {
      json: async () => ({
        accountId: "acc-1",
        calendarId: "https://dav.local/c/",
      }),
      url: "http://localhost/api/calendar/caldav",
    } as unknown as Parameters<(typeof import("../route"))["POST"]>[0];
  }

  it("returns a connection error (502) for `fetch failed`", async () => {
    jest.spyOn(utils, "loginToCalDAVServer").mockRejectedValue(FETCH_FAILED);
    const { POST } = await import("../route");

    const res = assertResponse(await POST(addRequest()));
    const data = await res.json();

    expect(res.status).toBe(502);
    expect(data.error.toLowerCase()).toContain("connect");
    expect(data.error.toLowerCase()).not.toContain("credentials");
  });

  it("returns an auth error (401) for `Invalid credentials`", async () => {
    jest.spyOn(utils, "loginToCalDAVServer").mockRejectedValue(INVALID_CREDS);
    const { POST } = await import("../route");

    const res = assertResponse(await POST(addRequest()));
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data.error.toLowerCase()).toContain("credentials");
  });

  it("classifies a post-login `fetch failed` (calendar fetch) as a connection error (502)", async () => {
    jest.spyOn(utils, "loginToCalDAVServer").mockResolvedValue(true);
    jest.spyOn(utils, "fetchCalDAVCalendars").mockRejectedValue(FETCH_FAILED);
    const { POST } = await import("../route");

    const res = assertResponse(await POST(addRequest()));
    const data = await res.json();

    expect(res.status).toBe(502);
    expect(data.error.toLowerCase()).toContain("connect");
  });
});

describe("CalDAV test and auth routes refuse servers that are not public", () => {
  const PRIVATE = new UnsafeFetchError(
    "The host resolves to a non-public address."
  );

  beforeEach(() => {
    mockRequireAuth.mockResolvedValue(null);
    mockAuthenticateRequest.mockResolvedValue({ userId: "user-1" } as never);
    mockCanAddCalendar.mockResolvedValue({
      allowed: true,
      limit: 1,
      used: 0,
      remaining: 1,
      upgradeRequired: false,
      plan: "FREE",
    });
  });

  it("answers the test route with a 400 and never creates a client", async () => {
    mockAssertPublicHost.mockRejectedValue(PRIVATE);
    const createClient = jest.spyOn(utils, "createCalDAVClient");
    const { POST } = await import("../test/route");

    const res = await POST(
      jsonRequest({
        serverUrl: "http://169.254.169.254/dav",
        username: "u",
        password: "p",
      })
    );
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error.toLowerCase()).toContain("not allowed");
    // Why it was refused stays out of the answer.
    expect(JSON.stringify(data).toLowerCase()).not.toContain("non-public");
    expect(JSON.stringify(data).toLowerCase()).not.toContain("resolve");
    expect(mockAssertPublicHost).toHaveBeenCalledWith("169.254.169.254");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("answers the auth route with a 400 and never creates a client", async () => {
    mockAssertPublicHost.mockRejectedValue(PRIVATE);
    const createClient = jest.spyOn(utils, "createCalDAVClient");
    const { POST } = await import("../auth/route");

    const res = assertResponse(
      await POST(
        jsonRequest({
          serverUrl: "http://localhost:5232",
          username: "u",
          password: "p",
        })
      )
    );
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error.toLowerCase()).toContain("not allowed");
    expect(JSON.stringify(data).toLowerCase()).not.toContain("non-public");
    expect(createClient).not.toHaveBeenCalled();
    expect(prisma.connectedAccount.create).not.toHaveBeenCalled();
  });

  it("refuses an unparseable server address", async () => {
    const createClient = jest.spyOn(utils, "createCalDAVClient");
    const { POST } = await import("../test/route");

    const res = await POST(
      jsonRequest({ serverUrl: "not a url", username: "u", password: "p" })
    );

    expect(res.status).toBe(400);
    expect(mockAssertPublicHost).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
  });

  it("refuses a path that is a full URL on a private host, before saving", async () => {
    mockAssertPublicHost
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(PRIVATE);
    jest
      .spyOn(utils, "createCalDAVClient")
      .mockReturnValue({} as ReturnType<typeof utils.createCalDAVClient>);
    jest.spyOn(utils, "loginToCalDAVServer").mockResolvedValue(true);
    jest.spyOn(utils, "fetchCalDAVCalendars").mockResolvedValue([]);
    const { POST } = await import("../auth/route");

    const res = assertResponse(
      await POST(
        jsonRequest({
          serverUrl: "https://dav.example.com",
          username: "u",
          password: "p",
          path: "http://10.0.0.5/internal/",
        })
      )
    );

    expect(res.status).toBe(400);
    expect(mockAssertPublicHost).toHaveBeenLastCalledWith("10.0.0.5");
    expect(prisma.connectedAccount.create).not.toHaveBeenCalled();
  });

  it("still reaches a public self-hosted server over plain http on its own port", async () => {
    const createClient = jest
      .spyOn(utils, "createCalDAVClient")
      .mockReturnValue({} as ReturnType<typeof utils.createCalDAVClient>);
    jest.spyOn(utils, "loginToCalDAVServer").mockRejectedValue(FETCH_FAILED);
    const { POST } = await import("../test/route");

    const res = await POST(
      jsonRequest({
        serverUrl: "http://dav.example.com:5232/dav",
        username: "u",
        password: "p",
      })
    );

    // Past the guard: the login was attempted and its failure classified.
    expect(res.status).toBe(502);
    expect(mockAssertPublicHost).toHaveBeenCalledWith("dav.example.com");
    expect(createClient).toHaveBeenCalledWith(
      "http://dav.example.com:5232/dav",
      "u",
      "p"
    );
  });
});
