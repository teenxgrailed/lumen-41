import { Suspense } from "react";

import { PasswordResetForm } from "@/components/auth/PasswordResetForm";
import { V3ResetPasswordRoute } from "@/components/needt3/auth/ResetPasswordRoute";
import { V3SignInRoute } from "@/components/needt3/auth/SignInRoute";

import { APP_NAME } from "@/lib/app-config";
import { isAuthDesignV3 } from "@/lib/needt3/auth-design";
import { requestPhoneUi } from "@/lib/needt3/request-phone-ui";

export const dynamic = "force-dynamic";

export const metadata = {
  title: `Reset Password - ${APP_NAME}`,
  description: `Reset your ${APP_NAME} account password`,
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  // Same rule as sign-in: v3 once design_v3 is on for everyone.
  if (await isAuthDesignV3(false)) {
    const { token } = await searchParams;
    const ui = await requestPhoneUi();
    // The mail's link carries a token: set the new password. Without one,
    // this is "Forgot your password?" on the sign-in screen.
    return token ? (
      <V3ResetPasswordRoute token={token} {...ui} />
    ) : (
      <V3SignInRoute startRecover {...ui} />
    );
  }

  return (
    <div className="container flex h-dvh w-screen flex-col items-center justify-center">
      {/* useSearchParams in the form needs a Suspense boundary to prerender
          (previously provided by the removed global loading.tsx). */}
      <Suspense fallback={null}>
        <PasswordResetForm />
      </Suspense>
    </div>
  );
}
