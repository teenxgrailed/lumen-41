#!/usr/bin/env node
/* validate-fixtures.js — checks port/fixtures/*.json against the row types in port/types/needt.d.ts.
 *
 *   node port/tools/validate-fixtures.js
 *
 * 1. Generates JSON Schemas from the d.ts (ts-json-schema-generator; interfaces are closed:
 *    additionalProperties false, so an undeclared field fails) → port/types/needt.schema.json
 * 2. Validates every fixture listed in port/fixtures/index.json with ajv (strict types,
 *    allErrors) against the type its key stores (SyncKeyMap).
 * Exit code 1 when any fixture fails.
 * Needs (in /home/claude/nb2): ts-json-schema-generator@2, ajv@8.
 */
"use strict";
const fs = require("fs");
const path = require("path");

const APP = path.resolve(__dirname, "..", "..");
const NM = [APP, path.resolve(APP, ".."), path.resolve(APP, "..", "node_modules")];
const need = (m) => require(require.resolve(m, { paths: NM }));
const tsj = need("ts-json-schema-generator");
const Ajv = need("ajv");

const DTS = path.join(APP, "port", "types", "needt.d.ts");
const FIX = path.join(APP, "port", "fixtures");

/* key → [type, isArray] — mirrors SyncKeyMap in needt.d.ts */
const KEY_TYPE = {
  "needt.tasks": ["Task", true],
  "needt.projects.all": ["Project", true],
  "needt.projects.sort": ["ProjectSort", false],
  "needt.docs": ["Doc", true],
  "needt.templates": ["Template", true],
  "needt.habits": ["Habit", true],
  "needt.habitCheckins": ["HabitCheckin", true],
  "needt.events": ["CalendarEvent", true],
  "needt.events.titles": ["EventTitleOverrides", false],
  "needt.mail.threads": ["MailThread", true],
  "needt.boards": ["Board", true],
  "needt.boardItems": ["BoardItem", true],
  "needt.boardMembers": ["BoardMember", true],
  "needt.chats": ["Chat", true],
  "needt.settings": ["Settings", false],
  "needt.theme": ["ThemeSetting", false],
  "needt.accent": ["AccentId", false],
  "needt.connections": ["Connections", false],
  "needt.connections.sync": ["ConnectionSyncLabels", false],
  "needt.mcpLinks": ["AccessLink", true],
  "needt.apiLinks": ["AccessLink", true],
  "needt.plan.state": ["PlanState", false],
  "needt.sidebar.v2": ["SidebarLayout", false],
  "needt.docsSort": ["DocsSort", false],
  "needt.mbSort": ["BoardsSort", false],
  "needt.docShare": ["DocShare", false],
  "needt.focus.log": ["FocusSession", true],
};
const REF_TYPE = { templatesBuiltin: ["Template", true], people: ["Person", true], stages: ["Stage", true], settingsDefaults: ["SettingsDefaults", false], calSyncDefaults: ["CalendarSyncDef", false] };

/* ---- 1. schemas from the d.ts ---- */
const types = [...new Set(Object.values(KEY_TYPE).concat(Object.values(REF_TYPE)).map((t) => t[0]))];
const definitions = {};
for (const type of types) {
  const gen = tsj.createGenerator({ path: DTS, type, skipTypeCheck: true, expose: "export", topRef: true, jsDoc: "extended", additionalProperties: false });
  const s = gen.createSchema(type);
  Object.assign(definitions, s.definitions);
}
const schema = { $schema: "http://json-schema.org/draft-07/schema#", $comment: "GENERATED from port/types/needt.d.ts by port/tools/validate-fixtures.js — do not edit.", definitions };
fs.writeFileSync(path.join(APP, "port", "types", "needt.schema.json"), JSON.stringify(schema, null, 2) + "\n");

/* ---- 2. validate ---- */
const ajv = new Ajv({ allErrors: true, strict: false });
ajv.addSchema(schema, "needt");
const check = (type, isArray, data) => {
  const v = ajv.compile(isArray ? { type: "array", items: { $ref: "needt#/definitions/" + type } } : { $ref: "needt#/definitions/" + type });
  const ok = v(data);
  return ok ? [] : v.errors;
};
const index = JSON.parse(fs.readFileSync(path.join(FIX, "index.json"), "utf8"));
let failed = 0, checked = 0, rows = 0;
const lines = [];
const report = (label, type, isArray, data) => {
  checked++;
  if (data == null) { lines.push(`  ·  ${label} — null (unset), skipped`); return; }
  rows += Array.isArray(data) ? data.length : 1;
  const errs = check(type, isArray, data);
  if (!errs.length) { lines.push(`  ok ${label} → ${type}${isArray ? "[]" : ""} (${Array.isArray(data) ? data.length + " rows" : "1 value"})`); return; }
  failed++;
  lines.push(`  ✗  ${label} → ${type}${isArray ? "[]" : ""}: ${errs.length} error(s)`);
  for (const e of errs.slice(0, 12)) lines.push(`       ${e.instancePath || "/"} ${e.message}${e.params && e.params.additionalProperty ? " '" + e.params.additionalProperty + "'" : ""}${e.params && e.params.allowedValues ? " " + JSON.stringify(e.params.allowedValues) : ""}`);
};
for (const [key, meta] of Object.entries(index.collections)) {
  const t = KEY_TYPE[key];
  if (!t) { lines.push(`  ?  ${key} — no type mapped`); failed++; continue; }
  report(key + " (" + meta.file + ")", t[0], t[1], JSON.parse(fs.readFileSync(path.join(FIX, meta.file), "utf8")));
}
const ref = JSON.parse(fs.readFileSync(path.join(FIX, "_reference.json"), "utf8"));
for (const [k, t] of Object.entries(REF_TYPE)) report("_reference." + k, t[0], t[1], ref[k]);

console.log(`schemas: ${Object.keys(definitions).length} definitions → port/types/needt.schema.json`);
console.log(lines.join("\n"));
console.log(`\n${checked} fixtures, ${rows} rows/values checked — ${failed ? failed + " FAILED" : "all valid"}`);
process.exitCode = failed ? 1 : 0;
