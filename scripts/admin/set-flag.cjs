#!/usr/bin/env node
/**
 * Turn one global FeatureFlag on or off.
 *
 *   node scripts/admin/set-flag.cjs --key signups_open --enabled true
 *       DRY RUN: prints the current and the new state.
 *   node scripts/admin/set-flag.cjs --key signups_open --enabled true --confirm
 *       Writes the FeatureFlag row (creates it when missing).
 *
 * "Enabled for everybody" in the app means enabled AND rolloutPercentage
 * >= 100 (isFeatureEnabledForEveryone), so --enabled true also sets the
 * rollout to 100 unless --rollout says otherwise. --enabled false leaves the
 * rollout as it is. The app reads the row on every check; no restart needed.
 *
 * Plain CommonJS so it runs with `node` inside the production image (/app).
 */
"use strict";

const KEY_RE = /^[a-z0-9_.-]+$/i;

function parseBool(value) {
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error("--enabled must be true or false");
}

function parseArgs(argv) {
  const args = {
    key: null,
    enabled: null,
    rollout: null,
    confirm: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--confirm") args.confirm = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--key") args.key = argv[(i += 1)] ?? null;
    else if (arg.startsWith("--key=")) args.key = arg.slice(6);
    else if (arg === "--enabled") args.enabled = parseBool(argv[(i += 1)]);
    else if (arg.startsWith("--enabled="))
      args.enabled = parseBool(arg.slice(10));
    else if (arg === "--rollout") args.rollout = argv[(i += 1)] ?? null;
    else if (arg.startsWith("--rollout=")) args.rollout = arg.slice(10);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (args.key !== null) {
    args.key = args.key.trim();
    if (!KEY_RE.test(args.key))
      throw new Error(`Invalid flag key: ${args.key}`);
  }
  if (args.rollout !== null) {
    const n = Number(args.rollout);
    if (!Number.isInteger(n) || n < 0 || n > 100) {
      throw new Error("--rollout must be an integer from 0 to 100");
    }
    args.rollout = n;
  }
  return args;
}

function nextState(current, args) {
  const rollout =
    args.rollout !== null
      ? args.rollout
      : args.enabled
        ? 100
        : (current?.rolloutPercentage ?? 0);
  return { enabled: args.enabled, rolloutPercentage: rollout };
}

function fmt(state) {
  if (!state) return "(no row)";
  return `enabled=${state.enabled} rollout=${state.rolloutPercentage}%`;
}

async function run(client, args, log = console.log) {
  const current = await client.featureFlag.findUnique({
    where: { key: args.key },
    select: { key: true, enabled: true, rolloutPercentage: true },
  });
  const next = nextState(current, args);
  log(`Flag ${args.key}: ${fmt(current)} -> ${fmt(next)}`);
  if (
    current &&
    current.enabled === next.enabled &&
    current.rolloutPercentage === next.rolloutPercentage
  ) {
    log("Already set. Nothing to do.");
    return 0;
  }
  if (!args.confirm) {
    log("DRY RUN. Nothing was changed. Re-run with --confirm to apply.");
    return 0;
  }
  const saved = await client.featureFlag.upsert({
    where: { key: args.key },
    update: next,
    create: { key: args.key, ...next },
    select: { enabled: true, rolloutPercentage: true },
  });
  log(`Updated: ${fmt(saved)}`);
  return 0;
}

const USAGE =
  "Usage: node scripts/admin/set-flag.cjs --key <flag> --enabled <true|false> [--rollout 0-100] [--confirm]";

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    console.error(USAGE);
    return 2;
  }
  if (args.help || !args.key || args.enabled === null) {
    console.error(USAGE);
    return args.help ? 0 : 2;
  }
  const { PrismaClient } = require("@prisma/client");
  const client = new PrismaClient();
  try {
    return await run(client, args);
  } catch (error) {
    console.error("FAILED:", error);
    return 1;
  } finally {
    await client.$disconnect();
  }
}

if (require.main === module) {
  main().then((code) => process.exit(code));
}

module.exports = { parseArgs, nextState, run };
