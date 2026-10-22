import assert from "node:assert/strict";
import { test } from "node:test";

import { hostMatches, reasonLine, rulesFor, RULE_ID_BASE } from "../src/lib/blocking.js";

test("inactive gives no rules", () => {
  assert.deepEqual(rulesFor({ active: false, mode: null, sites: [] }, "use.needt.app"), []);
});

test("block list redirects the listed domains, wildcards folded", () => {
  const rules = rulesFor(
    { active: true, mode: "BLOCKLIST", sites: ["youtube.com", "*.reddit.com", "reddit.com"] },
    "use.needt.app"
  );
  assert.equal(rules.length, 1);
  assert.equal(rules[0].id, RULE_ID_BASE);
  assert.deepEqual(rules[0].condition.requestDomains, ["youtube.com", "reddit.com"]);
  assert.equal(rules[0].action.type, "redirect");
});

test("Needt itself is never blocked", () => {
  assert.deepEqual(
    rulesFor({ active: true, mode: "BLOCKLIST", sites: ["needt.app"] }, "use.needt.app"),
    []
  );
});

test("allow list blocks everything else and allows Needt", () => {
  const rules = rulesFor(
    { active: true, mode: "ALLOWLIST", sites: ["docs.google.com"] },
    "use.needt.app"
  );
  assert.equal(rules.length, 2);
  assert.equal(rules[1].action.type, "allow");
  assert.ok(rules[1].priority > rules[0].priority);
  assert.deepEqual(rules[1].condition.requestDomains, ["docs.google.com", "use.needt.app"]);
});

test("hostMatches covers subdomains only", () => {
  assert.ok(hostMatches("m.youtube.com", "youtube.com"));
  assert.ok(hostMatches("youtube.com", "*.youtube.com"));
  assert.ok(!hostMatches("notyoutube.com", "youtube.com"));
});

test("reason line names the source", () => {
  const line = reasonLine({
    profiles: [
      {
        name: "Deep work",
        reason: { kind: "event", title: "Launch prep", until: null },
      },
    ],
  });
  assert.equal(line, "Launch prep · from your calendar");
});
