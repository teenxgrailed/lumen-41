import { V3ResetPasswordRoute } from "@/components/needt3/auth/ResetPasswordRoute";
import { V3SignInRoute } from "@/components/needt3/auth/SignInRoute";

import { APP_NAME } from "@/lib/app-config";
import { requestPhoneUi } from "@/lib/needt3/request-phone-ui";
import { SECTION_TITLES } from "@/lib/needt3/section-titles";

export const dynamic = "force-dynamic";

export const metadata = {
  title: SECTION_TITLES.resetPassword,
  description: `Reset your ${APP_NAME} account password`,
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
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
