/**
 * The installed app's chrome: the page behind the phone screen, the manifest
 * and the service worker. Regression for the lighter strip under the floating
 * bar (html/body were #202022 while the screen is #141416), and for the
 * manifest's share target and icon shortcuts.
 */
import { viewport } from "@/app/metadata";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";

import { PHONE_GROUND, PHONE_MEDIA, SIDE_BG } from "@/lib/needt3/look-boot";

const root = process.cwd();
const read = (p: string) => readFileSync(path.join(root, p), "utf8");
const manifest = JSON.parse(read("public/manifest.webmanifest"));

describe("the phone ground", () => {
  const themes = read("src/styles/v3/themes.css");

  it("PHONE_GROUND is the --v2p-ground of the two themes", () => {
    // the light block comes first in the phone section, then the dark one
    const grounds = [
      ...themes
        .slice(themes.indexOf("PHONE v2"))
        .matchAll(/--v2p-ground:\s*(#[0-9a-f]{6})/gi),
    ].map((m) => m[1].toLowerCase());
    expect(grounds[0]).toBe(PHONE_GROUND.light);
    expect(grounds[1]).toBe(PHONE_GROUND.dark);
  });

  it("the page is not the desktop colour", () => {
    expect(PHONE_GROUND.dark).not.toBe(SIDE_BG.dark);
    expect(PHONE_GROUND.light).not.toBe(SIDE_BG.light);
  });

  it("html and body wear the ground on the phone UI, in both themes", () => {
    const css = read("src/styles/v3-overrides/phone-ground.css");
    expect(css).toContain('html:has(.needt-v3[data-ui="phone"])');
    expect(css).toContain(`background-color: ${PHONE_GROUND.light} !important`);
    expect(css).toContain(
      'html:has(.needt-v3[data-ui="phone"][data-theme="dark"]) body'
    );
    expect(css).toContain(`background-color: ${PHONE_GROUND.dark} !important`);
    expect(read("src/styles/v3-entry.css")).toContain("phone-ground.css");
  });

  it("no page gradient paints over the ground under the screen", () => {
    // globals.css gives body `background-image: var(--page-background)`; an
    // image covers background-color, so the phone rule must clear it.
    const css = read("src/styles/v3-overrides/phone-ground.css");
    const base = css.slice(0, css.indexOf('[data-theme="dark"]'));
    expect(base).toContain("background-image: none !important");
  });

  it("the manifest's splash and theme colour are the dark ground", () => {
    expect(manifest.background_color.toLowerCase()).toBe(PHONE_GROUND.dark);
    expect(manifest.theme_color.toLowerCase()).toBe(PHONE_GROUND.dark);
  });

  it("the theme-color meta is the ground on a phone, light and dark", () => {
    const colors = viewport.themeColor as { media?: string; color: string }[];
    const phone = colors.filter((c) => c.media?.includes(PHONE_MEDIA));
    expect(phone).toEqual([
      expect.objectContaining({
        media: expect.stringContaining("light"),
        color: expect.stringMatching(new RegExp(PHONE_GROUND.light, "i")),
      }),
      expect.objectContaining({
        media: expect.stringContaining("dark"),
        color: expect.stringMatching(new RegExp(PHONE_GROUND.dark, "i")),
      }),
    ]);
    // phone entries come first: the first matching media wins
    expect(colors.indexOf(phone[0])).toBeLessThan(
      colors.findIndex((c) => !c.media?.includes(PHONE_MEDIA))
    );
  });

  it("the page covers the safe area", () => {
    expect(viewport.viewportFit).toBe("cover");
  });
});

describe("the manifest", () => {
  it("is a standalone app", () => {
    expect(manifest.display).toBe("standalone");
  });

  it("receives a share: title, text, link and files, by POST", () => {
    const t = manifest.share_target;
    expect(t.action).toBe("/api/share-target");
    expect(t.method).toBe("POST");
    expect(t.enctype).toBe("multipart/form-data");
    expect(t.params).toMatchObject({
      title: "title",
      text: "text",
      url: "url",
    });
    expect(t.params.files[0].name).toBe("files");
    expect(t.params.files[0].accept.length).toBeGreaterThan(0);
  });

  it("has New task, Today and Ask Needt shortcuts, each with an icon and a deep link", () => {
    const names = manifest.shortcuts.map((s: { name: string }) => s.name);
    expect(names).toEqual(["New task", "Today", "Ask Needt"]);
    for (const s of manifest.shortcuts) {
      expect(s.url).toMatch(/^\/today/);
      expect(s.icons).toHaveLength(1);
      expect(existsSync(path.join(root, "public", s.icons[0].src))).toBe(true);
    }
    const urls = manifest.shortcuts.map((s: { url: string }) => s.url);
    expect(urls).toEqual([
      "/today?launch=new-task",
      "/today",
      "/today?launch=ask",
    ]);
  });
});

/** The service worker, run against a stub of its globals. */
function loadWorker() {
  const listeners: Record<string, (e: unknown) => void> = {};
  const cachePuts: { key: string; res: Response }[] = [];
  const fetchCalls: { url: string; init?: RequestInit }[] = [];
  const self = {
    addEventListener: (type: string, fn: (e: unknown) => void) => {
      listeners[type] = fn;
    },
    location: { origin: "https://app.needt.test" },
    skipWaiting: () => undefined,
    clients: { claim: () => Promise.resolve(), matchAll: async () => [] },
    registration: {},
  };
  const caches = {
    open: async () => ({
      put: async (key: string, res: Response) => {
        cachePuts.push({ key, res });
      },
      match: async () => undefined,
      addAll: async () => undefined,
    }),
    match: async () => undefined,
    keys: async () => [],
    delete: async () => true,
  };
  const ctx = vm.createContext({
    self,
    caches,
    fetch: async (url: string | Request, init?: RequestInit) => {
      fetchCalls.push({
        url: typeof url === "string" ? url : url.url,
        init,
      });
      return new Response("ok");
    },
    Response,
    Request,
    Headers,
    URL,
    URLSearchParams,
    crypto: { randomUUID: () => "11111111-2222-3333-4444-555555555555" },
    indexedDB: {},
    console,
  });
  vm.runInContext(read("public/sw.js"), ctx);
  return { listeners, cachePuts, fetchCalls };
}

describe("the service worker", () => {
  const respond = async (
    listeners: Record<string, (e: unknown) => void>,
    request: Record<string, unknown>
  ) => {
    let out: Promise<Response> | undefined;
    listeners.fetch({
      request,
      respondWith: (p: Promise<Response>) => {
        out = p;
      },
    });
    return out ? await out : undefined;
  };

  it("revalidates a page with the server and never serves today's HTML from the HTTP cache", async () => {
    const { listeners, fetchCalls } = loadWorker();
    await respond(listeners, {
      method: "GET",
      mode: "navigate",
      url: "https://app.needt.test/today",
    });
    expect(fetchCalls[0].init).toMatchObject({ cache: "no-cache" });
  });

  it("asks the server for tasks every time (no-store); the snapshot is for offline only", async () => {
    const { listeners, fetchCalls } = loadWorker();
    await respond(listeners, {
      method: "GET",
      mode: "cors",
      url: "https://app.needt.test/api/tasks",
    });
    expect(fetchCalls[0].init).toMatchObject({ cache: "no-store" });
  });

  it("keeps a shared file and redirects to the Share page with a GET", async () => {
    const { listeners, cachePuts } = loadWorker();
    const form = new FormData();
    form.set("title", "Trip");
    form.set("text", "Dates");
    form.set("url", "https://example.com/trip");
    form.append(
      "files",
      new File(["abc"], "plan.pdf", { type: "application/pdf" })
    );
    const res = await respond(listeners, {
      method: "POST",
      mode: "navigate",
      url: "https://app.needt.test/api/share-target",
      formData: async () => form,
    });
    expect(res?.status).toBe(303);
    const location = new URL(
      res!.headers.get("location")!,
      "https://app.needt.test"
    );
    expect(location.pathname).toBe("/share");
    expect(location.searchParams.get("title")).toBe("Trip");
    expect(location.searchParams.get("url")).toBe("https://example.com/trip");
    expect(location.searchParams.get("stash")).toBe(
      "11111111-2222-3333-4444-555555555555"
    );
    expect(location.searchParams.get("files")).toBe("1");
    expect(cachePuts).toHaveLength(1);
    expect(cachePuts[0].key).toBe(
      "/__share/11111111-2222-3333-4444-555555555555/0"
    );
    expect(cachePuts[0].res.headers.get("x-needt-name")).toBe("plan.pdf");
  });

  it("keeps shared files in the private cache family that sign-out clears", () => {
    const src = read("public/sw.js");
    expect(src).toContain("`${PRIVATE_CACHE_PREFIX}share`");
    const { SHARE_CACHE } = jest.requireActual("@/lib/needt3/share-target");
    expect(SHARE_CACHE).toBe("needt-private-v5:share");
  });
});
