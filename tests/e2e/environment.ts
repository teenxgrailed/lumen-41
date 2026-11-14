import { PrismaClient } from "@prisma/client";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const localE2eEnvironment = {
  DATABASE_URL: "postgresql://needt:needt@127.0.0.1:5433/needt_test",
  DIRECT_URL: "postgresql://needt:needt@127.0.0.1:5433/needt_test",
  REDIS_URL: "redis://127.0.0.1:6380",
  NEXTAUTH_URL: "http://127.0.0.1:3000",
  NEXTAUTH_SECRET: "needt-e2e-only-secret-not-valid-outside-tests",
  RATE_LIMIT_HASH_SECRET: "needt-e2e-rate-limit-hash-secret",
  COLLABORATION_DISABLED: "1",
  /* oauth-age-confirm.spec.ts: a mock Google (src/lib/auth/e2e-oauth.ts) and
     open sign-up; both ignored by a production server outside CI. */
  NEEDT_E2E_OAUTH_URL: "http://127.0.0.1:4599",
  NEEDT_SIGNUPS_OPEN: "1",
} as const;

const localCreemEnvironment = {
  CREEM_API_KEY: "creem_test_key_for_local_e2e_only",
  CREEM_WEBHOOK_SECRET: "creem_test_webhook_secret_for_local_e2e_only",
  CREEM_PRODUCT_PRO_MONTHLY: "prod_test_pro_month",
  CREEM_PRODUCT_PRO_YEARLY: "prod_test_pro_year",
  CREEM_PRODUCT_LIFETIME: "prod_test_lifetime",
} as const;

const requiredColumns = [
  ["User", "id"],
  ["User", "isActive"],
  ["Workspace", "id"],
  ["WorkspaceMember", "workspaceId"],
  ["Page", "id"],
  ["Moodboard", "id"],
] as const;

export function configureE2eEnvironment() {
  if (!process.env.CI) {
    Object.assign(process.env, localE2eEnvironment);
  } else {
    for (const [key, value] of Object.entries(localE2eEnvironment)) {
      if (!process.env[key]) process.env[key] = value;
    }
  }

  for (const [key, value] of Object.entries(localCreemEnvironment)) {
    if (!process.env[key]) process.env[key] = value;
  }
}

async function run(command: string, args: string[]) {
  await execFileAsync(command, args, {
    cwd: process.cwd(),
    env: process.env,
  });
}

async function assertRequiredSchema() {
  const prisma = new PrismaClient();
  try {
    const columns = await prisma.$queryRaw<
      Array<{ table_name: string; column_name: string }>
    >`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = current_schema()
    `;
    const present = new Set(
      columns.map(
        ({ table_name, column_name }) => `${table_name}.${column_name}`
      )
    );
    const missing = requiredColumns.filter(
      ([table, column]) => !present.has(`${table}.${column}`)
    );
    if (missing.length > 0) {
      throw new Error(
        `E2E database is missing required schema: ${missing
          .map(([table, column]) => `${table}.${column}`)
          .join(", ")}`
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

export async function prepareE2eEnvironment() {
  configureE2eEnvironment();
  if (!process.env.CI) {
    await run("docker", [
      "compose",
      "-f",
      "docker-compose.e2e.yml",
      "up",
      "--detach",
      "--wait",
    ]);
  }
  await run("npx", ["prisma", "migrate", "deploy"]);
  await run("npx", ["tsx", "prisma/ci-seed.ts"]);
  await assertRequiredSchema();
}

export async function resetLocalE2eEnvironment() {
  configureE2eEnvironment();
  if (process.env.CI) return;
  // This compose project owns only the `needt-e2e_postgres_data` volume.
  // Resetting it makes locally generated workspaces, tasks, and invites
  // deterministic without touching a developer's application database.
  await run("docker", [
    "compose",
    "-f",
    "docker-compose.e2e.yml",
    "down",
    "--volumes",
  ]);
  await run("docker", [
    "compose",
    "-f",
    "docker-compose.e2e.yml",
    "up",
    "--detach",
    "--wait",
  ]);
}
