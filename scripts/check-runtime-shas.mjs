import { execFileSync } from "node:child_process";

// Services must agree with each other and run DEPLOY_SHA or a descendant of
// it. A descendant is legitimate: the unpinned fallback deploys the head of
// main, and a newer release may land while this one waits.
const EXPECTED_SHA = process.env.DEPLOY_SHA;
const POLL_INTERVAL_MS = Number(
  process.env.RUNTIME_SHA_POLL_INTERVAL_MS ?? 10_000
);
const TIMEOUT_MS = Number(process.env.RUNTIME_SHA_TIMEOUT_MS ?? 10 * 60_000);
const GIT_SHA_PATTERN = /^[0-9a-f]{40}$/i;

const webHealthUrl = process.env.WEB_HEALTH_URL ?? process.env.HEALTH_URL;
const collaborationHealthUrl = process.env.COLLABORATION_HEALTH_URL;

if (!EXPECTED_SHA || !GIT_SHA_PATTERN.test(EXPECTED_SHA)) {
  throw new Error("DEPLOY_SHA must be a 40-character Git commit SHA.");
}
if (!webHealthUrl) {
  throw new Error("WEB_HEALTH_URL is required.");
}
if (!collaborationHealthUrl) {
  throw new Error("COLLABORATION_HEALTH_URL is required.");
}

async function getHealth(url) {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return null;
    const body = await response.json();
    return body?.ok === true ? body : null;
  } catch {
    return null;
  }
}

function observedSha(value) {
  return typeof value === "string" && GIT_SHA_PATTERN.test(value)
    ? value
    : null;
}

function isSameOrDescendant(sha) {
  if (sha === EXPECTED_SHA) return true;
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", EXPECTED_SHA, sha], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

const deadline = Date.now() + TIMEOUT_MS;
let lastSeen = {};
while (Date.now() < deadline) {
  const [webHealth, collaborationHealth] = await Promise.all([
    getHealth(webHealthUrl),
    getHealth(collaborationHealthUrl),
  ]);
  lastSeen = {
    web: observedSha(webHealth?.buildSha),
    worker: observedSha(webHealth?.workerBuildSha),
    collaboration: observedSha(collaborationHealth?.buildSha),
  };
  const seen = Object.values(lastSeen);
  if (
    seen.every((sha) => sha !== null && sha === seen[0]) &&
    isSameOrDescendant(seen[0])
  ) {
    process.stdout.write(
      `All Needt services are healthy at ${seen[0]} (release ${EXPECTED_SHA}).\n`
    );
    process.exit(0);
  }
  await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
}

process.stderr.write(
  `Needt services did not converge on ${EXPECTED_SHA}: ${JSON.stringify(lastSeen)}\n`
);
process.exit(1);
