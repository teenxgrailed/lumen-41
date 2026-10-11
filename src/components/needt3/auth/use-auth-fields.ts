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
