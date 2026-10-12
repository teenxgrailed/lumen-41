import * as React from "react";

/**
 * The two text fields of sign-in. A host that can swap the face (phone /
 * desktop) owns them and passes `fields`; a screen used on its own keeps them
 * locally. The password lives only in React state: never logged, never stored.
 */
export interface AuthFields {
  mail: string;
  pass: string;
  setMail: (value: string) => void;
  setPass: (value: string) => void;
}

export function useAuthFields(
  external: AuthFields | undefined,
  seed?: { mail?: string }
): AuthFields {
  const [mail, setMail] = React.useState(seed?.mail ?? "");
  const [pass, setPass] = React.useState("");
  return external ?? { mail, pass, setMail, setPass };
}

export type RecoverStep = null | "ask" | "sent";

export interface AuthRefusal {
  reason: "taken" | "wrong" | null;
  message: string | null;
}

/**
 * Where the person is in the sign-in flow, beyond the two fields: whether the
 * first Continue has been pressed (`touched`), whether the password field has
 * appeared (`withPass`, the desktop's two-step), which recovery step is open,
 * and the server's last refusal. Owned by the route when it can swap faces, so
 * crossing 700px neither closes "Forgot password?" nor forgets a refusal.
 */
export interface AuthSteps {
  touched: boolean;
  setTouched: (value: boolean) => void;
  withPass: boolean;
  setWithPass: (value: boolean) => void;
  recover: RecoverStep;
  setRecover: (value: RecoverStep) => void;
  refused: AuthRefusal | null;
  setRefused: (value: AuthRefusal | null) => void;
}

export function useAuthSteps(external: AuthSteps | undefined): AuthSteps {
  const [touched, setTouched] = React.useState(false);
  const [withPass, setWithPass] = React.useState(false);
  const [recover, setRecover] = React.useState<RecoverStep>(null);
  const [refused, setRefused] = React.useState<AuthRefusal | null>(null);
  return (
    external ?? {
      touched,
      setTouched,
      withPass,
      setWithPass,
      recover,
      setRecover,
      refused,
      setRefused,
    }
  );
}
