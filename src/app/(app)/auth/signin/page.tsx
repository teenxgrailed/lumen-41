import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";

import { V3SignInRoute } from "@/components/needt3/auth/SignInRoute";
import { SignInRoute } from "@/components/needt/auth/SignInRoute";

import { APP_NAME } from "@/lib/app-config";
import { getAuthOptions } from "@/lib/auth/auth-options";
import { isAuthDesignV3 } from "@/lib/needt3/auth-design";
import { requestPhoneUi } from "@/lib/needt3/request-phone-ui";

export const dynamic = "force-dynamic";

export const metadata = {
  title: `Sign In | ${APP_NAME}`,
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

  // The v3 screen draws its own sky and scope. A stranger sees it only once
  // design_v3 is on for everyone (see isAuthDesignV3); until then, the old one.
  if (await isAuthDesignV3(false)) {
    // The phone gets its own face; the server picks it for the first render
    // the way the signed-in frame does (cookie, Sec-CH-UA-Mobile, user agent).
    return (
      <V3SignInRoute
        callbackUrl={callbackUrl}
        error={error}
        {...await requestPhoneUi()}
      />
    );
  }

  // The screen draws its own full-bleed frame, so the page adds none.
  return <SignInRoute callbackUrl={callbackUrl} error={error} />;
}
