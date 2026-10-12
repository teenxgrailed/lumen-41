/** @jest-environment jsdom */
import { act, createElement } from "react";

import { createRoot } from "react-dom/client";

import { StOfflineIndicator } from "../StOfflineIndicator";

let mockUser: string | null = "first";
let mockWorkspace = "workspace-a";
jest.mock("@/components/providers/app-session-context", () => ({
  useAppSession: () => ({ data: mockUser ? { user: { id: mockUser } } : null }),
}));
jest.mock("@/components/providers/WorkspaceProvider", () => ({
  useWorkspace: () => ({
    activeWorkspace: { workspace: { id: mockWorkspace } },
  }),
}));
jest.mock("../../root/V3Root", () => ({ useDesignV3: () => true }));
jest.mock("@/lib/pwa/offline-client", () => ({
  OFFLINE_SCHEMA_VERSION: 2,
  setNeedtOfflineScope: jest.fn(() => Promise.resolve()),
}));

describe("offline count from the established scoped service-worker protocol", () => {
  it("requests queue state, validates count and drops it on workspace change/logout", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    const worker = new EventTarget();
    const postMessage = jest.fn();
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: Object.assign(worker, { controller: { postMessage } }),
    });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const render = async () => {
      await act(async () => {
        root.render(createElement(StOfflineIndicator));
      });
    };
    const send = async (count: unknown, scopeKey?: string) => {
      await act(async () => {
        worker.dispatchEvent(
          new MessageEvent("message", {
            data: {
              type: "NEEDT_OFFLINE_STATE",
              state: "pending",
              count,
              scopeKey,
            },
          })
        );
      });
    };
    await render();
    expect(postMessage).toHaveBeenCalledWith({
      type: "NEEDT_OFFLINE_STATE_REQUEST",
    });
    await send(3);
    expect(host.textContent).not.toContain("changes waiting");
    await send(3, "2:other:workspace-a");
    expect(host.textContent).not.toContain("changes waiting");
    await send(3, "2:first:workspace-a");
    expect(host.textContent).toContain("3 changes waiting");
    await send(-4, "2:first:workspace-a");
    expect(host.textContent).toContain("3 changes waiting");
    // scopeKey null is the sign-out reset and applies to every tab.
    await send(0, null as unknown as string);
    expect(host.textContent).not.toContain("changes waiting");
    await send(3, "2:first:workspace-a");
    expect(host.textContent).toContain("3 changes waiting");
    mockWorkspace = "workspace-b";
    await render();
    expect(host.textContent).not.toContain("3 changes waiting");
    await send(1, "2:first:workspace-b");
    expect(host.textContent).toContain("1 change waiting");
    mockUser = null;
    await render();
    await send(5);
    expect(host.textContent).not.toContain("changes waiting");
    await act(async () => {
      root.unmount();
    });
    host.remove();
  });
});
