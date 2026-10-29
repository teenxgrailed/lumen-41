"use client";

import * as React from "react";

/**
 * "I'm 16 or older and agree to the Terms and Privacy Policy": the one box
 * every sign-up asks for (src/lib/auth/age-confirmation.ts says why and what
 * the server does with it). Sign-in does not show it.
 *
 * The route that swaps the desktop and phone faces owns the state, so crossing
 * 700px keeps the tick; a screen used on its own keeps it locally.
 */
export interface AgeState {
  checked: boolean;
  setChecked: (value: boolean) => void;
}

export function useAgeState(external?: AgeState): AgeState {
  const [checked, setChecked] = React.useState(false);
  return external ?? { checked, setChecked };
}

export function AgeConfirm({
  age,
  missing,
  termsHref = "/terms",
  privacyHref = "/privacy",
  className = "auth-age",
}: {
  age: AgeState;
  /** The person tried to go on without it: say so, quietly. */
  missing: boolean;
  termsHref?: string;
  privacyHref?: string;
  className?: string;
}) {
  return (
    <label
      className={className}
      data-auth-age
      data-missing={missing && !age.checked ? "true" : undefined}
    >
      <input
        type="checkbox"
        checked={age.checked}
        onChange={(e) => age.setChecked(e.target.checked)}
        aria-invalid={missing && !age.checked ? true : undefined}
      />
      <span>
        I&apos;m 16 or older and agree to the{" "}
        <a href={termsHref} target="_blank" rel="noopener noreferrer">
          Terms
        </a>{" "}
        and{" "}
        <a href={privacyHref} target="_blank" rel="noopener noreferrer">
          Privacy Policy
        </a>
      </span>
    </label>
  );
}
