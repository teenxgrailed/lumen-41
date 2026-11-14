"use client";

/* THE CODE FORM, desktop face: an address, a "Send code" button, then six
   digits. The phone draws the same flow in phone/auth/PhoneEmailCode.tsx; both
   take the state machine from use-email-code-flow.ts. Sizes and the one
   form-row geometry are the sign-in card's own (PORT.md): this adds no new
   field style. */
import * as React from "react";

import { LuCircleAlert } from "react-icons/lu";

import { Field } from "./AuthScreen";
import { resendClock } from "./auth-logic";
import { CODE_LENGTH, CODE_TEXT, codeSentLine } from "./email-code-logic";
import type { EmailCodeFlow } from "./use-email-code-flow";

export function EmailCodeBlock({
  flow,
  mail,
  setMail,
  signup,
  offline,
  onUsePassword,
}: {
  flow: EmailCodeFlow;
  mail: string;
  setMail: (value: string) => void;
  signup: boolean;
  offline: boolean;
  /** Reveals the old email + password form; absent on the sign-up tab. */
  onUsePassword?: () => void;
}) {
  if (flow.step === "code") {
    return (
      <div className="auth-signin-col-4 nx-swap" data-auth-code-step>
        <p className="auth-signin-text">{codeSentLine(mail.trim())}</p>
        <Field
          value={flow.code}
          label="Code"
          placeholder="6-digit code"
          name="code"
          autoComplete="one-time-code"
          inputMode="numeric"
          maxLength={CODE_LENGTH + 2}
          autoFocus
          invalid={!!flow.message}
          onChange={flow.setCode}
          onEnter={() => void flow.verify()}
        />
        {flow.message ? (
          <span className="refusal auth-signin-row-3" role="alert">
            <LuCircleAlert size={13} />
            {flow.message}
          </span>
        ) : null}
        {flow.netErr && !offline ? (
          <span className="auth-error-text" role="alert" data-auth-error>
            {CODE_TEXT.net}
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => void flow.verify()}
          disabled={offline || flow.busy}
          className="nx-btn nx-btn-primary axs-go auth-signin-btn"
          data-auth-verify-code
        >
          {flow.busy ? CODE_TEXT.verifying : CODE_TEXT.verifyLabel(signup)}
        </button>
        <p
          className="auth-recover-resend"
          data-auth-resend={flow.resendIn > 0 ? flow.resendIn : "ready"}
        >
          {"Didn’t get it? Check spam, or "}
          {flow.resendIn > 0 ? (
            <span className="auth-recover-wait">
              resend in {resendClock(flow.resendIn)}
            </span>
          ) : (
            <button
              type="button"
              className="ax-link"
              disabled={offline || flow.busy}
              data-auth-resend-code
              onClick={() => void flow.send()}
            >
              send it again
            </button>
          )}
          {". "}
          <button
            type="button"
            className="ax-link"
            data-auth-change-email
            onClick={flow.changeEmail}
          >
            {CODE_TEXT.differentEmail}
          </button>
        </p>
      </div>
    );
  }

  return (
    <div className="auth-signin-col-4">
      <Field
        value={mail}
        label="Email"
        placeholder="you@example.com"
        autoComplete="email"
        inputMode="email"
        invalid={flow.mailBad}
        onChange={setMail}
        onEnter={() => void flow.send()}
      />
      {flow.mailBad ? (
        <span className="auth-error-text">{CODE_TEXT.invalidMail}</span>
      ) : null}
      {flow.message ? (
        <span className="auth-error-text" role="alert" data-auth-limited>
          {flow.message}
        </span>
      ) : null}
      {flow.netErr && !offline ? (
        <span className="auth-error-text" role="alert" data-auth-error>
          {CODE_TEXT.net}
        </span>
      ) : null}
      <button
        type="button"
        onClick={() => void flow.send()}
        disabled={offline || flow.busy}
        className="nx-btn nx-btn-primary axs-go auth-signin-btn"
        data-auth-send-code
      >
        {flow.busy ? CODE_TEXT.sending : CODE_TEXT.sendLabel}
      </button>
      {onUsePassword ? (
        <button
          type="button"
          className="ax-link auth-forgot"
          data-auth-use-password
          onClick={onUsePassword}
        >
          {CODE_TEXT.usePassword}
        </button>
      ) : null}
    </div>
  );
}
