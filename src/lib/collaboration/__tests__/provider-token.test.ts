/** @jest-environment node */
import {
  HocuspocusProvider,
  HocuspocusProviderWebsocket,
} from "@hocuspocus/provider";

import { setProviderToken } from "../provider-token";
import { Yjs as Y } from "../yjs";

function makePair() {
  const socket = new HocuspocusProviderWebsocket({
    url: "ws://127.0.0.1:1",
    autoConnect: false,
  });
  const provider = new HocuspocusProvider({
    name: "page:v2:test",
    document: new Y.Doc(),
    websocketProvider: socket,
    token: null,
  });
  return { socket, provider };
}

describe("setProviderToken", () => {
  it("keeps the provider on the shared socket", () => {
    const { socket, provider } = makePair();
    setProviderToken(provider, socket, async () => "t");
    expect(provider.configuration.websocketProvider).toBe(socket);
    expect(socket.configuration.providerMap.size).toBe(0);
    provider.attach();
    expect(socket.configuration.providerMap.size).toBe(1);
    provider.destroy();
    socket.destroy();
  });

  it("documents the trap: a bare { token } swaps the socket", () => {
    const { socket, provider } = makePair();
    provider.setConfiguration({ token: async () => "t" });
    expect(provider.configuration.websocketProvider).not.toBe(socket);
    provider.destroy();
    socket.destroy();
  });
});
