import { readFileSync } from "node:fs";

/**
 * CI publishes needt-web from the root Dockerfile's `production` target
 * (.github/workflows/docker-publish.yml), not from docker/production/Dockerfile.
 * Coolify's healthcheck runs curl inside that image, and the SIGTERM drain in
 * src/instrumentation.ts only runs when Next leaves signals to the app.
 */
describe("root Dockerfile production image", () => {
  const dockerfile = readFileSync("Dockerfile", "utf8");
  const production = dockerfile.slice(
    dockerfile.indexOf("FROM base AS production")
  );

  it("installs curl in the base stage the runtime images share", () => {
    const base = dockerfile.slice(0, dockerfile.indexOf("FROM base AS"));
    expect(base).toMatch(/apk add --no-cache[^\n]*\bcurl\b/);
  });

  it("hands SIGTERM to the app so health can drain first", () => {
    expect(production).toContain("ENV NEXT_MANUAL_SIG_HANDLE=true");
  });
});
