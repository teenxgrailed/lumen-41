import dns from "node:dns";
import https from "node:https";
import net from "node:net";

/**
 * Fetches a JSON document from a URL an OAuth client gave us (its client
 * metadata document), without letting that URL reach anything internal:
 *
 * - https only, port 443, no credentials in the URL;
 * - every address the name resolves to must be public — a single private,
 *   loopback, link-local or reserved answer refuses the fetch — and the
 *   connection is pinned to the address that was checked, so a second DNS
 *   answer (rebinding) cannot swap it;
 * - redirects are followed by hand, each hop checked the same way, at most
 *   two;
 * - a short timeout and a size cap.
 */

export class UnsafeFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeFetchError";
  }
}

export interface SafeFetchResponse {
  status: number;
  location?: string;
  contentType?: string;
  body: Buffer;
}

export interface SafeFetchDeps {
  /** All addresses a hostname resolves to. */
  lookup(hostname: string): Promise<string[]>;
  /** One GET to `url`, connecting to `address`; must honour the size cap. */
  get(
    url: URL,
    address: string,
    limits: { timeoutMs: number; maxBytes: number }
  ): Promise<SafeFetchResponse>;
}

const V4_BLOCKS: [string, number][] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

function v4ToInt(ip: string): number {
  return (
    ip.split(".").reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0
  );
}

function inV4Block(ip: string, [base, bits]: [string, number]): boolean {
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (v4ToInt(ip) & mask) === (v4ToInt(base) & mask);
}

/** Expands an IPv6 address to its eight 16-bit groups. */
function v6Groups(ip: string): number[] | null {
  let address = ip.toLowerCase().split("%")[0];
  // A trailing dotted IPv4 (::ffff:1.2.3.4) becomes two groups.
  const v4 = address.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) {
    const n = v4ToInt(v4[1]);
    address = address.replace(
      v4[1],
      `${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`
    );
  }
  const [head, tail] = address.split("::");
  const left = head ? head.split(":") : [];
  const right = tail !== undefined && tail ? tail.split(":") : [];
  const fill = address.includes("::") ? 8 - left.length - right.length : 0;
  const groups = [...left, ...Array(fill).fill("0"), ...right].map((g) =>
    parseInt(g || "0", 16)
  );
  return groups.length === 8 && groups.every((g) => g >= 0 && g <= 0xffff)
    ? groups
    : null;
}

/** True for any address that is not a plain public unicast address. */
export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) return V4_BLOCKS.some((block) => inV4Block(ip, block));
  if (!net.isIPv6(ip)) return true;
  const g = v6Groups(ip);
  if (!g) return true;
  const embeddedV4 = () =>
    `${g[6] >> 8}.${g[6] & 0xff}.${g[7] >> 8}.${g[7] & 0xff}`;
  if (g.every((x) => x === 0)) return true; // ::
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return true; // ::1
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) {
    return isPrivateAddress(embeddedV4()); // ::ffff:a.b.c.d
  }
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) {
    return isPrivateAddress(embeddedV4()); // 64:ff9b::/96 NAT64
  }
  if ((g[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((g[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((g[0] & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true; // documentation
  if (g[0] === 0x2002)
    return isPrivateAddress(
      `${g[1] >> 8}.${g[1] & 0xff}.${g[2] >> 8}.${g[2] & 0xff}`
    ); // 6to4
  return false;
}

function checkUrl(url: URL) {
  if (url.protocol !== "https:") {
    throw new UnsafeFetchError("Only https URLs can be fetched.");
  }
  if (url.username || url.password) {
    throw new UnsafeFetchError("URLs with credentials are refused.");
  }
  if (url.port && url.port !== "443") {
    throw new UnsafeFetchError("Only port 443 is allowed.");
  }
}

async function publicAddress(
  hostname: string,
  deps: SafeFetchDeps
): Promise<string> {
  const host = hostname.replace(/^\[|\]$/g, "");
  const addresses = net.isIP(host) ? [host] : await deps.lookup(host);
  if (!addresses.length)
    throw new UnsafeFetchError("The host did not resolve.");
  if (addresses.some(isPrivateAddress)) {
    throw new UnsafeFetchError("The host resolves to a non-public address.");
  }
  return addresses[0];
}

const defaultDeps: SafeFetchDeps = {
  async lookup(hostname) {
    const answers = await dns.promises.lookup(hostname, {
      all: true,
      verbatim: true,
    });
    return answers.map((a) => a.address);
  },
  get(url, address, { timeoutMs, maxBytes }) {
    return new Promise((resolve, reject) => {
      const request = https.request(
        {
          method: "GET",
          host: url.hostname,
          servername: net.isIP(url.hostname) ? undefined : url.hostname,
          port: 443,
          path: `${url.pathname}${url.search}`,
          headers: {
            accept: "application/json",
            "user-agent": "Needt-OAuth/1",
          },
          timeout: timeoutMs,
          // Connect to the address that was checked, never a fresh answer.
          lookup: (_host, options, callback) => {
            const family = net.isIPv6(address) ? 6 : 4;
            if ((options as { all?: boolean }).all) {
              (
                callback as unknown as (
                  err: null,
                  addresses: { address: string; family: number }[]
                ) => void
              )(null, [{ address, family }]);
            } else {
              callback(null, address, family);
            }
          },
        },
        (response) => {
          const chunks: Buffer[] = [];
          let size = 0;
          response.on("data", (chunk: Buffer) => {
            size += chunk.length;
            if (size > maxBytes) {
              request.destroy(
                new UnsafeFetchError("The document is too large.")
              );
              return;
            }
            chunks.push(chunk);
          });
          response.on("end", () =>
            resolve({
              status: response.statusCode ?? 0,
              location: response.headers.location,
              contentType: response.headers["content-type"],
              body: Buffer.concat(chunks),
            })
          );
          response.on("error", reject);
        }
      );
      request.on("timeout", () =>
        request.destroy(new UnsafeFetchError("The fetch timed out."))
      );
      request.on("error", reject);
      request.end();
    });
  },
};

export async function safeFetchJson(
  input: string,
  options: {
    timeoutMs?: number;
    maxBytes?: number;
    maxRedirects?: number;
    deps?: SafeFetchDeps;
  } = {}
): Promise<unknown> {
  const deps = options.deps ?? defaultDeps;
  const limits = {
    timeoutMs: options.timeoutMs ?? 5_000,
    maxBytes: options.maxBytes ?? 64 * 1024,
  };
  let url = new URL(input);
  for (let hop = 0; hop <= (options.maxRedirects ?? 2); hop++) {
    checkUrl(url);
    const address = await publicAddress(url.hostname, deps);
    const response = await deps.get(url, address, limits);
    if (response.body.length > limits.maxBytes) {
      throw new UnsafeFetchError("The document is too large.");
    }
    if (response.status >= 300 && response.status < 400 && response.location) {
      url = new URL(response.location, url);
      continue;
    }
    if (response.status !== 200) {
      throw new UnsafeFetchError(`The fetch answered ${response.status}.`);
    }
    try {
      return JSON.parse(response.body.toString("utf8"));
    } catch {
      throw new UnsafeFetchError("The document is not JSON.");
    }
  }
  throw new UnsafeFetchError("Too many redirects.");
}
