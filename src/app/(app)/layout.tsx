import { getServerSession } from "next-auth";
import { cookies, headers } from "next/headers";

import { EmailVerificationGate } from "@/components/auth/EmailVerificationGate";
import { AppShell } from "@/components/layout/AppShell";
import { V3Root } from "@/components/needt3/root/V3Root";

import { getAuthOptions } from "@/lib/auth/auth-options";
import { getEmailVerificationStatus } from "@/lib/auth/email-verification-access";
import { isDesignV3 } from "@/lib/needt3/design-flag";
import {
  PHONE_UI_COOKIE,
  parseUiCookie,
  phoneUiFrom,
} from "@/lib/needt3/phone-ui";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getServerSession(await getAuthOptions());
  const verification = session?.user?.id
    ? await getEmailVerificationStatus(session.user.id)
    : null;

  if (verification?.required && !verification.verified) {
    return <EmailVerificationGate initialStatus={verification} />;
  }

  // design_v3 is off for everyone by default (rollout 0 %); the frame is
  // reached only through a per-user override.
  if (session?.user?.id && (await isDesignV3())) {
    // The server picks the phone UI for the first render: the needt-ui cookie,
    // else Sec-CH-UA-Mobile, else the user agent. After hydration the width
    // takes over (700 px), unless the cookie pinned a side. Only read here, so
    // the flag-off path below stays exactly as it was.
    const [reqHeaders, jar] = await Promise.all([headers(), cookies()]);
    const uiCookie = jar.get(PHONE_UI_COOKIE)?.value;
    const initialUi = phoneUiFrom({
      secChUaMobile: reqHeaders.get("sec-ch-ua-mobile"),
      userAgent: reqHeaders.get("user-agent"),
      cookie: uiCookie,
    });
    return (
      <EmailVerificationGate initialStatus={verification}>
        <V3Root
          initialUi={initialUi}
          uiForced={parseUiCookie(uiCookie) !== null}
        >
          {children}
        </V3Root>
      </EmailVerificationGate>
    );
  }

  return (
    <EmailVerificationGate initialStatus={verification}>
      <AppShell>{children}</AppShell>
    </EmailVerificationGate>
  );
}
