/**
 * @jest-environment jsdom
 *
 * The onboarding controller's write guards, shared by the desktop and the
 * phone: no prefs write before settings have loaded, working hours saved only
 * when loaded and changed, the third step saves the right tile list for the
 * face that drew it, and only steps the person stood on are saved.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { type Onboarding, useOnboarding } from "../useOnboarding";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const push = jest.fn();
const mutateAsync = jest.fn<Promise<object>, [unknown]>(async () => ({}));
const sendJson = jest.fn<Promise<object>, unknown[]>(async () => ({}));
const fetchJson = jest.fn();
const notifyError = jest.fn();
let settingsData: unknown;
let cache: unknown;

jest.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
jest.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ getQueryData: () => cache }),
}));
jest.mock("@/lib/needt3/hooks/settings", () => ({
  useSettings: () => ({ data: settingsData }),
  useUpdateSettings: () => ({ mutateAsync }),
}));
jest.mock("@/lib/needt3/hooks/connections", () => ({
  useConnections: () => ({ data: [] }),
}));
jest.mock("@/lib/needt3/hooks/tasks", () => ({
  useCreateTask: () => ({ mutateAsync: jest.fn() }),
}));
jest.mock("@/lib/needt3/hooks/core", () => ({
  browserTimeZone: () => "Europe/Zurich",
  fetchJson: (...a: unknown[]) => fetchJson(...a),
  sendJson: (...a: unknown[]) => sendJson(...a),
}));
jest.mock("@/lib/notifications", () => ({
  notify: { error: (...a: unknown[]) => notifyError(...a), success: jest.fn() },
}));
jest.mock("@/lib/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const settings = (prefs: Record<string, unknown> = {}) => ({
  timeZone: "Europe/Zurich",
  prefs,
  theme: "system",
});

let host: HTMLDivElement;
let root: Root;
let ob: Onboarding;

function Probe({ ui, startAt }: { ui: "phone" | "desktop"; startAt?: string }) {
  ob = useOnboarding({ ui, startAt });
  return null;
}
const mount = (ui: "phone" | "desktop", startAt?: string) =>
  act(async () => {
    root.render(h(Probe, { ui, startAt }));
  });

beforeEach(() => {
  jest.clearAllMocks();
  settingsData = undefined;
  cache = undefined;
  fetchJson.mockResolvedValue({ workHourStart: 9, workHourEnd: 17 });
  host = document.createElement("div");
  root = createRoot(host);
});
afterEach(() => act(() => root.unmount()));

describe("before settings have loaded", () => {
  it("Skip and Open my day do nothing at all", async () => {
    await mount("phone");
    expect(ob.ready).toBe(false);
    await act(async () => {
      await ob.finish(true);
    });
    expect(push).not.toHaveBeenCalled();
    expect(mutateAsync).not.toHaveBeenCalled();
  });
});

describe("prefs are replaced whole on the server", () => {
  it("with the cache empty, finishing writes nothing but still opens Home", async () => {
    settingsData = settings({ accent: "mint" });
    cache = undefined;
    await mount("phone");
    await act(async () => {
      await ob.finish(true);
    });
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/today");
  });

  it("with it loaded, a patch is merged into every key already there", async () => {
    settingsData = settings({ accent: "mint", docsSort: "title" });
    cache = { prefs: { accent: "mint", docsSort: "title" } };
    await mount("phone");
    await act(async () => {
      await ob.finish(true);
    });
    expect(mutateAsync).toHaveBeenCalledWith({
      prefs: { accent: "mint", docsSort: "title", onboarded: true },
    });
  });
});

describe("working hours", () => {
  const toNext = () =>
    act(async () => {
      await ob.go(ob.i + 1);
    });

  it("are not sent while the saved row has not come back", async () => {
    settingsData = settings();
    cache = { prefs: {} };
    fetchJson.mockReturnValue(new Promise(() => {}));
    await mount("phone", "setup");
    await act(async () => ob.setEnd(20));
    await toNext();
    expect(sendJson).not.toHaveBeenCalled();
  });

  it("are not sent when nothing changed", async () => {
    settingsData = settings();
    cache = { prefs: {} };
    await mount("phone", "setup");
    await toNext();
    expect(sendJson).not.toHaveBeenCalled();
  });

  it("are sent once they are loaded and changed", async () => {
    settingsData = settings();
    cache = { prefs: {} };
    await mount("phone", "setup");
    expect(ob.end).toBe(17);
    await act(async () => ob.setEnd(19));
    await toNext();
    expect(sendJson).toHaveBeenCalledWith(
      "/api/auto-schedule-settings",
      "PATCH",
      { workHourStart: 9, workHourEnd: 19 }
    );
  });

  it("a day shorter than an hour does not leave the step", async () => {
    settingsData = settings();
    cache = { prefs: {} };
    await mount("phone", "setup");
    await act(async () => ob.setEnd(9));
    await toNext();
    expect(ob.id).toBe("setup");
    expect(sendJson).not.toHaveBeenCalled();
  });
});

describe("the third step saves the list of the face that drew it", () => {
  it("the phone writes mobileTiles in the desktop's spelling", async () => {
    settingsData = settings();
    cache = { prefs: { accent: "mint" } };
    await mount("phone", "sidebar");
    await act(async () => ob.setMenu(["tasks", "home", "ask"]));
    await act(async () => {
      await ob.go(ob.i + 1);
    });
    expect(mutateAsync).toHaveBeenCalledWith({
      prefs: { accent: "mint", mobileTiles: ["tasks", "today", "ask"] },
    });
  });

  it("the desktop writes sidebarTiles and leaves mobileTiles alone", async () => {
    settingsData = settings();
    cache = { prefs: {} };
    await mount("desktop", "sidebar");
    await act(async () => {
      await ob.go(ob.i + 1);
    });
    const call = mutateAsync.mock.calls[0][0] as {
      prefs: Record<string, unknown>;
    };
    expect(call.prefs.sidebarTiles).toBeDefined();
    expect(call.prefs).not.toHaveProperty("mobileTiles");
  });

  it("a saved pill seeds the step; Skip puts the default back", async () => {
    settingsData = settings({ mobileTiles: ["calendar", "tasks", "ask"] });
    cache = { prefs: settings().prefs };
    await mount("phone", "sidebar");
    expect(ob.menu).toEqual(["calendar", "tasks", "ask"]);
    await act(async () => ob.skipTiles());
    expect(ob.menu).toEqual(["home", "docs", "ask"]);
    expect(ob.id).toBe("first");
    expect(mutateAsync).not.toHaveBeenCalled();
  });
});

describe("only steps the person stood on are saved", () => {
  it("jumping with go() saves the step it left, not ones never shown", async () => {
    settingsData = settings();
    cache = { prefs: {} };
    await mount("phone", "use");
    await act(async () => ob.setUses(["side"]));
    await act(async () => {
      await ob.go(1);
    });
    expect(mutateAsync).toHaveBeenCalledWith({ prefs: { uses: ["side"] } });
  });
});
