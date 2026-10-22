import assert from "node:assert/strict";
import { test } from "node:test";

import { parseQuickAdd } from "../src/lib/quick-add.js";

// Wednesday 21 October 2026, 10:00 local.
const now = new Date(2026, 9, 21, 10, 0);

test("plain title stays as is", () => {
  const r = parseQuickAdd("Write the brief", now);
  assert.equal(r.title, "Write the brief");
  assert.equal(r.chips.length, 0);
});

test("date, duration, project and priority are lifted out", () => {
  const r = parseQuickAdd("write brief tomorrow 2h #work !high", now);
  assert.equal(r.title, "write brief");
  assert.equal(r.estimatedMinutes, 120);
  assert.equal(r.project, "work");
  assert.equal(r.priorityLevel, "HIGH");
  assert.equal(new Date(r.deadline).getDate(), 22);
});

test("Russian words and units", () => {
  const r = parseQuickAdd("позвонить маме завтра 30м", now);
  assert.equal(r.title, "позвонить маме");
  assert.equal(r.estimatedMinutes, 30);
  assert.equal(new Date(r.deadline).getDate(), 22);
  assert.equal(parseQuickAdd("отчёт 1ч30м", now).estimatedMinutes, 90);
});

test("weekday means the next one, never today", () => {
  assert.equal(new Date(parseQuickAdd("call wed", now).deadline).getDate(), 28);
  assert.equal(new Date(parseQuickAdd("call on fri", now).deadline).getDate(), 23);
  assert.equal(parseQuickAdd("call on fri", now).title, "call");
  assert.equal(new Date(parseQuickAdd("отчёт в пятницу", now).deadline).getDate(), 23);
});

test("next week and decimals", () => {
  assert.equal(new Date(parseQuickAdd("plan next week", now).deadline).getDate(), 28);
  assert.equal(parseQuickAdd("read 1.5h", now).estimatedMinutes, 90);
});

test("only the first of each kind is taken", () => {
  const r = parseQuickAdd("a #one #two !low !high", now);
  assert.equal(r.project, "one");
  assert.equal(r.priorityLevel, "LOW");
  assert.equal(r.title, "a #two !high");
});
