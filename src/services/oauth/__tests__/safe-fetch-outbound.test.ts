/**
 * `assertPublicHost` and `safeFetch`: the guard for outbound targets a person
 * types in (webhook, custom AI endpoint, CalDAV / IMAP host, push endpoint).
 * Only the transport is faked (node:http / node:https); the address check,
 * the pinning and the response handling are the real code.
 */
import {
  UnsafeFetchError,
  assertPublicHost,
  safeFetch,
} from "@/services/oauth/safe-fetch";
import { EventEmitter } from "node:events";

type Script = (
  request: EventEmitter,
  onResponse: (res: unknown) => void
) => void;

const sent: {
  secure: boolean;
  options: Record<string, unknown>;
  body?: Buffer;
}[] = [];
let script: Script = answer(200, "{}");

function answer(
  status: number,
  body: string | Buffer | undefined,
  rawHeaders: string[] = ["Content-Type", "application/json"]
): Script {
  return (request, onResponse) => {
    const response = new EventEmitter() as EventEmitter &
      Record<string, unknown>;
    response.statusCode = status;
    response.statusMessage = "Reply";
    response.rawHeaders = rawHeaders;
    onResponse(response);
    if (body !== undefined) response.emit("data", Buffer.from(body));
    response.emit("end");
    request.emit("close");
  };
}

function fakeRequest(secure: boolean) {
  return (
    options: Record<string, unknown>,
    onResponse: (res: unknown) => void
  ) => {
    const request = new EventEmitter() as EventEmitter & {
      end(payload?: Buffer): void;
      destroy(error?: Error): void;
    };
    request.end = (payload) => {
      sent.push({ secure, options, body: payload });
      setImmediate(() => script(request, onResponse));
    };
    request.destroy = (error) => {
      if (error) request.emit("error", error);
      request.emit("close");
    };
    return request;
  };
}

jest.mock("node:http", () => {
  const request = (...args: unknown[]) =>
    (fakeRequest(false) as (...a: unknown[]) => unknown)(...args);
  return { __esModule: true, default: { request }, request };
});
jest.mock("node:https", () => {
  const request = (...args: unknown[]) =>
    (fakeRequest(true) as (...a: unknown[]) => unknown)(...args);
  return { __esModule: true, default: { request }, request };
});

const PUBLIC = "93.184.216.34";
const answers = (...addresses: string[]) => ({
  lookup: jest.fn().mockResolvedValue(addresses),
});

beforeEach(() => {
  sent.length = 0;
  script = answer(200, "{}");
});

describe("assertPublicHost", () => {
  it("accepts a name that resolves only to public addresses", async () => {
    const deps = answers(PUBLIC, "2606:4700:4700::1111");
    await expect(
      assertPublicHost("imap.example.com", deps)
    ).resolves.toBeUndefined();
    expect(deps.lookup).toHaveBeenCalledWith("imap.example.com");
  });

  it.each([
    ["10.0.0.5"],
    ["127.0.0.1"],
    ["169.254.169.254"],
    ["192.168.1.10"],
    ["172.16.0.1"],
    ["100.64.0.1"],
    ["::1"],
    ["::ffff:127.0.0.1"],
    ["fd00::1"],
    ["fe80::1"],
  ])("refuses a name that resolves to %s", async (address) => {
    await expect(
      assertPublicHost("calendar.example.com", answers(address))
    ).rejects.toBeInstanceOf(UnsafeFetchError);
  });

  it("refuses a name when any one of its answers is private", async () => {
    await expect(
      assertPublicHost("rebind.example.com", answers(PUBLIC, "10.0.0.1"))
    ).rejects.toBeInstanceOf(UnsafeFetchError);
  });

  it("refuses address literals without asking DNS", async () => {
    const deps = answers(PUBLIC);
    for (const host of ["127.0.0.1", "169.254.169.254", "[::1]", "::1"]) {
      await expect(assertPublicHost(host, deps)).rejects.toBeInstanceOf(
        UnsafeFetchError
      );
    }
    expect(deps.lookup).not.toHaveBeenCalled();
    await expect(assertPublicHost("8.8.8.8", deps)).resolves.toBeUndefined();
  });

  it("refuses a name that does not resolve and a resolver that fails", async () => {
    await expect(
      assertPublicHost("nowhere.example.com", { lookup: async () => [] })
    ).rejects.toBeInstanceOf(UnsafeFetchError);
    await expect(
      assertPublicHost("flaky.example.com", {
        lookup: async () => {
          throw new Error("queryA ETIMEOUT");
        },
      })
    ).rejects.toBeInstanceOf(UnsafeFetchError);
  });

  it("refuses an empty host", async () => {
    await expect(
      assertPublicHost("  ", answers(PUBLIC))
    ).rejects.toBeInstanceOf(UnsafeFetchError);
  });
});

describe("safeFetch", () => {
  it("POSTs to a public host, pinned to the address that was checked", async () => {
    script = answer(200, '{"ok":true}');
    const response = await safeFetch(
      "https://hooks.example.com:8443/in?x=1",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer k",
        },
        body: '{"a":1}',
      },
      { deps: answers(PUBLIC) }
    );

    expect(response.ok).toBe(true);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(sent).toHaveLength(1);
    const { secure, options, body } = sent[0];
    expect(secure).toBe(true);
    expect(options).toMatchObject({
      method: "POST",
      host: "hooks.example.com",
      port: "8443",
      path: "/in?x=1",
      servername: "hooks.example.com",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer k",
        host: "hooks.example.com:8443",
        "content-length": "7",
      },
    });
    expect(body?.toString()).toBe('{"a":1}');

    // The socket's own lookup can only answer with the checked address.
    const lookup = options.lookup as (
      host: string,
      opts: { all?: boolean },
      cb: (...args: unknown[]) => void
    ) => void;
    const single = jest.fn();
    lookup("hooks.example.com", {}, single);
    expect(single).toHaveBeenCalledWith(null, PUBLIC, 4);
    const all = jest.fn();
    lookup("hooks.example.com", { all: true }, all);
    expect(all).toHaveBeenCalledWith(null, [{ address: PUBLIC, family: 4 }]);
  });

  it("keeps plain http and non-standard ports for public hosts", async () => {
    await safeFetch(
      "http://llm.example.com:8080/v1/chat",
      { method: "POST", body: "{}" },
      { deps: answers(PUBLIC) }
    );
    expect(sent[0].secure).toBe(false);
    expect(sent[0].options).toMatchObject({
      port: "8080",
      servername: undefined,
    });
  });

  it("never opens a connection to a private target", async () => {
    for (const [url, address] of [
      ["https://internal.example.com/hook", "10.0.0.5"],
      ["https://metadata.example.com/", "169.254.169.254"],
      ["http://rebound.example.com/", "127.0.0.1"],
      ["http://127.0.0.1:3000/api", PUBLIC],
      ["http://[::1]/", PUBLIC],
      ["http://169.254.169.254/latest/meta-data", PUBLIC],
    ]) {
      await expect(
        safeFetch(
          url,
          { method: "POST", body: "{}" },
          { deps: answers(address) }
        )
      ).rejects.toBeInstanceOf(UnsafeFetchError);
    }
    expect(sent).toHaveLength(0);
  });

  it("refuses other schemes, credentials and unparseable URLs", async () => {
    const deps = answers(PUBLIC);
    for (const url of [
      "file:///etc/passwd",
      "ftp://files.example.com/",
      "https://user:pass@hooks.example.com/",
      "not a url",
    ]) {
      await expect(safeFetch(url, {}, { deps })).rejects.toBeInstanceOf(
        UnsafeFetchError
      );
    }
    expect(deps.lookup).not.toHaveBeenCalled();
    expect(sent).toHaveLength(0);
  });

  it("does not follow a redirect to an internal address", async () => {
    script = answer(302, undefined, ["Location", "http://169.254.169.254/"]);
    const response = await safeFetch(
      "https://hooks.example.com/in",
      { method: "POST", body: "{}" },
      { deps: answers(PUBLIC) }
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("http://169.254.169.254/");
    expect(sent).toHaveLength(1);
  });

  it("returns an error status as a response, like fetch", async () => {
    script = answer(500, "boom", ["Content-Type", "text/plain"]);
    const response = await safeFetch(
      "https://a.example.com/",
      {},
      {
        deps: answers(PUBLIC),
      }
    );
    expect(response.ok).toBe(false);
    expect(response.status).toBe(500);
    await expect(response.text()).resolves.toBe("boom");
  });

  it("handles an answer without a body", async () => {
    script = answer(204, undefined, []);
    const response = await safeFetch(
      "https://a.example.com/",
      {},
      {
        deps: answers(PUBLIC),
      }
    );
    expect(response.status).toBe(204);
  });

  it("refuses a response over the size cap", async () => {
    script = answer(200, "x".repeat(2_000));
    await expect(
      safeFetch(
        "https://a.example.com/",
        {},
        {
          deps: answers(PUBLIC),
          maxBytes: 1_000,
        }
      )
    ).rejects.toBeInstanceOf(UnsafeFetchError);
  });

  it("gives up at the deadline", async () => {
    script = () => undefined;
    await expect(
      safeFetch(
        "https://slow.example.com/",
        {},
        {
          deps: answers(PUBLIC),
          timeoutMs: 30,
        }
      )
    ).rejects.toBeInstanceOf(UnsafeFetchError);
  });
});
