"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { CheckInboxScreen } from "@/components/needt3/auth/CheckInboxScreen";
import { Button } from "@/components/ui/button";

import { signOutOfNeedt } from "@/lib/auth/client-sign-out";
import type { PhoneUi } from "@/lib/needt3/phone-ui";
import { notify } from "@/lib/notifications";

/** Seconds before "Send again" works again; the server enforces the same. */
export const RESEND_COOLDOWN_SECONDS = 60;

/** Inbox shortcuts for the common providers; nothing for an unknown domain. */
export function inboxLinks(
  email: string | null
): { label: string; href: string }[] {
  const domain = email?.split("@")[1]?.toLowerCase() ?? "";
  const gmail = { label: "Open Gmail", href: "https://mail.google.com/" };
  const outlook = {
    label: "Open Outlook",
    href: "https://outlook.live.com/mail/",
  };
  if (domain === "gmail.com" || domain === "googlemail.com") return [gmail];
  if (/^(outlook|hotmail|live|msn)\./.test(domain)) return [outlook];
  return email ? [gmail, outlook] : [];
}

/**
 * The banner's height, published on <html> while it shows, so a full-height
 * frame (the design_v3 frame) can start below it instead of under it.
 */
export const TOP_BANNER_VAR = "--needt-top-banner";

type VerificationStatus = {
  email: string | null;
  verified: boolean;
  required: boolean;
};

export function EmailVerificationGate({
  children,
  initialStatus,
  ui,
}: {
  children?: React.ReactNode;
  initialStatus: VerificationStatus | null;
  /** The server's pick of phone or desktop face for the blocking screen. */
  ui?: { initialUi: PhoneUi; uiForced: boolean };
}) {
  const [status, setStatus] = useState<VerificationStatus | null>(
    initialStatus
  );
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const bannerRef = useRef<HTMLDivElement>(null);
  const showBanner = Boolean(status?.email && !status.verified);

  const loadStatus = useCallback(async () => {
    const response = await fetch("/api/auth/email-verification/status");
    if (!response.ok) return;
    setStatus((await response.json()) as VerificationStatus);
  }, []);

  useEffect(() => {
    if (initialStatus) void loadStatus();
  }, [initialStatus, loadStatus]);

  // The screen moves on by itself once the link was opened on any device.
  const blocked = Boolean(status?.required && !status.verified);
  useEffect(() => {
    if (!blocked) return undefined;
    const id = setInterval(() => {
      void fetch("/api/auth/email-verification/status")
        .then((r) => (r.ok ? r.json() : null))
        .then((next: VerificationStatus | null) => {
          if (next?.verified) window.location.reload();
        })
        .catch(() => undefined);
    }, 4000);
    return () => clearInterval(id);
  }, [blocked]);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  // One observer on one element: the banner wraps to two lines on a narrow
  // phone, and the frame below must follow its real height.
  useLayoutEffect(() => {
    const root = document.documentElement;
    const el = bannerRef.current;
    if (!showBanner || !el) {
      root.style.removeProperty(TOP_BANNER_VAR);
      return undefined;
    }
    const publish = () =>
      root.style.setProperty(
        TOP_BANNER_VAR,
        `${Math.ceil(el.getBoundingClientRect().height)}px`
      );
    publish();
    const observer =
      typeof ResizeObserver === "function" ? new ResizeObserver(publish) : null;
    observer?.observe(el);
    return () => {
      observer?.disconnect();
      root.style.removeProperty(TOP_BANNER_VAR);
    };
  }, [showBanner]);

  async function resend() {
    setSending(true);
    try {
      const response = await fetch("/api/auth/email-verification/request", {
        method: "POST",
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not send email");
      notify.success("Verification email sent");
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (error) {
      notify.error(
        error instanceof Error ? error.message : "Could not send email"
      );
    } finally {
      setSending(false);
    }
  }

  if (status?.required && !status.verified) {
    return (
      <CheckInboxScreen
        email={status.email}
        links={inboxLinks(status.email)}
        sending={sending}
        cooldown={cooldown}
        onResend={() => void resend()}
        onUseAnother={() => void signOutOfNeedt("/start")}
        initialUi={ui?.initialUi}
        uiForced={ui?.uiForced}
      />
    );
  }

  return (
    <>
      {showBanner && (
        <div
          ref={bannerRef}
          data-top-banner=""
          className="fixed inset-x-0 top-0 z-[100] flex min-h-11 items-center justify-center gap-3 border-b border-[var(--border-subtle)] bg-[var(--surface-raised)] px-4 py-2 text-center text-xs text-[var(--text-secondary)]"
        >
          <span>Confirm your email to start 14 days of Pro.</span>
          <Button
            className="h-7 px-2 text-xs"
            disabled={sending}
            size="sm"
            variant="outline"
            onClick={() => void resend()}
          >
            {sending ? "Sending…" : "Resend"}
          </Button>
        </div>
      )}
      {children}
    </>
  );
}
