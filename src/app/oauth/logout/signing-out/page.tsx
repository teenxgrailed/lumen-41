import { resolvePostLogoutTarget } from "@/services/oauth/logout";

import { SignOutAndReturn } from "./SignOutAndReturn";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Signing out",
  referrer: "no-referrer",
};

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const one = (value: string | string[] | undefined) =>
  typeof value === "string" ? value : null;

/**
 * The second half of `/oauth/logout`: ends the Needt session in the browser,
 * then goes to the client's registered post-logout address (or the home
 * page). The address is checked again here; this URL can be typed by anyone.
 */
export default async function SigningOutPage({ searchParams }: PageProps) {
  const raw = await searchParams;
  const to = resolvePostLogoutTarget(
    one(raw.client_id),
    one(raw.post_logout_redirect_uri),
    one(raw.state)
  );
  return (
    <main className="grid min-h-dvh place-items-center bg-background px-4 py-10 text-foreground">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 text-[13px]">
        <SignOutAndReturn to={to} />
      </div>
    </main>
  );
}
