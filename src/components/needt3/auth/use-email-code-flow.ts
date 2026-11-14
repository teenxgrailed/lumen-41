import * as React from "react";

import {
  CODE_TEXT,
  type EmailCodeApi,
  RESEND_SECONDS,
  canSendCode,
  codeComplete,
  codeDigits,
} from "./email-code-logic";

/**
 * The state machine behind the code form, shared by the desktop and phone
 * faces: ask for the address, mail a code, take the six digits, sign in. The
 * faces only draw it. The code lives in React state only.
 */
export function useEmailCodeFlow(input: {
  api: EmailCodeApi;
  mail: string;
  signup: boolean;
  /** Sign-up needs the 16+ / Terms box: false (and the box flags itself). */
  ageOk: () => boolean;
  ageConfirmed: boolean;
  /** The server wants the age box for a new address typed on the sign-in tab. */
  onNeedAge: () => void;
  onDone: () => void;
  offline: boolean;
}) {
  const { api, mail, signup, ageOk, ageConfirmed, onNeedAge, onDone, offline } =
    input;
  const [step, setStep] = React.useState<"email" | "code">("email");
  const [code, setCodeState] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [netErr, setNetErr] = React.useState(false);
  const [touched, setTouched] = React.useState(false);
  const [resendIn, setResendIn] = React.useState(0);
  const alive = React.useRef(true);
  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  React.useEffect(() => {
    if (step !== "code" || resendIn <= 0) return undefined;
    const id = window.setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => window.clearTimeout(id);
  }, [step, resendIn]);

  const mailBad = touched && !canSendCode(mail);

  const send = React.useCallback(async () => {
    if (busy || offline) return;
    setTouched(true);
    setMessage(null);
    setNetErr(false);
    if (!canSendCode(mail)) return;
    if (signup && !ageOk()) return;
    setBusy(true);
    const answer = await api.send(mail.trim().toLowerCase());
    if (!alive.current) return;
    setBusy(false);
    if (answer === "sent") {
      setStep("code");
      setCodeState("");
      setResendIn(RESEND_SECONDS);
      return;
    }
    if (answer === "limited") setMessage(CODE_TEXT.limited);
    else if (answer === "invalid") setMessage(CODE_TEXT.invalidMail);
    else setNetErr(true);
  }, [api, ageOk, busy, mail, offline, signup]);

  const verify = React.useCallback(
    async (value: string) => {
      if (busy || offline || !codeComplete(value)) return;
      setMessage(null);
      setNetErr(false);
      setBusy(true);
      const answer = await api.verify({
        email: mail.trim().toLowerCase(),
        code: value,
        ageConfirmed,
      });
      if (!alive.current) return;
      if (answer === "ok") {
        onDone();
        return;
      }
      setBusy(false);
      if (answer === "age") {
        onNeedAge();
        setMessage(CODE_TEXT.needAge);
      } else if (answer === "wrong") {
        setMessage(CODE_TEXT.wrong);
      } else {
        setNetErr(true);
      }
    },
    [ageConfirmed, api, busy, mail, offline, onDone, onNeedAge]
  );

  /** Typing or pasting: only digits stay; the sixth one sends it. */
  const setCode = React.useCallback(
    (raw: string) => {
      const digits = codeDigits(raw);
      setCodeState(digits);
      setMessage(null);
      if (codeComplete(digits)) void verify(digits);
    },
    [verify]
  );

  const changeEmail = React.useCallback(() => {
    setStep("email");
    setCodeState("");
    setMessage(null);
    setNetErr(false);
  }, []);

  return {
    step,
    code,
    setCode,
    busy,
    message,
    netErr,
    mailBad,
    resendIn,
    send,
    verify: () => verify(code),
    changeEmail,
  };
}

export type EmailCodeFlow = ReturnType<typeof useEmailCodeFlow>;
