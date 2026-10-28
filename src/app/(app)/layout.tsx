import type { Viewport } from "next";
import { getServerSession } from "next-auth";
import { cookies, headers } from "next/headers";

import { EmailVerificationGate } from "@/components/auth/EmailVerificationGate";
import { AppShell } from "@/components/layout/AppShell";
import { V3Root } from "@/components/needt3/root/V3Root";
import { SandboxBanner } from "@/components/sandbox/SandboxBanner";

import { getAuthOptions } from "@/lib/auth/auth-options";
import { getEmailVerificationStatus } from "@/lib/auth/email-verification-access";
import { viewportLook } from "@/lib/needt3/look-boot";
import {
  PHONE_UI_COOKIE,
  parseUiCookie,
  phoneUiFrom,
} from "@/lib/needt3/phone-ui";
import { requestLook, requestLookCookie } from "@/lib/needt3/request-look";
import { getSandboxKind } from "@/lib/sandbox/guard";

import { viewport as baseViewport } from "../metadata";

export const dynamic = "force-dynamic";

/**
 * Browser chrome in the person's theme from the first byte: `color-scheme`
 * (scrollbars, form controls, overscroll) and `theme-color` follow the look
 * the `needt-look` cookie remembers, not only the OS scheme the static
 * viewport keys on. No cookie yet (first visit on this device): the static
 * answer stands and V3Root writes the cookie.
 */
export async function generateViewport(): Promise<Viewport> {
  const look = await requestLookCookie();
  return look ? { ...baseViewport, ...viewportLook(look) } : baseViewport;
}

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

  // A signed-in person always gets the frame; a stranger only reaches the
  // bare sign-in, reset and setup screens below.
  if (session?.user?.id) {
    // The server picks the phone UI for the first render: the needt-ui cookie,
    // else Sec-CH-UA-Mobile, else the user agent. After hydration the width
    // takes over (700 px), unless the cookie pinned a side.
    const [reqHeaders, jar] = await Promise.all([headers(), cookies()]);
    const uiCookie = jar.get(PHONE_UI_COOKIE)?.value;
    const initialUi = phoneUiFrom({
      secChUaMobile: reqHeaders.get("sec-ch-ua-mobile"),
      userAgent: reqHeaders.get("user-agent"),
      cookie: uiCookie,
    });
    // The saved theme and accent, read here so the first byte of HTML wears
    // them (V3Root's boot script settles System and Time before paint).
    const initialLook = await requestLook(session.user.id);
    const sandboxKind = await getSandboxKind(session.user.id);
    return (
      <EmailVerificationGate initialStatus={verification}>
        {sandboxKind ? <SandboxBanner /> : null}
        <V3Root
          initialUi={initialUi}
          initialLook={initialLook}
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
