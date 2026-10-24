"use client";

import * as React from "react";

import { FiX } from "react-icons/fi";

import { BANNER_DISMISSED_COOKIE } from "@/lib/onboarding/paths";

const ResumeContext = React.createContext<string | null>(null);

/**
 * Today's server page says whether this person still has onboarding ahead of
 * them (and where it resumes); the banner inside either face reads it here.
 */
export function OnboardingResumeProvider({
  href,
  children,
}: {
  href: string | null;
  children: React.ReactNode;
}) {
  return (
    <ResumeContext.Provider value={href}>{children}</ResumeContext.Provider>
  );
}

const DISMISS_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/**
 * The reminder Today shows after its one redirect into onboarding: the same
 * row as the sample-day note, with the way back and a close button that
 * keeps it closed on this browser. Draws nothing outside the provider.
 */
export function OnboardingResumeBanner() {
  const href = React.useContext(ResumeContext);
  const [closed, setClosed] = React.useState(false);
  if (!href || closed) return null;
  const dismiss = () => {
    setClosed(true);
    const secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${BANNER_DISMISSED_COOKIE}=1; Path=/; Max-Age=${DISMISS_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
  };
  return (
    <div className="hd-sample" role="note" data-hd-onboarding-resume="">
      <span className="hd-sample-text">
        <span className="hd-sample-title">Finish setting up Needt</span>
        <span className="hd-sample-sub">
          A few questions and Needt plans your first week.
        </span>
      </span>
      <a
        className="nx-btn nx-btn-secondary nx-btn-sm hd-sample-clear"
        href={href}
      >
        Continue
      </a>
      <button
        type="button"
        className="nx-btn nx-btn-text nx-btn-sm"
        aria-label="Dismiss"
        data-hd-onboarding-dismiss=""
        onClick={dismiss}
      >
        <FiX size={13} aria-hidden />
      </button>
    </div>
  );
}
