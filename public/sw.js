const STATIC_CACHE_NAME = "needt-static-v7";
const PRIVATE_CACHE_PREFIX = "needt-private-v5:";
const DB_NAME = "needt-offline-v2";
const DB_VERSION = 2;
const OFFLINE_SCHEMA_VERSION = 2;
const STORE_QUEUE = "mutationQueue";
const STORE_SNAPSHOTS = "snapshots";
const STORE_META = "meta";
const STATIC_URLS = ["/manifest.webmanifest", "/icons/icon-192.png"];
// What a share sheet handed over (Web Share Target): kept here, in the private
// cache family so sign-out clears it, until the Share page has saved it.
const SHARE_CACHE_NAME = `${PRIVATE_CACHE_PREFIX}share`;
const SHARE_PATH = "/api/share-target";
const SNAPSHOT_APIS = ["/api/tasks", "/api/connect/schedule"];
const OFFLINE_MUTATIONS = [
  {
    methods: new Set(["PUT", "PATCH", "DELETE"]),
    pattern: /^\/api\/tasks\/[^/]+\/?$/,
  },
  { methods: new Set(["PUT"]), pattern: /^\/api\/daily-agenda\/?$/ },
  {
    methods: new Set(["PUT"]),
    pattern: /^\/api\/pages\/[^/]+\/blocks\/?$/,
  },
];

let activeScope = null;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME).then((cache) => cache.addAll(STATIC_URLS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter(
                (key) =>
                  key !== STATIC_CACHE_NAME &&
                  !key.startsWith(PRIVATE_CACHE_PREFIX)
              )
              .map((key) => caches.delete(key))
          )
        ),
      openDb(),
    ])
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.method === "POST" && url.pathname === SHARE_PATH) {
    event.respondWith(receiveShare(request));
    return;
  }

  if (request.method === "GET" && request.mode === "navigate") {
    event.respondWith(networkFirstPrivate(request));
    return;
  }

  if (
    request.method === "GET" &&
    SNAPSHOT_APIS.some((api) => url.pathname.startsWith(api))
  ) {
    event.respondWith(snapshotFirst(request));
    return;
  }

  if (request.method !== "GET" && url.pathname.startsWith("/api/")) {
    if (isOfflineSafeMutation(request.method, url.pathname)) {
      event.respondWith(queueWhenOffline(request));
    }
    return;
  }

  if (
    request.method === "GET" &&
    (url.pathname.startsWith("/_next/static/") ||
      STATIC_URLS.includes(url.pathname))
  ) {
    event.respondWith(cacheFirstStatic(request));
  }
});

self.addEventListener("sync", (event) => {
  if (event.tag === "needt-sync-queue") event.waitUntil(flushQueue());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "NEEDT_SET_OFFLINE_SCOPE") {
    event.waitUntil(
      setActiveScope(event.data.scope).then(() =>
        event.ports[0]?.postMessage({ ok: true })
      )
    );
  } else if (event.data?.type === "NEEDT_CLEAR_OFFLINE_DATA") {
    event.waitUntil(
      clearOfflineData().then(() => event.ports[0]?.postMessage({ ok: true }))
    );
  } else if (event.data?.type === "NEEDT_SYNC_NOW") {
    event.waitUntil(
      flushQueue()
        .catch(() => undefined)
        .then(() => event.ports[0]?.postMessage({ ok: true }))
    );
  } else if (event.data?.type === "NEEDT_OFFLINE_STATE_REQUEST") {
    event.waitUntil(broadcastQueueState());
  }
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data?.json() ?? {};
  } catch {
    data = { title: "Needt", body: event.data?.text() ?? "Planner reminder" };
  }
  const url = typeof data.url === "string" ? data.url : "/today";
  event.waitUntil(
    self.registration.showNotification(data.title || "Needt", {
      body: data.body || "Your planner has an update.",
      icon: "/icons/icon-192.png",
      badge: "/icons/favicon-32.png",
      // One notification per URL: a repeat replaces instead of stacking.
      tag: url,
      data: { url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const raw = event.notification.data;
  const target = new URL(
    (typeof raw === "string" ? raw : raw?.url) || "/today",
    self.location.origin
  );
  if (target.origin !== self.location.origin) return;
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(async (windows) => {
        const open = windows.find((client) =>
          client.url.startsWith(self.location.origin)
        );
        if (open) {
          await open.focus();
          // Move the window that is already open to the notification's page.
          if ("navigate" in open) {
            return open.navigate(target.href).catch(() => undefined);
          }
          return undefined;
        }
        return self.clients.openWindow(target.href);
      })
  );
});

// The browser rotated the subscription: save the new one so reminders keep
// arriving. The fetches carry the session cookie.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const keyResponse = await fetch("/api/push-subscriptions", {
        credentials: "same-origin",
      });
      if (!keyResponse.ok) return;
      const { publicKey } = await keyResponse.json();
      if (!publicKey) return;
      const padding = "=".repeat((4 - (publicKey.length % 4)) % 4);
      const raw = atob(
        (publicKey + padding).replace(/-/g, "+").replace(/_/g, "/")
      );
      const subscription = await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: Uint8Array.from(raw, (c) => c.charCodeAt(0)),
      });
      await fetch("/api/push-subscriptions", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });
    })().catch(() => undefined)
  );
});

function normalizeScope(scope) {
  if (
    !scope ||
    typeof scope.userId !== "string" ||
    !scope.userId ||
    typeof scope.workspaceId !== "string" ||
    !scope.workspaceId ||
    scope.schemaVersion !== OFFLINE_SCHEMA_VERSION
  ) {
    return null;
  }
  return {
    userId: scope.userId,
    workspaceId: scope.workspaceId,
    schemaVersion: OFFLINE_SCHEMA_VERSION,
    key: `${OFFLINE_SCHEMA_VERSION}:${scope.userId}:${scope.workspaceId}`,
  };
}

async function setActiveScope(scope) {
  const nextScope = normalizeScope(scope);
  if (!nextScope) {
    await clearOfflineData();
    return;
  }
  const db = await openDb();
  const previousIdentity = await getItem(db, STORE_META, "activeIdentity");
  if (
    previousIdentity?.userId &&
    previousIdentity.userId !== nextScope.userId
  ) {
    await clearOfflineData();
  }
  const currentDb = await openDb();
  await putItem(currentDb, STORE_META, {
    key: "activeIdentity",
    userId: nextScope.userId,
    workspaceId: nextScope.workspaceId,
    updatedAt: Date.now(),
  });
  if (activeScope?.key !== nextScope.key) {
    activeScope = nextScope;
    await broadcastQueueState();
  }
}

function privateCacheName(kind) {
  return activeScope
    ? `${PRIVATE_CACHE_PREFIX}${kind}:${activeScope.key}`
    : null;
}

function scopedKey(url) {
  return activeScope ? `${activeScope.key}|${url}` : null;
}

function isOfflineSafeMutation(method, pathname) {
  return OFFLINE_MUTATIONS.some(
    (rule) => rule.methods.has(method) && rule.pattern.test(pathname)
  );
}

async function cacheFirstStatic(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(STATIC_CACHE_NAME);
    await cache.put(request, response.clone());
  }
  return response;
}

async function networkFirstPrivate(request) {
  const cacheName = privateCacheName("pages");
  try {
    // "no-cache": the HTML of a page is never taken from the browser's own
    // HTTP cache without asking the server; the copy below is only for offline.
    const response = await fetch(request, { cache: "no-cache" });
    if (response.ok && cacheName) {
      const cache = await caches.open(cacheName);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    if (cacheName) {
      const cache = await caches.open(cacheName);
      const cached = await cache.match(request);
      if (cached) return cached;
    }
    return new Response("Needt is offline. Reconnect and try again.", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
}

// A share arrives as a POST with the title, text, link and files. The service
// worker keeps the files (a redirect cannot carry them) and sends the person
// to the Share page, a normal GET that signs in first when it has to.
async function receiveShare(request) {
  const id = crypto.randomUUID();
  const params = new URLSearchParams({ stash: id });
  try {
    const form = await request.formData();
    for (const key of ["title", "text", "url"]) {
      const value = form.get(key);
      if (typeof value === "string" && value) {
        params.set(key, value.slice(0, 2000));
      }
    }
    const files = form
      .getAll("files")
      .filter((file) => typeof file !== "string" && file.size > 0);
    const cache = await caches.open(SHARE_CACHE_NAME);
    await Promise.all(
      files.slice(0, 10).map((file, index) =>
        cache.put(
          `/__share/${id}/${index}`,
          new Response(file, {
            headers: {
              "content-type": file.type || "application/octet-stream",
              "x-needt-name": encodeURIComponent(file.name || `file-${index}`),
            },
          })
        )
      )
    );
    if (files.length) params.set("files", String(Math.min(files.length, 10)));
  } catch {
    params.delete("stash");
  }
  return Response.redirect(
    new URL(`/share?${params.toString()}`, self.location.origin).href,
    303
  );
}

async function snapshotFirst(request) {
  const key = scopedKey(request.url);
  try {
    // today's tasks come from the server on every request; the snapshot is
    // read only when the network is gone
    const response = await fetch(request, { cache: "no-store" });
    if (response.ok && key) {
      const body = await response.clone().text();
      await putSnapshot(key, body, response.headers.get("content-type"));
      const cacheName = privateCacheName("api");
      const cache = await caches.open(cacheName);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    if (!key) return offlineJson([], "OFFLINE_SCOPE_REQUIRED", 503);
    const snapshot = await getSnapshot(key);
    if (snapshot) {
      return new Response(snapshot.body, {
        headers: {
          "content-type": snapshot.contentType || "application/json",
          "x-needt-offline": "true",
        },
      });
    }
    const cacheName = privateCacheName("api");
    const cache = await caches.open(cacheName);
    return (
      (await cache.match(request)) ||
      new Response("[]", {
        status: 200,
        headers: {
          "content-type": "application/json",
          "x-needt-offline": "true",
          "x-needt-offline-code": "OFFLINE_EMPTY",
        },
      })
    );
  }
}

async function queueWhenOffline(request) {
  const headers = new Headers(request.headers);
  const idempotencyKey =
    headers.get("x-idempotency-key") || crypto.randomUUID();
  headers.set("x-idempotency-key", idempotencyKey);
  if (activeScope) {
    headers.set("x-needt-offline-scope", activeScope.key);
    if (!headers.has("x-workspace-id")) {
      headers.set("x-workspace-id", activeScope.workspaceId);
    }
  }
  const scopedRequest = new Request(request, { headers });
  try {
    return await fetch(scopedRequest.clone());
  } catch {
    if (!activeScope) {
      return offlineJson(
        { queued: false, offline: true },
        "OFFLINE_SCOPE_REQUIRED",
        503
      );
    }
    const body = await scopedRequest.clone().text();
    const parsedBody = parseJson(body);
    await enqueue({
      id: `${activeScope.key}:${idempotencyKey}`,
      scopeKey: activeScope.key,
      userId: activeScope.userId,
      workspaceId: activeScope.workspaceId,
      schemaVersion: activeScope.schemaVersion,
      idempotencyKey,
      baseRevision:
        headers.get("if-match") ||
        parsedBody?.baseRevision ||
        parsedBody?.revision ||
        null,
      url: scopedRequest.url,
      method: scopedRequest.method,
      headers: Array.from(headers.entries()),
      body,
      status: "pending",
      attempts: 0,
      createdAt: Date.now(),
    });
    await self.registration.sync
      ?.register("needt-sync-queue")
      .catch(() => undefined);
    await broadcastQueueState().catch(() => undefined);
    return offlineJson(
      { queued: true, offline: true, idempotencyKey },
      "SAVED_LOCALLY",
      202
    );
  }
}

// The scope lives in memory and is gone after the browser evicts the worker;
// the identity saved with it in IndexedDB brings it back so a sync still runs.
async function restoreActiveScope() {
  if (activeScope) return activeScope;
  const db = await openDb();
  const identity = await getItem(db, STORE_META, "activeIdentity");
  const restored = identity
    ? normalizeScope({ ...identity, schemaVersion: OFFLINE_SCHEMA_VERSION })
    : null;
  if (restored && !activeScope) activeScope = restored;
  return activeScope;
}

async function flushQueue() {
  await restoreActiveScope();
  if (!activeScope) return;
  const db = await openDb();
  const allItems = await getAll(db, STORE_QUEUE);
  const items = allItems
    .filter(
      (item) =>
        item.scopeKey === activeScope.key &&
        ["pending", "retry", "syncing", "sign_in_required"].includes(
          item.status
        )
    )
    .sort((a, b) => a.createdAt - b.createdAt);
  for (const item of items) {
    await updateQueueItem(db, item, { status: "syncing" });
    await broadcastQueueState();
    try {
      const response = await fetch(item.url, {
        method: item.method,
        headers: item.headers,
        body: item.body || undefined,
      });
      if (response.status >= 200 && response.status < 300) {
        await deleteItem(db, STORE_QUEUE, item.id);
        continue;
      }
      const responseBody =
        response.status === 409
          ? parseJson(await response.clone().text())
          : null;
      const status =
        response.status === 401
          ? "sign_in_required"
          : response.status === 403
            ? "forbidden"
            : response.status === 409
              ? responseBody?.error === "OFFLINE_REPLAY_PENDING"
                ? "retry"
                : "conflict"
              : response.status >= 500
                ? "retry"
                : "rejected";
      await updateQueueItem(db, item, {
        status,
        lastHttpStatus: response.status,
        attempts: item.attempts + 1,
      });
      break;
    } catch {
      await updateQueueItem(db, item, {
        status: "retry",
        attempts: item.attempts + 1,
      });
      break;
    }
  }
  await broadcastQueueState();
}

async function updateQueueItem(db, item, patch) {
  await putItem(db, STORE_QUEUE, { ...item, ...patch, updatedAt: Date.now() });
}

async function clearOfflineData() {
  activeScope = null;
  const keys = await caches.keys();
  await Promise.all(
    keys
      .filter((key) => key.startsWith(PRIVATE_CACHE_PREFIX))
      .map((key) => caches.delete(key))
  );
  const db = await openDb();
  await clearStore(db, STORE_QUEUE);
  await clearStore(db, STORE_SNAPSHOTS);
  await clearStore(db, STORE_META);
  // Sign-out clears every scope, so this reset applies to all tabs.
  await broadcast({
    type: "NEEDT_OFFLINE_STATE",
    scopeKey: null,
    state: "idle",
    count: 0,
  });
}

async function broadcastQueueState() {
  if (!activeScope) return;
  const db = await openDb();
  const items = (await getAll(db, STORE_QUEUE)).filter(
    (item) => item.scopeKey === activeScope.key
  );
  const priority = [
    "conflict",
    "sign_in_required",
    "forbidden",
    "rejected",
    "retry",
    "syncing",
    "pending",
  ];
  const state = priority.find((value) =>
    items.some((item) => item.status === value)
  );
  // The count belongs to one workspace scope. Every tab receives the
  // broadcast, so it names the scope: a tab open on another workspace must
  // ignore it instead of showing this workspace's queue as its own.
  await broadcast({
    type: "NEEDT_OFFLINE_STATE",
    scopeKey: activeScope.key,
    state: state || "idle",
    count: items.length,
  });
}

async function broadcast(message) {
  const clients = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  clients.forEach((client) => client.postMessage(message));
}

function offlineJson(value, code, status) {
  return new Response(JSON.stringify({ ...value, code }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function putSnapshot(key, body, contentType) {
  const db = await openDb();
  await putItem(db, STORE_SNAPSHOTS, {
    key,
    body,
    contentType: contentType || "application/json",
    updatedAt: Date.now(),
  });
}

async function getSnapshot(key) {
  const db = await openDb();
  return getItem(db, STORE_SNAPSHOTS, key);
}

async function enqueue(item) {
  const db = await openDb();
  return putItem(db, STORE_QUEUE, item);
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const store of [STORE_QUEUE, STORE_SNAPSHOTS, STORE_META]) {
        if (db.objectStoreNames.contains(store)) db.deleteObjectStore(store);
      }
      db.createObjectStore(STORE_QUEUE, { keyPath: "id" });
      db.createObjectStore(STORE_SNAPSHOTS, { keyPath: "key" });
      db.createObjectStore(STORE_META, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function putItem(db, store, value) {
  return tx(db, store, "readwrite", (objectStore) => objectStore.put(value));
}

function getItem(db, store, key) {
  return tx(db, store, "readonly", (objectStore) => objectStore.get(key));
}

function getAll(db, store) {
  return tx(db, store, "readonly", (objectStore) => objectStore.getAll());
}

function deleteItem(db, store, key) {
  return tx(db, store, "readwrite", (objectStore) => objectStore.delete(key));
}

function clearStore(db, store) {
  return tx(db, store, "readwrite", (objectStore) => objectStore.clear());
}

function tx(db, store, mode, operation) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store, mode);
    const request = operation(transaction.objectStore(store));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
