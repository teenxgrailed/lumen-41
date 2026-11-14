/**
 * The URL after one search param changes, as a path + query + hash. Pure so
 * the open/close of the task window (`?task=<id>`) can be tested without a
 * router: the window itself is written with `history.replaceState`, never
 * `router.replace`, because the app layout is `force-dynamic` and a router
 * navigation to a new query waits for a server round trip before the window
 * may appear.
 */
export function withParam(
  href: string,
  key: string,
  value: string | null
): string {
  const url = new URL(href, "http://needt.invalid");
  if (value) url.searchParams.set(key, value);
  else url.searchParams.delete(key);
  return `${url.pathname}${url.search}${url.hash}`;
}
