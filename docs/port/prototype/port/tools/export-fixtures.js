#!/usr/bin/env node
/* export-fixtures.js — the prototype's demo seed, exported as JSON per synced collection.
 *
 *   node port/tools/export-fixtures.js [baseUrl]
 *     baseUrl  default http://localhost:8766/needt-app/   (serve /home/claude/nb2:
 *              cd /home/claude/nb2 && python3 -m http.server 8766)
 *   env PLAYWRIGHT (path to the playwright package, default /home/claude/nb/node_modules/playwright)
 *       CHROMIUM   (executable, default /opt/pw-browsers/chromium)
 *
 * What it does: opens app-dev.html?ui=desktop (the source entry; nothing is built), runs
 * Settings → Reset prototype data (needtSync.resetAll()), reloads, and reads every key of
 * NEEDT.schema through needtSync. Seeds that a store keeps in memory until the first write
 * (projects, habits, mail, events, templates, connections, links…) are read from that store —
 * the same rows it would write. Then writes port/fixtures/<collection>.json and
 * port/fixtures/index.json (key → file, table, kind, row count, where the rows came from).
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { chromium } = require(process.env.PLAYWRIGHT || "/home/claude/nb/node_modules/playwright");

const BASE = process.argv[2] || "http://localhost:8766/needt-app/";
const OUT = path.resolve(__dirname, "..", "fixtures");

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || "/opt/pw-browsers/chromium" });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const boot = async () => {
    await page.waitForFunction(() => window.needtApp && window.NEEDT && window.needtSync, null, { timeout: 90000 });
    await page.evaluate(() => window.needtApp.ready);
    await page.waitForTimeout(2500);
  };
  await page.goto(BASE + "app-dev.html?ui=desktop");
  await boot();
  await page.evaluate(() => window.needtSync.resetAll());
  await page.reload();
  await boot();

  const dump = await page.evaluate(() => {
    const S = window.needtSync, W = window;
    const clone = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));
    const from = {};
    const val = (key, fallback, label) => {
      const v = S.get(key);
      if (v != null) { from[key] = "needtSync"; return clone(v); }
      from[key] = label || "store";
      try { return clone(fallback()); } catch (e) { from[key] = "unavailable: " + e.message; return null; }
    };
    /* eslint-disable no-undef */
    const g = (name) => { try { return eval(name); } catch (e) { return undefined; } }; // top-level consts (C2_EVENTS…)
    const out = {
      "needt.tasks": val("needt.tasks", () => W.NEEDT.tasks, "NEEDT.tasks"),
      "needt.projects.all": val("needt.projects.all", () => W.projectStore.get().list, "projectStore"),
      "needt.projects.sort": val("needt.projects.sort", () => W.projectStore.get().sort, "projectStore"),
      "needt.docs": val("needt.docs", () => W.docStore.get(), "docStore"),
      "needt.templates": val("needt.templates", () => W.plTplStore.get().mine, "plTplStore.mine"),
      "needt.habits": val("needt.habits", () => W.habitApi.all(), "habitApi"),
      "needt.habitCheckins": val("needt.habitCheckins", () => W.habitApi.checkins(), "habitApi"),
      /* user events (empty seed) + the synced seed C2_EVENTS the calendar draws beside them */
      "needt.events": (() => { const own = clone(S.get("needt.events") || W.c2Store.get()); from["needt.events"] = "c2Store + C2_EVENTS (synced seed)"; return (clone(g("C2_EVENTS")) || []).concat(own || []); })(),
      "needt.events.titles": val("needt.events.titles", () => ({}), "empty"),
      "needt.mail.threads": val("needt.mail.threads", () => W.mailThreadStore.get(), "mailThreadStore"),
      "needt.boards": val("needt.boards", () => W.boardStore.get().boards, "boardStore"),
      "needt.boardItems": val("needt.boardItems", () => W.boardStore.get().items, "boardStore"),
      "needt.boardMembers": val("needt.boardMembers", () => W.boardStore.get().members, "boardStore"),
      "needt.chats": val("needt.chats", () => [], "empty"),
      "needt.settings": (() => { from["needt.settings"] = "needtSettings.get() (defaults + stored)"; return clone(W.needtSettings.get()); })(),
      "needt.theme": val("needt.theme", () => W.needtSettings.get("theme"), "needtSettings"),
      "needt.accent": val("needt.accent", () => W.needtSettings.get("accent"), "needtSettings"),
      "needt.connections": val("needt.connections", () => W.connections.get(), "connections"),
      "needt.connections.sync": val("needt.connections.sync", () => ({}), "empty"),
      "needt.mcpLinks": val("needt.mcpLinks", () => W.mcpLinks.list(), "mcpLinks"),
      "needt.apiLinks": val("needt.apiLinks", () => W.apiLinks.list(), "apiLinks"),
      "needt.plan.state": val("needt.plan.state", () => (W.needtPlan && W.needtPlan.get ? W.needtPlan.get() : "free"), "needtPlan"),
      "needt.sidebar.v2": val("needt.sidebar.v2", () => W.skStore.get(), "skStore"),
      "needt.docsSort": val("needt.docsSort", () => null, "unset"),
      "needt.mbSort": val("needt.mbSort", () => null, "unset"),
      "needt.docShare": val("needt.docShare", () => null, "unset"),
      "needt.focus.log": val("needt.focus.log", () => [], "empty")
    };
    const schema = {};
    Object.keys(W.NEEDT.schema).forEach((k) => { const d = W.NEEDT.schema[k]; schema[k] = { kind: d.kind, table: d.table || null, local: !!d.local, raw: !!d.raw, note: d.note || null }; });
    /* reference data the port needs beside the rows (not synced) */
    const ref = {
      templatesBuiltin: clone(W.plTplStore.get().builtin),
      people: clone(W.NEEDT.people),
      stages: clone(W.NEEDT.stages),
      calendars: clone(W.NEEDT.calendars),
      settingsDefaults: clone(W.needtSettings.defaults),
      calSyncDefaults: clone(W.CN_CAL_SYNC || null),
      accents: clone(W.NEEDT_ACCENTS || null),
      themes: clone(W.THEMES || null),
      today: W.NEEDT.iso(W.NEEDT.today)
    };
    return { out, from, schema, ref };
  });

  fs.mkdirSync(OUT, { recursive: true });
  const index = { generated: new Date().toISOString(), source: BASE + "app-dev.html?ui=desktop after needtSync.resetAll()", today: dump.ref.today, collections: {} };
  for (const [key, value] of Object.entries(dump.out)) {
    const file = key.replace(/^needt\./, "").replace(/\./g, "-") + ".json";
    fs.writeFileSync(path.join(OUT, file), JSON.stringify(value, null, 2) + "\n");
    const s = dump.schema[key] || {};
    index.collections[key] = { file, table: s.table || null, kind: s.kind || null, rows: Array.isArray(value) ? value.length : value && typeof value === "object" ? Object.keys(value).length : value == null ? 0 : 1, from: dump.from[key] };
  }
  fs.writeFileSync(path.join(OUT, "_reference.json"), JSON.stringify(dump.ref, null, 2) + "\n");
  fs.writeFileSync(path.join(OUT, "index.json"), JSON.stringify(index, null, 2) + "\n");
  console.log(JSON.stringify(Object.fromEntries(Object.entries(index.collections).map(([k, v]) => [k, v.rows + " · " + v.from])), null, 1));
  if (errors.length) { console.log("page errors:", errors); process.exitCode = 1; }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
