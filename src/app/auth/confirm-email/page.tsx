import { ConfirmEmailForm } from "@/components/auth/ConfirmEmailForm";
import { V3ConfirmEmailRoute } from "@/components/needt3/auth/ConfirmEmailRoute";

import { isAuthDesignV3 } from "@/lib/needt3/auth-design";
import { requestPhoneUi } from "@/lib/needt3/request-phone-ui";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Confirm email | Needt",
};

export default async function ConfirmEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; token?: string }>;
}) {
  const { email = "", token = "" } = await searchParams;
  // Same rule as sign-in: v3 once design_v3 is on for everyone.
  if (await isAuthDesignV3(false)) {
    return (
      <V3ConfirmEmailRoute
        email={email}
        token={token}
        {...await requestPhoneUi()}
      />
    );
  }
  return <ConfirmEmailForm email={email} token={token} />;
}
