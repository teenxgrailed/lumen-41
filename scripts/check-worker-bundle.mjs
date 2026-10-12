#!/usr/bin/env node
// Bundles the worker exactly like `npm run build:worker` and boots it far
// enough to resolve every module. A module that cannot live in the esbuild
// bundle (jsdom through isomorphic-dompurify, 2026-10-12) fails here instead
// of crash-looping the production worker after a deploy.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

// Inside the repo so the externals (@prisma/client) resolve from node_modules.
const dir = join(process.cwd(), "dist", "worker-bundle-check");
mkdirSync(dir, { recursive: true });
const out = join(dir, "index.js");
try {
  execFileSync(
    "npx",
    [
      "esbuild",
      "src/worker/index.ts",
      "--bundle",
      "--platform=node",
      "--target=node22",
      "--format=cjs",
      `--outfile=${out}`,
      "--external:@prisma/client",
      "--external:.prisma",
      "--external:@block65/webcrypto-web-push",
      "--log-level=error",
    ],
    { stdio: "inherit" }
  );

  if (readFileSync(out, "utf8").includes("xhr-sync-worker")) {
    console.error(
      "Worker bundle contains jsdom (xhr-sync-worker). Something the worker imports pulls in isomorphic-dompurify; keep the sanitizer out of worker code paths."
    );
    process.exit(1);
  }

  // Boot until the production env check: reaching it means every module
  // resolved. Any other early exit is a load failure.
  const run = spawnSync(process.execPath, [out], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      NEEDT_BUILD_SHA: "",
      DATABASE_URL: "postgresql://check:check@127.0.0.1:1/check",
      REDIS_URL: "redis://127.0.0.1:1",
    },
    encoding: "utf8",
    timeout: 20_000,
  });
  const output = `${run.stdout}\n${run.stderr}`;
  if (/Cannot find module|MODULE_NOT_FOUND|SyntaxError/.test(output)) {
    console.error("Worker bundle failed to load:\n" + output.slice(0, 2000));
    process.exit(1);
  }
  if (!output.includes("NEEDT_BUILD_SHA")) {
    console.error(
      "Worker bundle did not reach the start-up env check:\n" +
        output.slice(0, 2000)
    );
    process.exit(1);
  }
  console.log("Worker bundle resolves every module.");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
