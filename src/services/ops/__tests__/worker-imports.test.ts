import { readFileSync } from "fs";
import { join } from "path";

// The worker imports retention.ts. Pulling the registry in with it bundles
// every op and jsdom, which crashes the worker bundle at start-up
// ("Cannot find module './xhr-sync-worker.js'", 2026-10-12).
const retention = readFileSync(join(__dirname, "..", "retention.ts"), "utf8");
const constants = readFileSync(join(__dirname, "..", "constants.ts"), "utf8");

describe("ops modules the worker loads", () => {
  it("retention imports no op or registry module", () => {
    expect(retention).not.toContain('from "./registry"');
    expect(retention).not.toContain('from "./ops/');
    expect(retention).not.toContain('from "."');
  });

  it("constants imports nothing", () => {
    expect(constants).not.toContain("import ");
  });
});
