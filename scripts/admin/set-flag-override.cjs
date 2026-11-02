#!/usr/bin/env node
/**
 * Turn one FeatureFlag on (or off) for ONE user, leaving the global flag alone.
 *
 *   node scripts/admin/set-flag-override.cjs --key agent_hub --user you@example.com --enabled true
 *       DRY RUN: prints the user and the current and new override.
 *   node scripts/admin/set-flag-override.cjs --key agent_hub --user you@example.com --enabled true --confirm
 *       Writes the FeatureFlagOverride (and creates the disabled flag row when missing).
 *
 * --user takes an email or a user id. Plain CommonJS so it runs with `node`
 * inside the production image (/app).
 */
"use strict";

function parseArgs(argv) {
  const args = { key: null, user: null, enabled: null, confirm: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--confirm") args.confirm = true;
    else if (arg === "--key") args.key = argv[(i += 1)] ?? null;
    else if (arg === "--user") args.user = argv[(i += 1)] ?? null;
    else if (arg === "--enabled") {
      const v = argv[(i += 1)];
      if (v !== "true" && v !== "false")
        throw new Error("--enabled must be true or false");
      args.enabled = v === "true";
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

async function run(client, args, log = console.log) {
  const user = await client.user.findFirst({
    where: { OR: [{ id: args.user }, { email: args.user }] },
    select: { id: true, email: true },
  });
  if (!user) {
    log(`No user matches ${args.user}`);
    return 1;
  }
  const current = await client.featureFlagOverride.findFirst({
    where: { flagKey: args.key, userId: user.id },
    select: { id: true, enabled: true },
  });
  log(
    `Flag ${args.key} for ${user.email ?? user.id}: ${
      current ? `enabled=${current.enabled}` : "(no override)"
    } -> enabled=${args.enabled}`
  );
  if (!args.confirm) {
    log("DRY RUN. Nothing was changed. Re-run with --confirm to apply.");
    return 0;
  }
  await client.featureFlag.upsert({
    where: { key: args.key },
    update: {},
    create: { key: args.key, enabled: false, rolloutPercentage: 0 },
  });
  if (current) {
    await client.featureFlagOverride.update({
      where: { id: current.id },
      data: { enabled: args.enabled },
    });
  } else {
    await client.featureFlagOverride.create({
      data: { flagKey: args.key, userId: user.id, enabled: args.enabled },
    });
  }
  log("Updated.");
  return 0;
}

const USAGE =
  "Usage: node scripts/admin/set-flag-override.cjs --key <flag> --user <email|id> --enabled <true|false> [--confirm]";

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    console.error(USAGE);
    return 2;
  }
  if (!args.key || !args.user || args.enabled === null) {
    console.error(USAGE);
    return 2;
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

module.exports = { parseArgs, run };
