import assert from "node:assert/strict";
import { test } from "node:test";

import { keepVideo, relevance, snoozeLeft } from "../src/lib/relevance.js";

test("on-goal titles score high, off-goal low", () => {
  assert.ok(relevance("Learn Swift concurrency", "Swift Concurrency in 20 minutes") >= 0.5);
  assert.equal(relevance("Learn Swift concurrency", "Top 10 celebrity drama moments"), 0);
});

test("stems match word forms, also in Russian", () => {
  assert.ok(relevance("учу немецкий", "Немецкий язык для начинающих") > 0);
  assert.ok(relevance("programming", "Programmers react") > 0);
});

test("channel lists win over relevance", () => {
  const base = { goal: "swift", title: "cats compilation" };
  assert.equal(keepVideo(base), false);
  assert.equal(keepVideo({ ...base, channel: "Sean Allen", allowChannels: ["sean allen"] }), true);
  assert.equal(
    keepVideo({ goal: "swift", title: "Swift tips", channel: "Drama", blockChannels: ["drama"] }),
    false
  );
});

test("an empty goal keeps everything", () => {
  assert.equal(relevance("", "anything"), 1);
});

test("snooze budget never goes negative", () => {
  assert.equal(snoozeLeft(0), 15);
  assert.equal(snoozeLeft(20), 0);
});
