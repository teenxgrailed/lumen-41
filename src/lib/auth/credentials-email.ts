/**
 * The email NextAuth will authenticate on a credentials callback, read the
 * way NextAuth reads it (next-auth/next/utils getBody): a JSON body as is, a
 * urlencoded form through Object.fromEntries, so with a duplicated field the
 * LAST value wins. The rate limiter and the credential lock must count the
 * same address that is checked, or a duplicate `email=` field would charge a
 * junk address while the victim's password is guessed. Any other content type
 * carries no credentials for NextAuth, so it yields an empty address.
 */
export async function credentialsEmail(request: Request): Promise<string> {
  const contentType = request.headers.get("content-type") ?? "";
  const clone = request.clone();
  let raw: unknown;
  if (contentType.includes("application/json")) {
    const body = (await clone.json().catch(() => null)) as {
      email?: unknown;
    } | null;
    raw = body?.email;
  } else if (contentType.includes("application/x-www-form-urlencoded")) {
    raw = Object.fromEntries(new URLSearchParams(await clone.text())).email;
  }
  return String(raw ?? "")
    .trim()
    .toLowerCase();
}
