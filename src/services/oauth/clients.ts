import type { OAuthClient } from "@prisma/client";
import { z } from "zod";

import { newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import { UNUSED_CLIENT_TTL_MS } from "./constants";
import { randomToken } from "./crypto";
import { isAllowedRedirectUri } from "./redirect-uri";
import { type SafeFetchDeps, safeFetchJson } from "./safe-fetch";

const LOG_SOURCE = "OAuthClients";

/** A client metadata document is refetched after this long. */
const CIMD_CACHE_MS = 24 * 60 * 60 * 1000;
const MAX_REDIRECT_URIS = 10;

export class ClientError extends Error {
  constructor(
    public readonly code:
      | "invalid_client_metadata"
      | "invalid_redirect_uri"
      | "invalid_client",
    message: string
  ) {
    super(message);
    this.name = "ClientError";
  }
}

const clientMetadata = z.object({
  redirect_uris: z.array(z.string()).min(1).max(MAX_REDIRECT_URIS),
  client_name: z.string().trim().max(100).optional(),
  client_uri: z.string().url().optional(),
  logo_uri: z.string().url().optional(),
  token_endpoint_auth_method: z.literal("none").optional(),
  grant_types: z
    .array(z.enum(["authorization_code", "refresh_token"]))
    .optional(),
  response_types: z.array(z.literal("code")).optional(),
});

function checkRedirects(uris: string[]) {
  const bad = uris.find((uri) => !isAllowedRedirectUri(uri));
  if (bad) {
    throw new ClientError(
      "invalid_redirect_uri",
      `Redirect URIs must be https, or http on a loopback address: ${bad}`
    );
  }
}

function httpsOnly(uri: string | undefined) {
  return uri && uri.startsWith("https://") ? uri : null;
}

/** RFC 7591 dynamic registration. Public clients only (no secret). */
export async function registerClient(body: unknown) {
  const parsed = clientMetadata.safeParse(body);
  if (!parsed.success) {
    throw new ClientError(
      "invalid_client_metadata",
      parsed.error.issues[0]?.message ?? "Invalid client metadata"
    );
  }
  const meta = parsed.data;
  checkRedirects(meta.redirect_uris);
  const client = await prisma.oAuthClient.create({
    data: {
      clientId: randomToken("ndt_client_"),
      kind: "dcr",
      name: meta.client_name || "MCP client",
      redirectUris: meta.redirect_uris,
      clientUri: httpsOnly(meta.client_uri),
      logoUri: httpsOnly(meta.logo_uri),
    },
  });
  return {
    client_id: client.clientId,
    client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
    client_name: client.name,
    redirect_uris: client.redirectUris,
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
  };
}

/**
 * Removes dynamically registered clients that never got a token. Clients
 * register freely (claude.ai registers on every new connection attempt), so
 * an abandoned attempt must not stay forever.
 */
export async function cleanupUnusedClients(now = newDate()) {
  const { count } = await prisma.oAuthClient.deleteMany({
    where: {
      kind: "dcr",
      lastUsedAt: null,
      createdAt: { lt: new Date(now.getTime() - UNUSED_CLIENT_TTL_MS) },
      tokens: { none: {} },
    },
  });
  if (count) {
    await logger.info("Removed unused OAuth clients", { count }, LOG_SOURCE);
  }
  return count;
}

/** A CIMD client_id: an https URL with a path, no fragment or credentials. */
export function isMetadataDocumentUrl(clientId: string): boolean {
  try {
    const url = new URL(clientId);
    return (
      url.protocol === "https:" &&
      url.pathname !== "/" &&
      !url.hash &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

async function fetchMetadataDocument(
  clientId: string,
  deps?: SafeFetchDeps
): Promise<OAuthClient> {
  let doc: unknown;
  try {
    doc = await safeFetchJson(clientId, { deps });
  } catch (error) {
    // The reason stays in the log: echoing it (DNS answers, refusals) on the
    // consent page would turn it into a probe of internal names.
    await logger.warn(
      "Client metadata document could not be fetched",
      {
        host: new URL(clientId).host,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      LOG_SOURCE
    );
    throw new ClientError(
      "invalid_client",
      "The client's metadata could not be loaded."
    );
  }
  const parsed = clientMetadata
    .extend({ client_id: z.string() })
    .safeParse(doc);
  if (!parsed.success) {
    throw new ClientError(
      "invalid_client_metadata",
      "The client metadata document is not valid."
    );
  }
  if (parsed.data.client_id !== clientId) {
    throw new ClientError(
      "invalid_client_metadata",
      "The document's client_id does not match its URL."
    );
  }
  checkRedirects(parsed.data.redirect_uris);
  const data = {
    kind: "cimd",
    name: parsed.data.client_name || new URL(clientId).host,
    redirectUris: parsed.data.redirect_uris,
    clientUri: httpsOnly(parsed.data.client_uri),
    logoUri: httpsOnly(parsed.data.logo_uri),
    metadataFetchedAt: newDate(),
  };
  return prisma.oAuthClient.upsert({
    where: { clientId },
    update: data,
    create: { clientId, ...data },
  });
}

/** A client_id whose document failed is not fetched again for a while. */
const NEGATIVE_CACHE_MS = 5 * 60 * 1000;
const NEGATIVE_CACHE_MAX = 5_000;
const failedFetches = new Map<string, number>();

function rememberFailure(clientId: string) {
  if (failedFetches.size >= NEGATIVE_CACHE_MAX) failedFetches.clear();
  failedFetches.set(clientId, newDate().getTime() + NEGATIVE_CACHE_MS);
}

export function forgetFailedFetches() {
  failedFetches.clear();
}

export interface ResolveClientOptions {
  deps?: SafeFetchDeps;
  /**
   * Called before a CIMD document is fetched over the network (a cache
   * miss); false refuses the fetch. Routes pass their IP and global limits.
   */
  allowFetch?: () => Promise<boolean>;
}

/**
 * The client behind a client_id: a registered one, or — for an https URL —
 * the client its metadata document describes (fetched safely, cached a day,
 * failures remembered for five minutes).
 */
export async function resolveClient(
  clientId: string,
  options: ResolveClientOptions | SafeFetchDeps = {}
): Promise<OAuthClient> {
  const opts: ResolveClientOptions =
    "lookup" in options ? { deps: options } : options;
  if (isMetadataDocumentUrl(clientId)) {
    const cached = await prisma.oAuthClient.findUnique({ where: { clientId } });
    const fresh =
      cached?.metadataFetchedAt &&
      newDate().getTime() - cached.metadataFetchedAt.getTime() < CIMD_CACHE_MS;
    if (fresh && cached) return cached;
    if ((failedFetches.get(clientId) ?? 0) > newDate().getTime()) {
      throw new ClientError(
        "invalid_client",
        "The client's metadata could not be loaded."
      );
    }
    if (opts.allowFetch && !(await opts.allowFetch())) {
      throw new ClientError(
        "invalid_client",
        "Too many new clients right now. Try again in a minute."
      );
    }
    try {
      return await fetchMetadataDocument(clientId, opts.deps);
    } catch (error) {
      rememberFailure(clientId);
      throw error;
    }
  }
  const client = await prisma.oAuthClient.findUnique({ where: { clientId } });
  if (!client || client.kind !== "dcr") {
    throw new ClientError("invalid_client", "Unknown client.");
  }
  return client;
}

/**
 * Hosts whose client metadata documents Needt recognises: the consent page
 * shows no "cannot confirm who made it" caution for them. Extend with
 * OAUTH_TRUSTED_CLIENT_HOSTS (comma separated).
 */
const TRUSTED_CLIENT_HOSTS = [
  "claude.ai",
  "claude.com",
  "anthropic.com",
  "chatgpt.com",
  "openai.com",
];

export function isTrustedClientHost(host: string): boolean {
  const extra = (process.env.OAUTH_TRUSTED_CLIENT_HOSTS ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  const h = host.toLowerCase();
  return [...TRUSTED_CLIENT_HOSTS, ...extra].some(
    (trusted) => h === trusted || h.endsWith(`.${trusted}`)
  );
}

/**
 * Where a client says it comes from, for the consent page: the host of its
 * CIMD URL (proved by serving the document) or, for a self-registered
 * client, the host it sends the person back to (all it can prove).
 */
export function clientOrigin(
  client: Pick<OAuthClient, "kind" | "clientId">,
  redirectUri: string
): { host: string; trusted: boolean } {
  const host =
    client.kind === "cimd"
      ? new URL(client.clientId).host
      : new URL(redirectUri).host;
  return { host, trusted: client.kind === "cimd" && isTrustedClientHost(host) };
}
