"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { Button } from "@/components/ui/button";

import { notify } from "@/lib/notifications";

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
}: {
  children?: React.ReactNode;
  initialStatus: VerificationStatus | null;
}) {
  const [status, setStatus] = useState<VerificationStatus | null>(
    initialStatus
  );
  const [sending, setSending] = useState(false);
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
      <div className="grid min-h-dvh place-items-center bg-[var(--surface-base)] px-6">
        <div className="w-full max-w-md rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-6 text-center">
          <h1 className="text-xl font-semibold">Confirm your email</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            Confirm {status.email ?? "your email"} before entering Needt.
          </p>
          <Button
            className="mt-5"
            disabled={sending}
            onClick={() => void resend()}
          >
            {sending ? "Sending…" : "Resend confirmation email"}
          </Button>
        </div>
      </div>
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
