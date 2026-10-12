#!/usr/bin/env node
/**
 * Set one user's role.
 *
 *   node scripts/admin/set-role.cjs --email someone@example.com --role admin
 *       DRY RUN: prints the current and the new role.
 *   node scripts/admin/set-role.cjs --email someone@example.com --role admin --confirm
 *       Writes User.role.
 *
 * API routes read the role from the database (requireAdmin), so they see the
 * change at once. The session cookie carries the role it was issued with, so
 * the UI shows admin screens after the person signs out and back in.
 */
"use strict";

const ROLES = ["user", "admin"];

function parseArgs(argv) {
  const args = { email: null, role: null, confirm: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--confirm") args.confirm = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--email") args.email = argv[(i += 1)] ?? null;
    else if (arg.startsWith("--email=")) args.email = arg.slice(8);
    else if (arg === "--role") args.role = argv[(i += 1)] ?? null;
    else if (arg.startsWith("--role=")) args.role = arg.slice(7);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (args.email) args.email = args.email.trim();
  if (args.role && !ROLES.includes(args.role)) {
    throw new Error(`--role must be one of: ${ROLES.join(", ")}`);
  }
  return args;
}

async function run(client, args) {
  const users = await client.user.findMany({
    where: { email: { equals: args.email, mode: "insensitive" } },
    select: { id: true, email: true, role: true },
    take: 2,
  });
  if (users.length > 1) {
    console.error(`More than one user matches ${args.email}; refusing.`);
    return 1;
  }
  const user = users[0];
  if (!user) {
    console.error(`No user with email ${args.email}. Nothing done.`);
    return 1;
  }
  console.log(`User ${user.id}  ${user.email}`);
  console.log(`Role ${user.role} -> ${args.role}`);
  if (user.role === args.role) {
    console.log("Already set. Nothing to do.");
    return 0;
  }
  if (!args.confirm) {
    console.log(
      "DRY RUN. Nothing was changed. Re-run with --confirm to apply."
    );
    return 0;
  }
  const updated = await client.user.update({
    where: { id: user.id },
    data: { role: args.role },
    select: { role: true },
  });
  console.log(
    `Updated: role=${updated.role}. Sign out and back in to see it in the UI.`
  );
  return 0;
}

const USAGE =
  "Usage: node scripts/admin/set-role.cjs --email <email> --role <user|admin> [--confirm]";

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    console.error(USAGE);
    return 2;
  }
  if (args.help || !args.email || !args.role) {
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

module.exports = { ROLES, parseArgs, run };
