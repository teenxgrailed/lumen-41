import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";

import { V3SignInRoute } from "@/components/needt3/auth/SignInRoute";

import { APP_NAME } from "@/lib/app-config";
import { getAuthOptions } from "@/lib/auth/auth-options";
import { requestPhoneUi } from "@/lib/needt3/request-phone-ui";
import { SECTION_TITLES } from "@/lib/needt3/section-titles";

export const dynamic = "force-dynamic";

export const metadata = {
  title: SECTION_TITLES.signIn,
  description: `Sign in to your ${APP_NAME} account`,
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  // Check if user is already signed in
  const authOptions = await getAuthOptions();
  const session = await getServerSession(authOptions);

  if (session) {
    redirect("/calendar");
  }

  const { callbackUrl, error } = await searchParams;

  // The screen draws its own sky and scope. The phone gets its own face; the
  // server picks it for the first render the way the signed-in frame does
  // (cookie, Sec-CH-UA-Mobile, user agent).
  return (
    <V3SignInRoute
      callbackUrl={callbackUrl}
      error={error}
      {...await requestPhoneUi()}
    />
  );
}
