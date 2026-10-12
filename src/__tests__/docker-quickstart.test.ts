import { readFileSync } from "fs";
import { join } from "path";
import { parse as parseYaml } from "yaml";

// Issue #151: the Docker quick-start failed for operators whose `.env` contained
// an unrelated `PORT` (e.g. `PORT=80`). `docker-compose.yml` forwards the whole
// `.env` into the app container via `env_file`, and the published image's
// Next.js standalone server honors `process.env.PORT` for its bind port - so the
// app bound to the wrong port while compose still mapped host 3000 -> container
// 3000, leaving nothing on localhost:3000. The fix pins `PORT=3000` on the app
// service's `environment` (which overrides `env_file`), so the published port
// always reaches a listening server. These tests pin that behavior + the docs.

const repoRoot = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(repoRoot, rel), "utf8");

interface ComposeService {
  command?: string[];
  depends_on?: Record<string, { condition?: string }>;
  environment?: string[] | Record<string, string | number | null>;
  env_file?: string | string[];
  healthcheck?: { start_period?: string; test?: string[] };
  image?: string;
  ports?: Array<string | number | { target?: number; published?: number }>;
}

describe("Docker quick-start (issue #151)", () => {
  const compose = parseYaml(read("docker-compose.yml")) as {
    services: Record<string, ComposeService>;
  };
  const app = compose.services.app;

  // Normalize the app service `environment` (list or map form) to a plain map.
  function environmentFor(service: ComposeService): Record<string, string> {
    const env = service.environment;
    if (!env) return {};
    if (Array.isArray(env)) {
      return Object.fromEntries(
        env.map((entry) => {
          const idx = entry.indexOf("=");
          return idx === -1
            ? [entry, ""]
            : [entry.slice(0, idx), entry.slice(idx + 1)];
        })
      );
    }
    return Object.fromEntries(
      Object.entries(env).map(([k, v]) => [k, String(v ?? "")])
    );
  }

  const appEnv = environmentFor(app);

  it("pins the container PORT to 3000 via environment (overrides any .env PORT)", () => {
    expect(appEnv.PORT).toBe("3000");
  });

  it("pins the container HOSTNAME to 0.0.0.0 so a .env HOSTNAME can't bind it to an unreachable address", () => {
    // The Next.js standalone server binds to process.env.HOSTNAME; a stray
    // HOSTNAME (e.g. `localhost`) forwarded from the operator's .env would bind
    // the server to loopback inside the container, leaving the published
    // 3000:3000 mapping pointed at an unreachable address - same failure class
    // as the PORT bug (#151 review).
    expect(appEnv.HOSTNAME).toBe("0.0.0.0");
  });

  it("publishes the app on container port 3000, matching the pinned PORT", () => {
    const ports = app.ports ?? [];
    const containerPorts = ports.map((p) => {
      if (typeof p === "object") return String(p.target ?? "");
      // "host:container" or "container" -> take the container side
      const str = String(p);
      const parts = str.split(":");
      return parts[parts.length - 1].split("/")[0];
    });
    expect(containerPorts).toContain("3000");
  });

  it("still loads the operator's .env via env_file", () => {
    const envFile = app.env_file;
    const envFiles = Array.isArray(envFile)
      ? envFile
      : envFile
        ? [envFile]
        : [];
    expect(envFiles).toContain(".env");
  });

  it("starts the complete private runtime topology", () => {
    const worker = compose.services.worker;
    const collaboration = compose.services.collaboration;
    const redis = compose.services.redis;

    expect(redis.image).toBe("redis:7-alpine");
    expect(redis.healthcheck?.test?.join(" ")).toContain("redis-cli ping");
    expect(worker.image).toBe(app.image);
    expect(worker.command).toEqual(["node", "dist/worker/index.js"]);
    expect(worker.ports).toBeUndefined();
    expect(worker.healthcheck?.test?.join(" ")).toContain("127.0.0.1:1235");
    expect(worker.healthcheck?.start_period).toBe("2m");
    expect(collaboration.healthcheck?.test?.join(" ")).toContain(
      "127.0.0.1:1234"
    );
    expect(app.healthcheck?.test?.join(" ")).toContain("/api/health");
  });

  it("waits for web migrations and uses container DNS for stateful services", () => {
    const worker = compose.services.worker;
    const collaboration = compose.services.collaboration;
    const workerEnv = environmentFor(worker);
    const collaborationEnv = environmentFor(collaboration);

    expect(worker.depends_on?.app?.condition).toBe("service_healthy");
    expect(worker.depends_on?.redis?.condition).toBe("service_healthy");
    expect(collaboration.depends_on?.app?.condition).toBe("service_healthy");
    expect(collaboration.depends_on?.redis?.condition).toBe("service_healthy");
    for (const env of [appEnv, workerEnv, collaborationEnv]) {
      expect(env.DATABASE_URL).toContain("@db:5432");
      expect(env.DIRECT_URL).toContain("@db:5432");
      expect(env.REDIS_URL).toBe("redis://redis:6379");
    }
  });

  describe("README quick-start docs", () => {
    const readme = read("README.md");
    // Scope assertions to the Docker quick-start section.
    const section = (() => {
      const idx = readme.indexOf("### Quick Start with Docker");
      if (idx === -1) return readme;
      const next = readme.indexOf("\n### ", idx + 1);
      return next === -1 ? readme.slice(idx) : readme.slice(idx, next);
    })();

    // Isolate the explicit port note so trivial mentions elsewhere in the
    // quick-start (e.g. the NEXTAUTH_URL line in the env example) cannot mask a
    // missing instruction.
    const portNote = (() => {
      const idx = section.indexOf("Note on the port");
      if (idx === -1) return "";
      const next = section.indexOf("\n\n", idx);
      return next === -1 ? section.slice(idx) : section.slice(idx, next);
    })();

    it("explains the container port is fixed and PORT in .env does not change it", () => {
      expect(portNote).toContain("PORT");
      expect(portNote.toLowerCase()).toContain("ports");
    });

    it("warns that changing the host port also requires updating NEXTAUTH_URL to the same origin", () => {
      // Issue #151 review: the quick-start sets NEXTAUTH_URL=http://localhost:3000
      // and the app derives OAuth redirect URLs from it, so remapping the host
      // port without updating NEXTAUTH_URL breaks auth. The note must say so.
      expect(portNote).toContain("NEXTAUTH_URL");
    });
  });
});

describe("production migration tooling", () => {
  const packageJson = JSON.parse(read("package.json")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const dockerfile = read("docker/production/Dockerfile");
  const rootDockerfile = read("Dockerfile");
  const entrypoint = read("entrypoint.sh");

  it("ships the pinned Prisma CLI in the production dependency layer", () => {
    expect(packageJson.dependencies?.prisma).toBe("^6.3.1");
    expect(packageJson.devDependencies?.prisma).toBeUndefined();
    expect(dockerfile).toContain("npm ci --omit=dev --ignore-scripts");
    expect(dockerfile).toContain(
      "/app/node_modules/@prisma/engines ./node_modules/@prisma/engines"
    );
    expect(dockerfile).toContain(
      "test -x /app/node_modules/@prisma/engines/schema-engine-*"
    );
    expect(dockerfile).toContain("RUN npm run build:worker");
    expect(dockerfile).toContain("/app/dist ./dist");
    expect(entrypoint).toContain('"$PRISMA_BIN" migrate deploy');
  });

  it("bundles the lockfile-pinned Prisma CLI in every runtime image", () => {
    expect(rootDockerfile).toContain("FROM base AS runtime-deps");
    expect(rootDockerfile).toContain(
      "npm ci --omit=dev --legacy-peer-deps --ignore-scripts"
    );
    expect(rootDockerfile).toContain(
      "/app/node_modules/@prisma/engines ./node_modules/@prisma/engines"
    );
    expect(rootDockerfile).toContain(
      "test -x /app/node_modules/@prisma/engines/schema-engine-*"
    );
    expect(rootDockerfile.match(/COPY --from=runtime-deps/g)).toHaveLength(3);
    expect(entrypoint).toContain("/app/node_modules/.bin/prisma");
  });

  it("keeps the worker and collaboration images off the Next build", () => {
    // One host builds all three services. When the runtime stages reach back
    // into `builder`, every release runs `next build` three times and the
    // server runs out of memory mid-deploy.
    expect(rootDockerfile).toContain("FROM base AS runtime-builder");
    expect(rootDockerfile).toContain("FROM runtime-builder AS builder");

    const runtimeBuilder = rootDockerfile.slice(
      rootDockerfile.indexOf("FROM base AS runtime-builder"),
      rootDockerfile.indexOf("FROM runtime-builder AS builder")
    );
    expect(runtimeBuilder).toContain("RUN npm run build:worker");
    expect(runtimeBuilder).toContain("RUN npm run build:collaboration");
    expect(runtimeBuilder).not.toContain("RUN npm run build\n");

    const runtimeDeps = rootDockerfile.slice(
      rootDockerfile.indexOf("FROM base AS runtime-deps"),
      rootDockerfile.indexOf("FROM base AS worker")
    );
    const workerStage = rootDockerfile.slice(
      rootDockerfile.indexOf("FROM base AS worker"),
      rootDockerfile.indexOf("FROM base AS collaboration")
    );
    const collaborationStage = rootDockerfile.slice(
      rootDockerfile.indexOf("FROM base AS collaboration"),
      rootDockerfile.indexOf("FROM base AS production")
    );

    for (const stage of [runtimeDeps, workerStage, collaborationStage]) {
      expect(stage).not.toContain("COPY --from=builder");
    }
    expect(workerStage).toContain(
      "COPY --from=runtime-builder /app/dist/worker ./dist/worker"
    );
    expect(collaborationStage).toContain(
      "COPY --from=runtime-builder /app/dist/collaboration ./dist/collaboration"
    );
  });

  it("starts collaboration from its ESM bundle", () => {
    const packageJson = JSON.parse(read("package.json")) as {
      scripts?: Record<string, string>;
    };
    expect(packageJson.scripts?.["build:collaboration"]).toContain(
      "--format=esm"
    );
    expect(packageJson.scripts?.["build:collaboration"]).toContain(
      "dist/collaboration/index.mjs"
    );
    expect(packageJson.scripts?.["start:collaboration"]).toContain(
      "dist/collaboration/index.mjs"
    );
    expect(rootDockerfile).toContain(
      'CMD ["node", "dist/collaboration/index.mjs"]'
    );
  });

  it("takes the build identity from CI, falling back to Coolify's source commit", () => {
    expect(rootDockerfile).toContain("ARG SOURCE_COMMIT=local");
    expect(rootDockerfile).toContain("ARG NEEDT_BUILD_SHA");
    // Once per final stage plus the web builder, never in `base`, where it
    // would invalidate the cached `npm ci` layers on every commit.
    expect(
      rootDockerfile.match(
        /ENV NEEDT_BUILD_SHA=\$\{NEEDT_BUILD_SHA:-\$SOURCE_COMMIT\}/g
      )
    ).toHaveLength(4);
    const base = rootDockerfile.slice(
      rootDockerfile.indexOf("AS base"),
      rootDockerfile.indexOf("AS development")
    );
    expect(base).not.toContain("NEEDT_BUILD_SHA");
  });

  it("never downloads a floating Prisma major during container startup", () => {
    expect(entrypoint).not.toContain("npx --yes prisma");
    expect(entrypoint).not.toContain("prisma generate");
    expect(entrypoint).toContain('"$PRISMA_BIN" migrate deploy');
  });

  it("fails the container when migrations or required environment fail", () => {
    expect(entrypoint).toMatch(/^#!\/bin\/sh\nset -eu\n/);
  });

  it("runs every production service through the shared entrypoint", () => {
    const workerStage = rootDockerfile.slice(
      rootDockerfile.indexOf("FROM base AS worker"),
      rootDockerfile.indexOf("FROM base AS collaboration")
    );
    const collaborationStage = rootDockerfile.slice(
      rootDockerfile.indexOf("FROM base AS collaboration"),
      rootDockerfile.indexOf("FROM base AS production")
    );

    expect(dockerfile).toContain('ENTRYPOINT ["/app/entrypoint.sh"]');
    expect(dockerfile).toContain('CMD ["node", "server.js"]');
    expect(workerStage).toContain('ENTRYPOINT ["/app/entrypoint.sh"]');
    expect(workerStage).toContain('CMD ["node", "dist/worker/index.js"]');
    expect(collaborationStage).toContain('ENTRYPOINT ["/app/entrypoint.sh"]');
    expect(collaborationStage).toContain(
      'CMD ["node", "dist/collaboration/index.mjs"]'
    );
  });

  it("ships and starts the ESM collaboration artifact consistently", () => {
    const packageJsonText = read("package.json");
    const compose = read("docker-compose.yml");

    expect(packageJsonText).toContain(
      '"start:collaboration": "node dist/collaboration/index.mjs"'
    );
    expect(dockerfile).toContain("test -s dist/collaboration/index.mjs");
    expect(compose).toContain(
      'command: ["node", "dist/collaboration/index.mjs"]'
    );
    expect(packageJsonText).not.toContain("dist/collaboration/index.js");
    expect(dockerfile).not.toContain("dist/collaboration/index.js");
    expect(rootDockerfile).not.toContain("dist/collaboration/index.js");
    expect(compose).not.toContain("dist/collaboration/index.js");
  });

  it("keeps worker health private and provides an all-service SHA gate", () => {
    const packageJsonText = read("package.json");
    const runtimeShaCheck = read("scripts/check-runtime-shas.mjs");

    expect(dockerfile).toContain("EXPOSE 3000 1234");
    expect(dockerfile).not.toContain("EXPOSE 3000 1234 1235");
    expect(rootDockerfile).not.toContain("EXPOSE 1235");
    expect(packageJsonText).toContain(
      '"check:runtime-shas": "node scripts/check-runtime-shas.mjs"'
    );
    expect(runtimeShaCheck).toContain("WEB_HEALTH_URL");
    expect(runtimeShaCheck).not.toContain("WORKER_HEALTH_URL");
    expect(runtimeShaCheck).toContain("workerBuildSha");
    expect(runtimeShaCheck).toContain("COLLABORATION_HEALTH_URL");
    expect(runtimeShaCheck).toContain(
      "Object.values(lastSeen).every((sha) => sha === EXPECTED_SHA)"
    );
  });
});

describe("production root redirect", () => {
  const middleware = read("src/middleware.ts");
  const homePage = read("src/app/page.tsx");

  it("does not fetch the application from its own middleware", () => {
    expect(middleware).not.toContain("getHomepageSetting");
    expect(middleware).not.toContain("Error fetching homepage setting");
    expect(middleware).not.toContain("X-Internal-Request");
  });

  it("leaves the auth-aware root redirect to the server page", () => {
    expect(homePage).toContain(
      'redirect(session ? "/calendar" : "/auth/signin")'
    );
    expect(middleware).toContain('if (pathname === "/")');
  });
});
