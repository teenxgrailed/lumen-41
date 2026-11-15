import { AsyncLocalStorage } from "node:async_hooks";

/**
 * What the NextAuth route handler knows about the request it is serving, for
 * the callbacks that run inside it. The `signIn` callback is called deep in
 * NextAuth's own call chain, after a round trip to the provider; reading the
 * request's cookies there through `next/headers` depended on Next's request
 * store still being reachable at that point, and a failed read looked exactly
 * like "no cookie". The route handler has the request in hand, so it hands
 * over the one value the gate needs.
 */
interface AuthRequestContext {
  /** The raw `needt_age_ok` cookie of the request, if it carried one. */
  ageToken?: string;
}

const storage = new AsyncLocalStorage<AuthRequestContext>();

export function runWithAuthRequest<T>(
  context: AuthRequestContext,
  fn: () => T
): T {
  return storage.run(context, fn);
}

export function currentAuthRequest(): AuthRequestContext | undefined {
  return storage.getStore();
}
