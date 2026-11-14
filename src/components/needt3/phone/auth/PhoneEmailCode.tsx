"use client";

/* THE CODE FORM, phone face (rendered inside the sign-in form, whose submit
   sends the code or checks it): same flow as the desktop's EmailCodeBlock (the
   state machine is use-email-code-flow.ts), drawn with the phone's own field
   and button primitives. The code field is the one the keyboard offers the
   mailed code for (autocomplete one-time-code, numeric). */
import * as React from "react";

import { LuCircleAlert, LuKeyRound, LuMail, LuSend } from "react-icons/lu";

import { resendClock } from "../../auth/auth-logic";
import {
  CODE_LENGTH,
  CODE_TEXT,
  codeSentLine,
} from "../../auth/email-code-logic";
import type { EmailCodeFlow } from "../../auth/use-email-code-flow";
import { MaButton, MaField, MaInput, MaNote } from "./Scene";

export function PhoneEmailCode({
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
  onUsePassword?: () => void;
}) {
  if (flow.step === "code") {
    return (
      <div
        className="mau-form-part"
        style={{ display: "contents" }}
        data-auth-code-step
      >
        <MaNote icon={LuMail}>{codeSentLine(mail.trim())}</MaNote>
        <MaField label="Code" error={!!flow.message} hint={flow.message}>
          <MaInput
            label="Code"
            name="code"
            value={flow.code}
            onChange={flow.setCode}
            placeholder="6-digit code"
            icon={LuKeyRound}
            autoComplete="one-time-code"
            inputMode="numeric"
            maxLength={CODE_LENGTH + 2}
            enterKeyHint="go"
            autoFocus
            invalid={!!flow.message}
          />
        </MaField>
        {flow.netErr && !offline ? (
          <MaNote tone="attention" icon={LuCircleAlert}>
            {CODE_TEXT.net}
          </MaNote>
        ) : null}
        <MaButton
          primary
          type="submit"
          disabled={offline || flow.busy}
          data-auth-verify-code
        >
          {flow.busy ? CODE_TEXT.verifying : CODE_TEXT.verifyLabel(signup)}
        </MaButton>
        <span
          className="mau-resend"
          data-auth-resend={flow.resendIn > 0 ? flow.resendIn : "ready"}
        >
          {"Didn’t get it? Check spam, or "}
          {flow.resendIn > 0 ? (
            <span className="mau-wait">
              resend in {resendClock(flow.resendIn)}
            </span>
          ) : (
            <button
              type="button"
              className="mau-link"
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
            className="mau-link"
            data-auth-change-email
            onClick={flow.changeEmail}
          >
            {CODE_TEXT.differentEmail}
          </button>
        </span>
      </div>
    );
  }

  return (
    <div className="mau-form-part" style={{ display: "contents" }}>
      <MaField
        label="Email"
        error={flow.mailBad}
        hint={flow.mailBad ? CODE_TEXT.invalidMail : null}
      >
        <MaInput
          label="Email"
          type="email"
          inputMode="email"
          value={mail}
          onChange={setMail}
          placeholder="Email"
          icon={LuMail}
          autoComplete="email"
          enterKeyHint="send"
          invalid={flow.mailBad}
        />
      </MaField>
      {flow.message ? (
        <MaNote tone="attention" icon={LuCircleAlert}>
          {flow.message}
        </MaNote>
      ) : null}
      {flow.netErr && !offline ? (
        <MaNote tone="attention" icon={LuCircleAlert}>
          {CODE_TEXT.net}
        </MaNote>
      ) : null}
      <MaButton
        primary
        type="submit"
        disabled={offline || flow.busy}
        data-auth-send-code
      >
        <LuSend size={16} aria-hidden />
        {flow.busy ? CODE_TEXT.sending : CODE_TEXT.sendLabel}
      </MaButton>
      {onUsePassword ? (
        <button
          type="button"
          className="mau-link mau-forgot"
          data-auth-use-password
          onClick={onUsePassword}
        >
          {CODE_TEXT.usePassword}
        </button>
      ) : null}
    </div>
  );
}
