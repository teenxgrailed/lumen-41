import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";

import { V3DesktopHandoffRoute } from "@/components/needt3/auth/DesktopHandoffRoute";
import { validChallenge } from "@/components/needt3/auth/desktop-logic";

import { getAuthOptions } from "@/lib/auth/auth-options";
import { requestPhoneUi } from "@/lib/needt3/request-phone-ui";
import { SECTION_TITLES } from "@/lib/needt3/section-titles";

export const dynamic = "force-dynamic";

export const metadata = {
  title: SECTION_TITLES.desktopApp,
  // The challenge is not secret, but nothing from this page needs to travel.
  referrer: "no-referrer",
};

export default async function DesktopHandoffPage({
  searchParams,
}: {
  searchParams: Promise<{ challenge?: string; client?: string }>;
}) {
  const { challenge = "", client } = await searchParams;
  // The iOS app opens this page in its sign-in sheet; only the wording differs.
  const ios = client === "ios";
  const session = await getServerSession(await getAuthOptions());
  if (!session?.user?.id) {
    // The middleware already does this; sign in first, then come back here.
    const back = validChallenge(challenge)
      ? `/auth/desktop?challenge=${encodeURIComponent(challenge)}${ios ? "&client=ios" : ""}`
      : "/auth/desktop";
    redirect(`/auth/signin?callbackUrl=${encodeURIComponent(back)}`);
  }
  return (
    <V3DesktopHandoffRoute
      email={session.user.email ?? ""}
      challenge={challenge}
      app={ios ? "ios" : "desktop"}
      {...await requestPhoneUi()}
    />
  );
}
