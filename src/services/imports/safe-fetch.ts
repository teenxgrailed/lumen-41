import dns from "node:dns";
import https from "node:https";
import net from "node:net";

/**
 * Outbound downloads for importers: the address comes from another service's
 * payload, so it is untrusted. Only https, no credentials in the URL, every
 * hop of a redirect checked again, and a connection that would reach a
 * private, loopback, link-local or otherwise internal address is refused.
 * The check runs twice: once up front (so a refusal is cheap and testable)
 * and once inside the connection's own DNS lookup (so a name that changes its
 * answer between the check and the connect cannot slip through).
 */

export type SafeFetchErrorCode =
  | "blocked_url"
  | "too_large"
  | "bad_status"
  | "too_many_redirects"
  | "timeout"
  | "network";

export class SafeFetchError extends Error {
  constructor(
    public readonly code: SafeFetchErrorCode,
    message: string
  ) {
    super(message);
    this.name = "SafeFetchError";
  }
}

const MAX_REDIRECTS = 3;
const DEFAULT_TIMEOUT_MS = 30_000;

/* ---------- addresses ---------- */

function ipv4ToInt(address: string): number | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    const n = Number(part);
    if (!Number.isInteger(n) || n < 0 || n > 255) return null;
    value = value * 256 + n;
  }
  return value;
}

/** [network, prefix length] pairs of IPv4 space that is not the public internet. */
const BLOCKED_IPV4: ReadonlyArray<readonly [string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

function isPrivateIpv4(address: string): boolean {
  const value = ipv4ToInt(address);
  if (value === null) return true;
  return BLOCKED_IPV4.some(([network, bits]) => {
    const base = ipv4ToInt(network) as number;
    const size = 2 ** (32 - bits);
    return Math.floor(value / size) === Math.floor(base / size);
  });
}

/** Eight 16-bit groups of an IPv6 address, or null when it does not parse. */
function ipv6Groups(address: string): number[] | null {
  let text = address.split("%")[0].toLowerCase();
  const tail = text.lastIndexOf(":");
  const embedded = text.slice(tail + 1);
  if (embedded.includes(".")) {
    const v4 = ipv4ToInt(embedded);
    if (v4 === null) return null;
    text = `${text.slice(0, tail + 1)}${Math.floor(v4 / 65536).toString(16)}:${(
      v4 % 65536
    ).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 ? head.length !== 8 : missing < 0) return null;
  const groups = [
    ...head,
    ...Array(halves.length === 2 ? missing : 0).fill("0"),
    ...rest,
  ].map((g) => parseInt(g, 16));
  return groups.length === 8 && groups.every((g) => g >= 0 && g <= 0xffff)
    ? groups
    : null;
}

function isPrivateIpv6(address: string): boolean {
  const g = ipv6Groups(address);
  if (!g) return true;
  const embeddedV4 = (hi: number, lo: number) =>
    `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  // :: and ::1
  if (g.slice(0, 7).every((x) => x === 0) && g[7] <= 1) return true;
  // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible (::a.b.c.d)
  if (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0)) {
    return isPrivateIpv4(embeddedV4(g[6], g[7]));
  }
  // NAT64 (64:ff9b::/96) carries an IPv4 address in the last 32 bits
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) {
    return isPrivateIpv4(embeddedV4(g[6], g[7]));
  }
  // 6to4 (2002::/16) carries one right after the prefix
  if (g[0] === 0x2002) return isPrivateIpv4(embeddedV4(g[1], g[2]));
  if ((g[0] & 0xfe00) === 0xfc00) return true; // unique local fc00::/7
  if ((g[0] & 0xffc0) === 0xfe80) return true; // link local fe80::/10
  if ((g[0] & 0xffc0) === 0xfec0) return true; // site local (deprecated)
  if ((g[0] & 0xff00) === 0xff00) return true; // multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true; // documentation
  return false;
}

/** True for any address that is not on the public internet (or not an address). */
export function isPrivateAddress(address: string): boolean {
  const family = net.isIP(address);
  if (family === 4) return isPrivateIpv4(address);
  if (family === 6) return isPrivateIpv6(address);
  return true;
}

/* ---------- url + resolution ---------- */

export type ResolveHost = (hostname: string) => Promise<string[]>;

const resolveWithDns: ResolveHost = async (hostname) => {
  const found = await dns.promises.lookup(hostname, { all: true });
  return found.map((entry) => entry.address);
};

/**
 * Throws SafeFetchError("blocked_url") unless `raw` is an https URL without
 * credentials whose host is, and resolves only to, public addresses.
 */
export async function assertPublicHttpsUrl(
  raw: string,
  resolve: ResolveHost = resolveWithDns
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SafeFetchError("blocked_url", "Not a valid URL.");
  }
  if (url.protocol !== "https:") {
    throw new SafeFetchError("blocked_url", "Only https URLs are fetched.");
  }
  if (url.username || url.password) {
    throw new SafeFetchError(
      "blocked_url",
      "URLs with credentials are refused."
    );
  }
  if (url.port && url.port !== "443") {
    throw new SafeFetchError(
      "blocked_url",
      "Only the default https port is used."
    );
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host)) {
    if (isPrivateAddress(host)) {
      throw new SafeFetchError("blocked_url", "That address is not public.");
    }
    return url;
  }
  let addresses: string[];
  try {
    addresses = await resolve(host);
  } catch {
    throw new SafeFetchError("network", "The host could not be resolved.");
  }
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
    throw new SafeFetchError("blocked_url", "That host is not public.");
  }
  return url;
}

/** DNS lookup for the connection itself: refuses non-public answers. */
export function guardedLookup(
  hostname: string,
  options: dns.LookupOptions,
  callback: (
    error: NodeJS.ErrnoException | null,
    address: string | dns.LookupAddress[],
    family?: number
  ) => void
) {
  dns.lookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error, "", 0);
    const list = addresses as dns.LookupAddress[];
    if (list.length === 0 || list.some((a) => isPrivateAddress(a.address))) {
      const blocked: NodeJS.ErrnoException = new Error(
        "Refusing to connect to a non-public address."
      );
      blocked.code = "EBLOCKED";
      return callback(blocked, "", 0);
    }
    if (options.all) return callback(null, list);
    return callback(null, list[0].address, list[0].family);
  });
}

/* ---------- download ---------- */

export interface TransportResponse {
  status: number;
  headers: Record<string, string | undefined>;
  body: AsyncIterable<Uint8Array>;
  destroy(): void;
}

export type Transport = (
  url: URL,
  options: { signal: AbortSignal }
) => Promise<TransportResponse>;

/** The real transport: node:https with the guarded DNS lookup. */
export const httpsTransport: Transport = (url, { signal }) =>
  new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        lookup: guardedLookup as never,
        signal,
        headers: { "user-agent": "Needt-Importer", accept: "*/*" },
      },
      (response) => {
        const headers: Record<string, string | undefined> = {};
        for (const [key, value] of Object.entries(response.headers)) {
          headers[key] = Array.isArray(value) ? value[0] : value;
        }
        resolve({
          status: response.statusCode ?? 0,
          headers,
          body: response,
          destroy: () => response.destroy(),
        });
      }
    );
    request.on("error", reject);
  });

export interface SafeDownloadOptions {
  maxBytes: number;
  timeoutMs?: number;
  resolve?: ResolveHost;
  transport?: Transport;
  /**
   * Hosts the caller accepts. Checked on the first address and again on
   * every redirect hop, before anything is resolved or connected to: a
   * redirect to a host this refuses stops the download even when the host
   * is public.
   */
  allowHost?: (hostname: string) => boolean;
}

export interface Downloaded {
  bytes: Buffer;
  contentType: string | null;
  finalUrl: string;
}

export async function safeDownload(
  raw: string,
  options: SafeDownloadOptions
): Promise<Downloaded> {
  const transport = options.transport ?? httpsTransport;
  const signal = AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  let current = raw;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (options.allowHost) {
      let host: string | null = null;
      try {
        host = new URL(current).hostname.toLowerCase();
      } catch {
        // assertPublicHttpsUrl below reports the unparseable address.
      }
      if (host !== null && !options.allowHost(host)) {
        throw new SafeFetchError("blocked_url", "That host is not allowed.");
      }
    }
    const url = await assertPublicHttpsUrl(current, options.resolve);
    let response: TransportResponse;
    try {
      response = await transport(url, { signal });
    } catch (error) {
      if (error instanceof SafeFetchError) throw error;
      if (signal.aborted) {
        throw new SafeFetchError("timeout", "The download took too long.");
      }
      throw new SafeFetchError("network", "The download failed.");
    }
    if (response.status >= 300 && response.status < 400) {
      response.destroy();
      const location = response.headers.location;
      if (!location) {
        throw new SafeFetchError("bad_status", "Redirect without a location.");
      }
      current = new URL(location, url).toString();
      continue;
    }
    if (response.status !== 200) {
      response.destroy();
      throw new SafeFetchError(
        "bad_status",
        `The file server answered ${response.status}.`
      );
    }
    const declared = Number(response.headers["content-length"]);
    if (Number.isFinite(declared) && declared > options.maxBytes) {
      response.destroy();
      throw new SafeFetchError("too_large", "The file is larger than allowed.");
    }
    const chunks: Buffer[] = [];
    let size = 0;
    try {
      for await (const chunk of response.body) {
        size += chunk.byteLength;
        if (size > options.maxBytes) {
          response.destroy();
          throw new SafeFetchError(
            "too_large",
            "The file is larger than allowed."
          );
        }
        chunks.push(Buffer.from(chunk));
      }
    } catch (error) {
      if (error instanceof SafeFetchError) throw error;
      if (signal.aborted) {
        throw new SafeFetchError("timeout", "The download took too long.");
      }
      throw new SafeFetchError("network", "The download failed.");
    }
    return {
      bytes: Buffer.concat(chunks),
      contentType: response.headers["content-type"] ?? null,
      finalUrl: url.toString(),
    };
  }
  throw new SafeFetchError("too_many_redirects", "Too many redirects.");
}
