import { V3ConfirmEmailRoute } from "@/components/needt3/auth/ConfirmEmailRoute";

import { requestPhoneUi } from "@/lib/needt3/request-phone-ui";
import { SECTION_TITLES } from "@/lib/needt3/section-titles";

export const dynamic = "force-dynamic";

export const metadata = {
  title: SECTION_TITLES.confirmEmail,
};

export default async function ConfirmEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; token?: string }>;
}) {
  const { email = "", token = "" } = await searchParams;
  return (
    <V3ConfirmEmailRoute
      email={email}
      token={token}
      {...await requestPhoneUi()}
    />
  );
}
