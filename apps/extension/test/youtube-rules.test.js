import assert from "node:assert/strict";
import { test } from "node:test";

import {
  YT_DEFAULTS, addEntry, channelEntry, compileList, handleFromHref, isBlocked, normalizeYt,
  parseEntry, rootClasses, shortsRedirect,
} from "../src/lib/youtube-rules.js";

const lists = (channels = [], keywords = []) => ({ channels: compileList(channels), keywords: compileList(keywords) });

test("defaults: Shorts and home feed off, the rest untouched", () => {
  const yt = normalizeYt(undefined);
  assert.equal(yt.noShorts, true);
  assert.equal(yt.noHome, true);
  for (const k of ["noSidebar", "noEndscreen", "noComments", "noAutoplay"]) assert.equal(yt[k], false);
  assert.deepEqual(yt.blockChannels, []);
  assert.notEqual(yt.blockChannels, YT_DEFAULTS.blockChannels);
});

test("normalize keeps valid values and drops junk", () => {
  const yt = normalizeYt({ noShorts: false, noComments: "yes", blockChannels: [" A ", 5, ""], blockKeywords: "x" });
  assert.equal(yt.noShorts, false);
  assert.equal(yt.noComments, false);
  assert.deepEqual(yt.blockChannels, ["A"]);
  assert.deepEqual(yt.blockKeywords, []);
});

test("parseEntry: text, regex with and without flags, broken regex, empty", () => {
  assert.deepEqual(parseEntry("  Drama "), { text: "drama" });
  assert.ok(parseEntry("/react(ion)?/").re.test("REACTION video"));
  assert.ok(parseEntry("/^live/i").re.test("Live now"));
  assert.equal(parseEntry("/(/"), null);
  assert.equal(parseEntry("  "), null);
});

test("channels match by whole name or handle, not by substring", () => {
  const l = lists(["Drama Alert", "@spamchan"]);
  assert.equal(isBlocked({ title: "x", channel: "drama alert" }, l), true);
  assert.equal(isBlocked({ title: "x", channel: "Drama Alert Daily" }, l), false);
  assert.equal(isBlocked({ title: "x", channel: "Other", handle: "@SpamChan" }, l), true);
  assert.equal(isBlocked({ title: "x", channel: "" }, l), false);
});

test("channel regex matches name or handle", () => {
  const l = lists(["/^tv\\b/"]);
  assert.equal(isBlocked({ title: "x", channel: "TV Today" }, l), true);
  assert.equal(isBlocked({ title: "x", channel: "Retv" }, l), false);
});

test("keywords: substring ignoring case, regex on the title", () => {
  const l = lists([], ["unboxing", "/\\b(top|best) \\d+\\b/"]);
  assert.equal(isBlocked({ title: "iPhone UNBOXING!" }, l), true);
  assert.equal(isBlocked({ title: "Top 10 mistakes" }, l), true);
  assert.equal(isBlocked({ title: "Topology lecture" }, l), false);
});

test("empty lists block nothing", () => {
  assert.equal(isBlocked({ title: "anything", channel: "anyone" }, lists()), false);
});

test("handleFromHref", () => {
  assert.equal(handleFromHref("/@SomeOne"), "@someone");
  assert.equal(handleFromHref("https://www.youtube.com/@a.b/videos"), "@a.b");
  assert.equal(handleFromHref("/channel/UC123"), "");
  assert.equal(handleFromHref(undefined), "");
});

test("block button entry prefers the handle and does not duplicate", () => {
  assert.equal(channelEntry("Name", "@name"), "@name");
  assert.equal(channelEntry("Name", ""), "Name");
  const a = addEntry([], "@name");
  assert.deepEqual(a, ["@name"]);
  assert.equal(addEntry(a, "@NAME"), a);
  assert.equal(addEntry(a, " "), a);
});

test("Shorts URLs redirect to the watch page", () => {
  assert.equal(shortsRedirect("/shorts/abc_DEF-1"), "/watch?v=abc_DEF-1");
  assert.equal(shortsRedirect("/watch"), null);
  assert.equal(shortsRedirect("/feed/shorts"), null);
});

test("root classes: home feed only on the home page", () => {
  const yt = normalizeYt({ noSidebar: true });
  assert.deepEqual(rootClasses(yt, "/"), ["needt-yt-noshorts", "needt-yt-nohome", "needt-yt-nosidebar"]);
  assert.deepEqual(rootClasses(yt, "/results"), ["needt-yt-noshorts", "needt-yt-nosidebar"]);
  assert.deepEqual(rootClasses(normalizeYt({ noShorts: false, noHome: false }), "/"), []);
});
