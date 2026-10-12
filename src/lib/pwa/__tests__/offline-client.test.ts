import {
  DEVICE_PREFERENCE_KEYS,
  clearIfSignedOut,
  clearUserScopedStorage,
  prepareNeedtSignOut,
} from "../offline-client";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() {
    return this.values.size;
  }
  clear() {
    this.values.clear();
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

describe("sign-out storage cleanup", () => {
  it("keeps device preferences and removes everything else", () => {
    const storage = new MemoryStorage();
    storage.setItem("theme", "dark");
    storage.setItem("needt:quick-tip:next-index", "2");
    storage.setItem("task-data-storage", '{"state":{"tasks":["secret"]}}');
    storage.setItem("needt-active-workspace-id", "ws-1");
    storage.setItem("needt-page-draft:page-1", "draft");
    storage.setItem("a-store-nobody-listed-yet", "user data");

    clearUserScopedStorage(storage);

    expect(
      [...Array(storage.length).keys()].map((index) => storage.key(index))
    ).toEqual(["theme", "needt:quick-tip:next-index"]);
    expect(DEVICE_PREFERENCE_KEYS.has("task-data-storage")).toBe(false);
  });

  it("cuts the settings store down to the theme", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      "calendar-settings",
      JSON.stringify({
        state: {
          user: {
            theme: "light",
            systemTheme: { light: "light", dark: "dim" },
            email: "person@example.com",
            timeZone: "Europe/Berlin",
          },
          integrations: { googleCalendar: { connected: true } },
        },
        version: 2,
      })
    );

    clearUserScopedStorage(storage);

    expect(JSON.parse(storage.getItem("calendar-settings") ?? "null")).toEqual({
      state: {
        user: { theme: "light", systemTheme: { light: "light", dark: "dim" } },
      },
      version: 2,
    });
  });

  it("drops a settings store it cannot read", () => {
    const storage = new MemoryStorage();
    storage.setItem("calendar-settings", "{not json");

    clearUserScopedStorage(storage);

    expect(storage.getItem("calendar-settings")).toBeNull();
  });
});

describe("sign-out offline sync", () => {
  const messages: { type: string; scope?: unknown }[] = [];
  let answerSync = true;

  beforeEach(() => {
    messages.length = 0;
    answerSync = true;
    const worker = {
      postMessage: (
        message: { type: string; scope?: unknown },
        ports: MessagePort[]
      ) => {
        messages.push(message);
        if (message.type === "NEEDT_SYNC_NOW" && !answerSync) return;
        ports[0].postMessage({ ok: true });
      },
    };
    Object.assign(globalThis, {
      window: globalThis,
      localStorage: new MemoryStorage(),
      navigator: {
        serviceWorker: {
          controller: worker,
          getRegistration: async () => undefined,
        },
      },
    });
  });

  afterAll(() => {
    for (const key of ["window", "localStorage", "navigator"]) {
      delete (globalThis as Record<string, unknown>)[key];
    }
  });

  it("asks the worker to sync before it clears offline data", async () => {
    await prepareNeedtSignOut(50);

    expect(messages.map(({ type }) => type)).toEqual([
      "NEEDT_SYNC_NOW",
      "NEEDT_CLEAR_OFFLINE_DATA",
    ]);
  });

  it("tells an evicted worker its scope again before the sync", async () => {
    localStorage.setItem("needt-offline-user-id", "user-1");
    localStorage.setItem("needt-active-workspace-id", "ws-1");

    await prepareNeedtSignOut(50);

    expect(messages).toEqual([
      {
        type: "NEEDT_SET_OFFLINE_SCOPE",
        scope: { userId: "user-1", workspaceId: "ws-1", schemaVersion: 2 },
      },
      { type: "NEEDT_SYNC_NOW" },
      { type: "NEEDT_CLEAR_OFFLINE_DATA" },
    ]);
    expect(localStorage.getItem("needt-offline-user-id")).toBeNull();
  });

  it("clears after reconnecting only when the server confirms no session", async () => {
    const response = (body: unknown, ok = true) =>
      Promise.resolve({ ok, json: async () => body } as Response);

    await expect(
      clearIfSignedOut(() => response({ user: { id: "user-1" } }))
    ).resolves.toBe(false);
    await expect(clearIfSignedOut(() => response({}, false))).resolves.toBe(
      false
    );
    await expect(
      clearIfSignedOut(() => Promise.reject(new Error("offline")))
    ).resolves.toBe(false);
    expect(messages).toEqual([]);

    await expect(clearIfSignedOut(() => response({}))).resolves.toBe(true);
    expect(messages.map(({ type }) => type)).toEqual([
      "NEEDT_CLEAR_OFFLINE_DATA",
    ]);
  });

  it("clears anyway when the sync does not answer in time", async () => {
    answerSync = false;

    await prepareNeedtSignOut(20);

    expect(messages.map(({ type }) => type)).toEqual([
      "NEEDT_SYNC_NOW",
      "NEEDT_CLEAR_OFFLINE_DATA",
    ]);
  });
});
