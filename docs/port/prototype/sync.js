/* sync.js — window.needtSync, the one persistence adapter (09.10.26).

   Every store persists through here: get(key) / set(key, value, {origin}) (→ false when storage is full) /
   subscribe(key, fn). Today the bytes still live in localStorage under the
   same keys and in the same shape as before, so nothing that reads storage
   breaks; what is new is that a write is diffed into record-level changes,
   stamped, queued in an outbox and pushed through a pluggable transport —
   and changes that arrive from elsewhere are merged (last write wins, per
   record) and handed to the stores, which re-render.

   KEYS. needtSync.register(key, def) says how a key syncs (Data.js registers
   the schema, NEEDT.schema):
     kind "collection"  an array of records; idOf(record) names a record
                        (default r.id). Changes are per record.
     kind "map"         a plain object; each field is a record (settings,
                        connection states, event title overrides).
     kind "value"       one value, last write wins as a whole (a sort, a plan).
     local: true        persisted here but never sent (window state: the open
                        doc, a panel, a tab).
     raw: true          stored as a bare string, not JSON ("needt.theme").
   A key nobody registered is persisted and observable but never sent.

   RECORD METADATA. Kept beside the data, never inside it (the stored shape
   is unchanged): "needt.sync.meta.<key>" = { recs: { <id>: [updatedAt ms,
   rev, by, deletedAt ms | 0] }, at, rev, by, orderAt }. A removed record
   keeps its stamp as a tombstone (deletedAt) for 30 days, so a late put from
   an older edit cannot bring it back. collection(key).meta(id) returns
   { id, updatedAt, deletedAt, rev, by } as ISO strings.

   CHANGE. { key, op: "put" | "del" | "order" | "set" | "remove", id, value,
   ids (order), at (ms), rev, by (device:tab) }.

   CONFLICT RULE. A change wins over what a record already has when its `at`
   is later; same `at` → higher `rev`; same rev → the larger `by` string.
   Ties are therefore decided the same way on every device. Fields are not
   merged inside a record (a record is the unit); maps are merged per field.
   Order of a collection is its own record ("order", stamped orderAt): ids the
   winning order does not name keep their place at the end.

   TRANSPORT. { name, durable, pull(since) → Promise<{changes, cursor}>,
   push(changes) → Promise<{cursor}>, onRemote(fn(changes)) → unsubscribe,
   start?(), stop?() }. needtSync.setTransport(t) swaps it. The default is
   LocalTransport: storage is shared by every tab of this origin, so push
   broadcasts the changes (BroadcastChannel "needt-sync"; "storage" events
   when there is no channel) and other tabs merge them live. RemoteTransport
   is the future backend's stub (contract in PORT.md "One program").

   OUTBOX. Local changes queue in order; flush() (a microtask after every
   write) hands the whole queue to transport.push and drops it once the push
   resolves; a failed push keeps it and retries with backoff (1 s → 30 s).
   A durable transport's outbox is kept in "needt.sync.outbox" so a reload
   offline loses nothing.

   EVERY WRITER calls needtSync (09.10.26): nothing writes a needt.* key in
   localStorage directly any more, so the old Storage.setItem shim is gone.
   A write that bypassed this file would not be stamped, sent or seen by
   subscribers (and would leave this file's cache stale). */
(function () {
  "use strict";
  if (window.needtSync) return;

  var ls = null;
  try { ls = window.localStorage; ls.getItem("needt.sync.probe"); } catch (e) { ls = null; }
  var memory = {};
  function lsGet(k) { if (!ls) return Object.prototype.hasOwnProperty.call(memory, k) ? memory[k] : null; try { return ls.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { if (!ls) { memory[k] = String(v); return true; } try { ls.setItem(k, v); return true; } catch (e) { return false; } }
  function lsRemove(k) { if (!ls) { delete memory[k]; return; } try { ls.removeItem(k); } catch (e) { /* no storage */ } }

  var rid = function (n) { var s = "", a = "abcdefghijkmnpqrstuvwxyz23456789"; for (var i = 0; i < n; i++) s += a[Math.floor(Math.random() * a.length)]; return s; };
  var DEVICE = lsGet("needt.sync.device");
  if (!DEVICE) { DEVICE = "d" + rid(10); lsSet("needt.sync.device", DEVICE); }
  var TAB = "t" + rid(6);
  var BY = DEVICE + ":" + TAB;
  var lastAt = 0;
  function stamp() { var n = Date.now(); lastAt = n > lastAt ? n : lastAt + 1; return lastAt; }
  var TOMB_MS = 30 * 86400000;

  /* ---- registry ---- */
  var registry = {}, prefixes = [];
  function register(key, def) {
    def = Object.assign({ kind: "value" }, def || {});
    if (key.charAt(key.length - 1) === "*") prefixes.push([key.slice(0, -1), def]);
    else { registry[key] = def; entry(key); /* snapshot now: storage is shared by tabs, so "before" must be taken before another tab writes */ }
    return def;
  }
  function defOf(key) {
    if (registry[key]) return registry[key];
    for (var i = 0; i < prefixes.length; i++) if (key.indexOf(prefixes[i][0]) === 0) return prefixes[i][1];
    return null;
  }
  var synced = function (key) { var d = defOf(key); return !!(d && !d.local); };
  var idOf = function (def, r) { return String(def.idOf ? def.idOf(r) : r && r.id); };

  /* ---- cache: key → { raw, value, recs (id → JSON) } ---- */
  var cache = {};
  function parse(raw) { if (raw == null) return null; try { return JSON.parse(raw); } catch (e) { return raw; } }
  function entry(key) {
    var c = cache[key];
    if (c) return c;
    var raw = lsGet(key);
    c = cache[key] = { raw: raw, value: parse(raw), recs: null };
    return c;
  }
  function recsOf(def, value) {
    var m = {};
    if (def.kind === "collection" && Array.isArray(value)) value.forEach(function (r) { m[idOf(def, r)] = JSON.stringify(r); });
    else if (def.kind === "map" && value && typeof value === "object") Object.keys(value).forEach(function (k) { m[k] = JSON.stringify(value[k]); });
    return m;
  }
  function recsFor(key, def) { var c = entry(key); if (!c.recs) c.recs = recsOf(def, c.value); return c.recs; }
  function orderOf(def, value) { return Array.isArray(value) ? value.map(function (r) { return idOf(def, r); }) : []; }
  function encode(key, value, opts) {
    var d = defOf(key);
    if (value == null) return null;
    if ((opts && opts.raw) || (d && d.raw)) return String(value);
    return JSON.stringify(value);
  }

  /* ---- metadata ---- */
  var metas = {};
  function metaOf(key) {
    if (metas[key]) return metas[key];
    var m = parse(lsGet("needt.sync.meta." + key));
    m = m && typeof m === "object" ? m : {};
    if (!m.recs) m.recs = {};
    return (metas[key] = m);
  }
  function metaSave(key) {
    var m = metaOf(key), now = Date.now();
    Object.keys(m.recs).forEach(function (id) { var r = m.recs[id]; if (r[3] && now - r[3] > TOMB_MS) delete m.recs[id]; });
    lsSet("needt.sync.meta." + key, JSON.stringify(m));
  }
  /* The conflict rule. "Same" counts as a win: the very same change can
     already be in the metadata (tabs share storage, and a retried push
     arrives twice) and applying it again is a no-op on the data. */
  function newer(c, m) {
    if (!m) return true;
    if (c.at !== m[0]) return c.at > m[0];
    if ((c.rev || 0) !== (m[1] || 0)) return (c.rev || 0) > (m[1] || 0);
    return String(c.by) >= String(m[2]);
  }

  /* ---- subscribers ---- */
  var subs = {};
  function subscribe(key, fn) {
    (subs[key] = subs[key] || []).push(fn);
    return function () { subs[key] = (subs[key] || []).filter(function (f) { return f !== fn; }); };
  }
  function notify(key, value, info) {
    info.key = key;
    (subs[key] || []).concat(subs["*"] || []).forEach(function (f) {
      try { f(value, info); } catch (e) { console.error("needtSync subscriber (" + key + ")", e); }
    });
  }

  /* ---- local writes → changes ---- */
  /* c.recs holds the previous value's records (commit fills it before the
     value changes). */
  function diff(key, def, prevValue, nextValue) {
    var at = stamp(), out = [], m = metaOf(key);
    var bump = function (id, op, value) {
      var old = m.recs[id], rev = (old ? old[1] || 0 : 0) + 1;
      m.recs[id] = [at, rev, BY, op === "del" ? at : 0];
      out.push({ key: key, op: op, id: id, value: value, at: at, rev: rev, by: BY });
    };
    if (def.kind === "collection" && Array.isArray(nextValue)) {
      var before = recsFor(key, def), after = recsOf(def, nextValue), seen = {};
      nextValue.forEach(function (r) { var id = idOf(def, r); seen[id] = 1; if (before[id] !== after[id]) bump(id, "put", r); });
      Object.keys(before).forEach(function (id) { if (!seen[id]) bump(id, "del"); });
      var a = orderOf(def, prevValue), b = orderOf(def, nextValue);
      if (a.join("\u0001") !== b.join("\u0001")) { m.orderAt = at; m.orderBy = BY; out.push({ key: key, op: "order", ids: b, at: at, rev: 0, by: BY }); }
      cache[key].recs = after;
    } else if (def.kind === "map" && nextValue && typeof nextValue === "object" && !Array.isArray(nextValue)) {
      var mb = recsFor(key, def), ma = recsOf(def, nextValue);
      Object.keys(ma).forEach(function (f) { if (mb[f] !== ma[f]) bump(f, "put", nextValue[f]); });
      Object.keys(mb).forEach(function (f) { if (!(f in ma)) bump(f, "del"); });
      cache[key].recs = ma;
    } else {
      var rev = (m.rev || 0) + 1;
      m.at = at; m.rev = rev; m.by = BY;
      out.push({ key: key, op: nextValue == null ? "remove" : "set", value: cache[key].raw, at: at, rev: rev, by: BY });
      cache[key].recs = null;
    }
    metaSave(key);
    return out;
  }
  /* raw is already in storage (or about to be): update cache, stamp, queue, tell. */
  function commit(key, raw, origin, source) {
    var c = entry(key);
    if (c.raw === raw) return false;
    var prev = c.value, def = defOf(key);
    if (def && def.kind !== "value" && !c.recs) c.recs = recsOf(def, prev);
    c.raw = raw; c.value = parse(raw);
    if (!def || def.kind === "value") c.recs = null;
    var changes = def && !def.local ? diff(key, def, prev, c.value) : [];
    if (changes.length) enqueue(changes);
    notify(key, c.value, { origin: origin || "local", source: source || null, changes: changes });
    return true;
  }

  function get(key, fallback) { var v = entry(key).value; return v == null ? (fallback === undefined ? null : fallback) : v; }
  function getRaw(key) { return entry(key).raw; }
  function set(key, value, opts) {
    opts = opts || {};
    var raw = encode(key, value, opts);
    if (entry(key).raw === raw) return true;
    if (raw == null) { lsRemove(key); commit(key, null, opts.origin, opts.source); return true; }
    if (!lsSet(key, raw)) { notify(key, entry(key).value, { origin: "error", error: "quota", source: opts.source || null, changes: [] }); return false; }
    commit(key, raw, opts.origin, opts.source);
    return true;
  }
  function update(key, fn, opts) { return set(key, fn(get(key)), opts); }
  function remove(key, opts) { return set(key, null, opts); }

  /* ---- remote changes → merge ---- */
  function applyRemote(changes) {
    var byKey = {};
    (changes || []).forEach(function (c) { if (c && c.key && synced(c.key)) (byKey[c.key] = byKey[c.key] || []).push(c); });
    Object.keys(byKey).forEach(function (key) {
      var def = defOf(key), m = metaOf(key), c = entry(key), list = byKey[key], value = c.value, touched = false, won = [];
      /* The whole key went away (a reset): last write wins at key level. */
      var gone = list.filter(function (ch) { return ch.op === "remove"; }).pop();
      if (gone && def.kind !== "value") {
        list = list.filter(function (ch) { return ch.op !== "remove"; });
        if (newer(gone, m.at ? [m.at, m.rev, m.by] : null)) { m.at = gone.at; m.rev = gone.rev; m.by = gone.by; value = null; touched = true; won.push(gone); }
      }
      if (gone && touched) { /* removed: nothing to merge into */ }
      else if (def.kind === "collection") {
        var arr = Array.isArray(value) ? value.slice() : [];
        var at = {}; arr.forEach(function (r, i) { at[idOf(def, r)] = i; });
        var order = null;
        list.forEach(function (ch) {
          if (ch.op === "order") { if (!m.orderAt || ch.at > m.orderAt || (ch.at === m.orderAt && String(ch.by) >= String(m.orderBy || ""))) { m.orderAt = ch.at; m.orderBy = ch.by; order = ch.ids; won.push(ch); } return; }
          if (!newer(ch, m.recs[ch.id])) return;
          m.recs[ch.id] = [ch.at, ch.rev || 0, ch.by, ch.op === "del" ? ch.at : 0];
          touched = true; won.push(ch);
          if (ch.op === "del") { if (ch.id in at) { arr[at[ch.id]] = undefined; } }
          else if (ch.id in at && arr[at[ch.id]] !== undefined) arr[at[ch.id]] = ch.value;
          else { at[ch.id] = arr.length; arr.push(ch.value); }
        });
        arr = arr.filter(function (r) { return r !== undefined; });
        if (order) {
          var byId = {}; arr.forEach(function (r) { byId[idOf(def, r)] = r; });
          var named = {}, next = [];
          order.forEach(function (id) { if (byId[id] && !named[id]) { named[id] = 1; next.push(byId[id]); } });
          arr.forEach(function (r) { if (!named[idOf(def, r)]) next.push(r); });
          if (next.map(function (r) { return idOf(def, r); }).join("\u0001") !== arr.map(function (r) { return idOf(def, r); }).join("\u0001")) touched = true;
          arr = next;
        }
        if (touched) value = arr;
      } else if (def.kind === "map") {
        var obj = value && typeof value === "object" && !Array.isArray(value) ? Object.assign({}, value) : {};
        list.forEach(function (ch) {
          if (!newer(ch, m.recs[ch.id])) return;
          m.recs[ch.id] = [ch.at, ch.rev || 0, ch.by, ch.op === "del" ? ch.at : 0];
          touched = true; won.push(ch);
          if (ch.op === "del") delete obj[ch.id]; else obj[ch.id] = ch.value;
        });
        if (touched) value = obj;
      } else {
        list.forEach(function (ch) {
          if (!newer(ch, m.at ? [m.at, m.rev, m.by] : null)) return;
          m.at = ch.at; m.rev = ch.rev; m.by = ch.by; touched = true; won.push(ch);
          value = ch.op === "remove" ? null : parse(ch.value);
          c.pendingRaw = ch.op === "remove" ? null : ch.value;
        });
      }
      metaSave(key);
      var raw = !touched ? c.raw : def.kind === "value" ? c.pendingRaw : (value == null ? null : JSON.stringify(value));
      delete c.pendingRaw;
      /* Tabs share storage: the sender's whole-key write may lack an edit of
         ours that won here — put the merged value back. */
      if (lsGet(key) !== raw) { if (raw == null) lsRemove(key); else lsSet(key, raw); }
      if (!touched || raw === c.raw) return;
      c.raw = raw; c.value = parse(raw); c.recs = def.kind === "value" ? null : recsOf(def, c.value);
      notify(key, c.value, { origin: "remote", source: null, changes: won });
    });
  }

  /* ---- outbox + transport ---- */
  var outbox = [], transport = null, offRemote = null, flushing = false, scheduled = false, backoff = 0, retryTimer = 0, lastError = null, cursor = null;
  function outboxSave() { if (transport && transport.durable) lsSet("needt.sync.outbox", JSON.stringify(outbox)); }
  function enqueue(changes) {
    Array.prototype.push.apply(outbox, changes);
    outboxSave();
    if (!scheduled) { scheduled = true; Promise.resolve().then(function () { scheduled = false; flush(); }); }
  }
  function flush() {
    if (flushing || !transport || !outbox.length) return Promise.resolve();
    flushing = true;
    var batch = outbox.slice();
    return Promise.resolve().then(function () { return transport.push(batch); }).then(function (r) {
      outbox.splice(0, batch.length); outboxSave();
      if (r && r.cursor != null) cursor = r.cursor;
      backoff = 0; lastError = null; flushing = false;
      if (outbox.length) return flush();
    }, function (err) {
      flushing = false; lastError = String((err && err.message) || err);
      backoff = Math.min(30000, backoff ? backoff * 2 : 1000);
      clearTimeout(retryTimer); retryTimer = setTimeout(flush, backoff);
    });
  }
  function setTransport(t) {
    if (offRemote) { try { offRemote(); } catch (e) { /* gone */ } offRemote = null; }
    if (transport && transport.stop) try { transport.stop(); } catch (e) { /* gone */ }
    transport = t;
    if (!t) return;
    if (t.durable) { var saved = parse(lsGet("needt.sync.outbox")); if (Array.isArray(saved) && saved.length) outbox = saved.concat(outbox); }
    offRemote = t.onRemote(function (changes) { applyRemote(changes); });
    if (t.start) t.start();
    Promise.resolve().then(function () { return t.pull ? t.pull(cursor) : null; }).then(function (r) {
      if (r && r.changes && r.changes.length) applyRemote(r.changes);
      if (r && r.cursor != null) cursor = r.cursor;
      flush();
    }, function (err) { lastError = String((err && err.message) || err); });
  }

  /* LocalTransport — every tab of this origin shares localStorage, so the
     data is already "there"; what travels is the change list, so the other
     tab can merge it into its live stores without a reload. */
  function LocalTransport() {
    var fns = [], bc = null, onStorage = null;
    try { bc = typeof BroadcastChannel === "function" ? new BroadcastChannel("needt-sync") : null; } catch (e) { bc = null; }
    var deliver = function (changes) { fns.forEach(function (f) { f(changes); }); };
    if (bc) bc.onmessage = function (e) { var d = e.data; if (d && d.type === "changes" && d.from !== BY) deliver(d.changes || []); };
    else {
      /* No channel: the storage event says which key changed in another tab;
         its new value is diffed into record changes, stamped from the writer's saved metadata. */
      onStorage = function (e) {
        if (!e.key || !synced(e.key) || e.storageArea !== ls) return;
        var def = defOf(e.key), c = entry(e.key);
        if (e.newValue === c.raw) return;
        /* Stamps come from the shared metadata the writer saved with the
           value; a record it has no stamp for was never edited (a seed) and
           loses to any stamped edit. */
        var value = parse(e.newValue), sm = parse(lsGet("needt.sync.meta." + e.key)) || {};
        var st = function (id, op) { var r = sm.recs && sm.recs[id]; return { key: e.key, op: op, id: id, at: r ? r[0] : 0, rev: r ? r[1] : 0, by: r ? r[2] : "" }; };
        if (def.kind === "value") { deliver([{ key: e.key, op: e.newValue == null ? "remove" : "set", value: e.newValue, at: sm.at || 0, rev: sm.rev || 0, by: sm.by || "" }]); return; }
        var before = recsFor(e.key, def), after = recsOf(def, value), out = [];
        Object.keys(after).forEach(function (id) { if (before[id] !== after[id]) out.push(Object.assign(st(id, "put"), { value: JSON.parse(after[id]) })); });
        Object.keys(before).forEach(function (id) { if (!(id in after)) out.push(st(id, "del")); });
        if (def.kind === "collection") out.push({ key: e.key, op: "order", ids: orderOf(def, value), at: sm.orderAt || 0, rev: 0, by: sm.orderBy || "" });
        deliver(out);
      };
      window.addEventListener("storage", onStorage);
    }
    return {
      name: "local", durable: false,
      pull: function () { return Promise.resolve({ changes: [], cursor: null }); },
      push: function (changes) { if (bc) bc.postMessage({ type: "changes", from: BY, changes: changes }); return Promise.resolve({ cursor: null }); },
      onRemote: function (fn) { fns.push(fn); return function () { fns = fns.filter(function (f) { return f !== fn; }); }; },
      stop: function () { if (bc) bc.close(); if (onStorage) window.removeEventListener("storage", onStorage); }
    };
  }

  /* RemoteTransport — the backend's stub. Contract: PORT.md "One program" §
     Sync. Not used until a server exists; every method says what it will do. */
  function RemoteTransport(opts) {
    opts = opts || {};
    var base = opts.baseUrl || "https://api.needt.app/v1", fns = [], ws = null;
    var headers = function () { return { "Content-Type": "application/json", Authorization: "Bearer " + (opts.token ? opts.token() : "") }; };
    return {
      name: "remote", durable: true,
      /* TODO(backend): GET {base}/sync?since=<cursor> → { changes: Change[], cursor }.
         First sign-in on a device: since=null returns every live record. */
      pull: function (since) {
        return fetch(base + "/sync" + (since != null ? "?since=" + encodeURIComponent(since) : ""), { headers: headers() })
          .then(function (r) { if (!r.ok) throw new Error("pull " + r.status); return r.json(); });
      },
      /* TODO(backend): POST {base}/sync { device, changes } → { cursor, rejected: [{ key, id, reason }] }.
         The server applies the same conflict rule (later at → rev → by) and
         echoes nothing back to the sender; rejected changes come back as
         corrective changes on the socket. */
      push: function (changes) {
        return fetch(base + "/sync", { method: "POST", headers: headers(), body: JSON.stringify({ device: DEVICE, changes: changes }) })
          .then(function (r) { if (!r.ok) throw new Error("push " + r.status); return r.json(); });
      },
      onRemote: function (fn) { fns.push(fn); return function () { fns = fns.filter(function (f) { return f !== fn; }); }; },
      /* TODO(backend): wss://…/sync/socket?cursor=<c> — server sends
         { type: "changes", changes, cursor } for every change made on another
         device; on reconnect the client pulls from its last cursor first. */
      start: function () {
        if (!opts.socketUrl || typeof WebSocket !== "function") return;
        ws = new WebSocket(opts.socketUrl);
        ws.onmessage = function (e) { var d = null; try { d = JSON.parse(e.data); } catch (x) { return; } if (d && d.type === "changes") fns.forEach(function (f) { f(d.changes || []); }); };
        /* TODO(backend): reconnect with backoff; pull(cursor) after reconnect. */
      },
      stop: function () { if (ws) ws.close(); ws = null; }
    };
  }

  /* Apply a collection's changes to any list of its records (no stamps, no
     storage) — for a store whose state lags its writes (React state written
     from an effect): it takes what changed, not a whole list that may miss
     its own unsaved edit. */
  function mergeInto(key, list, changes) {
    var def = defOf(key) || { kind: "collection" };
    var arr = Array.isArray(list) ? list.slice() : [];
    (changes || []).forEach(function (ch) {
      if (ch.key !== key) return;
      var i = ch.id == null ? -1 : arr.findIndex(function (r) { return idOf(def, r) === ch.id; });
      if (ch.op === "put") { if (i >= 0) arr[i] = ch.value; else arr.push(ch.value); }
      else if (ch.op === "del") { if (i >= 0) arr.splice(i, 1); }
      else if (ch.op === "order") {
        var byId = {}; arr.forEach(function (r) { byId[idOf(def, r)] = r; });
        var named = {}, next = [];
        ch.ids.forEach(function (id) { if (byId[id] && !named[id]) { named[id] = 1; next.push(byId[id]); } });
        arr.forEach(function (r) { if (!named[idOf(def, r)]) next.push(r); });
        arr = next;
      }
    });
    return arr;
  }

  /* ---- collections: record-level helpers over a collection key ---- */
  function collection(key) {
    var def = defOf(key) || register(key, { kind: "collection" });
    var list = function () { var v = get(key); return Array.isArray(v) ? v : []; };
    var iso = function (ms) { return ms ? new Date(ms).toISOString() : null; };
    return {
      key: key,
      list: list,
      get: function (id) { id = String(id); return list().find(function (r) { return idOf(def, r) === id; }) || null; },
      put: function (r, opts) { var id = idOf(def, r), found = false; var next = list().map(function (x) { if (idOf(def, x) === id) { found = true; return r; } return x; }); if (!found) next = next.concat([r]); set(key, next, opts); return r; },
      patch: function (id, p, opts) { id = String(id); set(key, list().map(function (x) { return idOf(def, x) === id ? Object.assign({}, x, p) : x; }), opts); },
      remove: function (id, opts) { id = String(id); set(key, list().filter(function (x) { return idOf(def, x) !== id; }), opts); },
      subscribe: function (fn) { return subscribe(key, fn); },
      meta: function (id) { var r = metaOf(key).recs[String(id)]; return r ? { id: String(id), updatedAt: iso(r[0]), rev: r[1], by: r[2], deletedAt: iso(r[3]) } : null; }
    };
  }

  /* ---- glue for makeStore-shaped stores ({get, set, sub}) ----
     The store persists through set(); a change from anywhere else (another
     tab, another store on the same key) comes back into the
     store, which re-renders. `load` maps the stored value into the store's
     shape (migrations), `save` the other way. */
  function bind(store, key, opts) {
    opts = opts || {};
    var token = {};
    var off1 = store.sub(function (s) { set(key, opts.save ? opts.save(s) : s, { source: token, origin: opts.origin || "local" }); });
    var off2 = subscribe(key, function (v, info) {
      if (info.source === token || v == null || info.origin === "error") return;
      if (opts.accept && !opts.accept(info)) return;
      store.set(opts.load ? opts.load(v) : v);
    });
    return function () { off1(); off2(); };
  }

  /* React hook: [value, set] for one key, live. */
  function use(key, fallback) {
    var R = window.React;
    var st = R.useState(function () { return get(key, fallback); });
    R.useEffect(function () { st[1](get(key, fallback)); return subscribe(key, function () { st[1](get(key, fallback)); }); }, [key]);
    return [st[0], function (v) { set(key, typeof v === "function" ? v(get(key, fallback)) : v); }];
  }

  /* Reset (Settings → Reset prototype data): every needt.* key goes, sent as
     a remove; this file's own metadata and outbox go with it. */
  function resetAll() {
    var keys = [];
    try { if (ls) for (var i = 0; i < ls.length; i++) keys.push(ls.key(i)); else keys = Object.keys(memory); } catch (e) { keys = []; }
    keys.forEach(function (k) { if (k && k.indexOf("needt.") === 0 && k.indexOf("needt.sync.") !== 0) set(k, null); });
    flush();
    keys.forEach(function (k) { if (k && k.indexOf("needt.sync.") === 0) lsRemove(k); });
    metas = {}; outbox = [];
  }

  window.needtSync = {
    get: get, getRaw: getRaw, set: set, update: update, remove: remove, subscribe: subscribe,
    collection: collection, register: register, defOf: defOf, bind: bind, use: use,
    applyRemote: applyRemote, mergeInto: mergeInto, resetAll: resetAll, flush: flush, setTransport: setTransport,
    LocalTransport: LocalTransport, RemoteTransport: RemoteTransport,
    outbox: function () { return outbox.slice(); },
    meta: function (key, id) { var m = metaOf(key); return id == null ? m : m.recs[String(id)] || null; },
    status: function () { return { transport: transport ? transport.name : null, pending: outbox.length, lastError: lastError, cursor: cursor, device: DEVICE, tab: TAB }; },
    device: DEVICE, tab: TAB
  };
  setTransport(LocalTransport());
})();
