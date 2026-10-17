import type {
  HocuspocusProvider,
  HocuspocusProviderWebsocket,
} from "@hocuspocus/provider";

/**
 * Hand a provider its token callback while keeping it on the shared socket.
 *
 * `HocuspocusProvider.setConfiguration()` builds a brand-new private socket
 * (url "", auto-connect) whenever the object it is given has no
 * `websocketProvider`. Calling it with only `{ token }` therefore silently
 * moves the provider off the socket that was configured with the real URL and
 * is later connected: that socket opens with nobody attached, nothing syncs,
 * and edits stay in the local draft.
 */
export function setProviderToken(
  provider: HocuspocusProvider,
  socket: HocuspocusProviderWebsocket,
  token: () => Promise<string>
) {
  provider.setConfiguration({ websocketProvider: socket, token });
}
