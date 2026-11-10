import { resolvePublicHost } from "@/services/oauth/safe-fetch";
import type { ImapFlowOptions } from "imapflow";
import net from "net";

import { imapConnectionOptions } from "./imap-tls";
import type { ImapCredentials } from "./types";

/**
 * Connection options for a stored IMAP account, with the host checked at
 * connect time and pinned. The host was only checked when the account was
 * added; a name that later resolves to an internal address (DNS rebinding)
 * must not be dialled from the server. The checked address is what imapflow
 * connects to, and `servername` keeps TLS validating the original name.
 * Refusals are `UnsafeFetchError`.
 */
export async function pinnedImapOptions(
  credentials: ImapCredentials
): Promise<ImapFlowOptions> {
  const options = imapConnectionOptions(credentials);
  const address = await resolvePublicHost(credentials.host);
  if (net.isIP(credentials.host.replace(/^\[|\]$/g, ""))) return options;
  return { ...options, host: address, servername: credentials.host };
}
