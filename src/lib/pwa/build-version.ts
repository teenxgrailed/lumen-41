/**
 * Which build answered. The middleware stamps every response with the build
 * SHA of the container that served it; the page knows the SHA it was built
 * from. A different SHA means a deploy happened under an open tab.
 */
export const BUILD_HEADER = "x-needt-build";
export const NEW_VERSION_EVENT = "needt-new-version";

const GIT_SHA = /^[0-9a-f]{40}$/i;

/** True when both are real release SHAs and they differ. */
export function isDifferentBuild(
  server: string | null | undefined,
  client: string | null | undefined
): boolean {
  const s = (server ?? "").trim().toLowerCase();
  const c = (client ?? "").trim().toLowerCase();
  return GIT_SHA.test(s) && GIT_SHA.test(c) && s !== c;
}

let announced = false;

/** Tell the page (once) that the server runs a newer build than the page. */
export function noteServerBuild(response: Pick<Response, "headers">) {
  if (announced || typeof window === "undefined") return;
  // Hand-made fetch stubs and opaque responses may carry no headers at all.
  const server = response?.headers?.get?.(BUILD_HEADER);
  if (!isDifferentBuild(server, process.env.NEXT_PUBLIC_NEEDT_BUILD_SHA))
    return;
  announced = true;
  window.dispatchEvent(new Event(NEW_VERSION_EVENT));
}

/** Test seam. */
export function resetBuildAnnouncement() {
  announced = false;
}
