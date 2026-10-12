import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");
const dockerignore = read(".dockerignore");
const dockerfile = read("docker/production/Dockerfile");
const rootDockerfile = read("Dockerfile");
const workflow = read(".github/workflows/docker-publish.yml");
const deployGuide = read("docs/deploy.md");
const envTemplate = read("ENV_TEMPLATE.md");
const envExample = read(".env.example");
const nextConfig = read("next.config.js");
const artifactCheck = read("scripts/check-production-artifacts.mjs");

const runtimeSecrets = [
  "DATABASE_URL",
  "DIRECT_URL",
  "NEXTAUTH_SECRET",
  "CRON_SECRET",
  "REDIS_URL",
  "COLLABORATION_SECRET",
  "RATE_LIMIT_HASH_SECRET",
  "GOOGLE_CLIENT_SECRET",
  "AZURE_AD_CLIENT_SECRET",
  "AI_ENCRYPTION_KEY",
  "VAPID_PRIVATE_KEY",
  "RESEND_API_KEY",
  "CREEM_API_KEY",
  "CREEM_WEBHOOK_SECRET",
  "SENTRY_AUTH_TOKEN",
];

function buildArgs(workflowText: string) {
  return (
    workflowText.match(
      /^          build-args: \|\n((?:            .*\n)*)/m
    )?.[1] ?? ""
  );
}

describe("production environment contract", () => {
  it("keeps all .env files outside the Docker build context", () => {
    expect(dockerignore).toMatch(/^\.env\*$/m);
  });

  it("passes only the non-secret build identity to docker-publish", () => {
    const args = buildArgs(workflow);

    // The release SHA is decided once, by the `changes` job, so a rollback
    // and a normal release tag images the same way.
    expect(workflow).toContain("RELEASE_SHA: ${{ needs.changes.outputs.sha }}");
    expect(args).toContain("NEEDT_BUILD_SHA=${{ env.RELEASE_SHA }}");
    // Build args are baked into image layers: only public values belong.
    expect(args).not.toMatch(/secrets\./i);
    for (const line of args.split("\n").filter(Boolean)) {
      expect(line.trim()).toMatch(/^(NEEDT_BUILD_SHA|NEXT_PUBLIC_[A-Z_]+)=/);
    }
    for (const secret of runtimeSecrets) {
      expect(args).not.toContain(`${secret}=`);
    }

    expect(workflow).toContain(
      "sentry_auth_token=${{ secrets.SENTRY_AUTH_TOKEN }}"
    );
    expect(workflow).toContain("sentry_org=${{ secrets.SENTRY_ORG }}");
    expect(workflow).toContain("sentry_project=${{ secrets.SENTRY_PROJECT }}");
  });

  it("fails closed on empty Sentry upload secrets before the Docker build", () => {
    expect(workflow).toContain(
      "${SENTRY_AUTH_TOKEN:?SENTRY_AUTH_TOKEN is required}"
    );
    expect(workflow).toContain("${SENTRY_ORG:?SENTRY_ORG is required}");
    expect(workflow).toContain("${SENTRY_PROJECT:?SENTRY_PROJECT is required}");
  });

  it("does not declare runtime secrets as production-image arguments or environment", () => {
    for (const secret of runtimeSecrets) {
      expect(rootDockerfile).not.toMatch(
        new RegExp(`^(?:ARG|ENV)\\s+${secret}(?:=|\\s|$)`, "m")
      );
      expect(dockerfile).not.toMatch(
        new RegExp(`^(?:ARG|ENV)\\s+${secret}(?:=|\\s|$)`, "m")
      );
    }
  });

  it("mounts Sentry upload configuration only for the build process", () => {
    expect(dockerfile).toContain(
      "--mount=type=secret,id=sentry_auth_token,required=true"
    );
    expect(dockerfile).toContain(
      "--mount=type=secret,id=sentry_org,required=true"
    );
    expect(dockerfile).toContain(
      "--mount=type=secret,id=sentry_project,required=true"
    );
    expect(dockerfile).toContain(
      'SENTRY_AUTH_TOKEN="$(cat /run/secrets/sentry_auth_token)"'
    );
    expect(dockerfile).not.toMatch(
      /^(?:ARG|ENV)\s+SENTRY_(?:AUTH_TOKEN|ORG|PROJECT)/m
    );
  });

  it("uploads the exact release and removes client source maps", () => {
    expect(nextConfig).toContain("name: process.env.NEEDT_BUILD_SHA");
    expect(nextConfig).toContain(
      'filesToDeleteAfterUpload: [".next/static/**/*.map"]'
    );
    expect(nextConfig).toContain("errorHandler(error)");
    expect(nextConfig).toContain("throw error");
    expect(artifactCheck).toContain(
      "Production client source maps were not deleted after upload"
    );
    expect(artifactCheck).toContain('extname(file) === ".map"');
  });

  it("keeps the owner checklist aligned across deployment and local templates", () => {
    const required = [
      "RATE_LIMIT_HASH_SECRET",
      "SENTRY_DSN",
      "SENTRY_ENVIRONMENT",
      "NEXT_PUBLIC_SENTRY_DSN",
      "NEXT_PUBLIC_SENTRY_ENVIRONMENT",
      "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
      "VAPID_PRIVATE_KEY",
      "VAPID_SUBJECT",
    ];

    for (const variable of required) {
      expect(deployGuide).toContain(variable);
      expect(envTemplate).toContain(variable);
      expect(envExample).toContain(variable);
    }
  });

  it("documents the deployed collaboration module and BuildKit-only Sentry upload", () => {
    expect(deployGuide).toContain("node dist/collaboration/index.mjs");
    expect(deployGuide).toContain("BuildKit secret mounts");
    expect(deployGuide).not.toContain("node dist/collaboration/index.js");
  });

  it("documents private worker release identity without a public health endpoint", () => {
    expect(deployGuide).toContain("workerBuildSha");
    expect(deployGuide).toContain("worker is not public");
    expect(deployGuide).not.toContain("worker `/health`");
    expect(deployGuide).toContain("40-character Git commit SHA");
  });
});
