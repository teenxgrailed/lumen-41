/**
 * The build the person is running. `NEXT_PUBLIC_NEEDT_BUILD_SHA` is set by the
 * Dockerfile from the same `NEEDT_BUILD_SHA` that `/api/health` reports
 * (`resolveBuildSha`), and Next inlines it into the client bundle, so About
 * can show it without a round trip. Outside a release build it is unset.
 */
const GIT_SHA = /^[0-9a-f]{40}$/i;

export function shortBuildSha(sha: string | null | undefined): string | null {
  const v = (sha ?? "").trim();
  return GIT_SHA.test(v) ? v.slice(0, 7).toLowerCase() : null;
}

/** "Build 1a2b3c4", or "Development build" when no release SHA was baked in. */
export function buildLabel(sha: string | null | undefined): string {
  const short = shortBuildSha(sha);
  return short ? `Build ${short}` : "Development build";
}

/** The label for this running bundle. */
export function currentBuildLabel(): string {
  return buildLabel(process.env.NEXT_PUBLIC_NEEDT_BUILD_SHA);
}
