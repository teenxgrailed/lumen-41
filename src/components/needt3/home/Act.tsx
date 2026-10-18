"use client";

import { PkButton } from "../phone/kit";

export interface ActionProps {
  phone?: boolean;
}

/** One small button: the desktop's text button, the phone's chip. */
export function Act({
  phone,
  children,
  onClick,
  ...rest
}: ActionProps & {
  children: string;
  onClick: () => void;
  "data-fin"?: string;
  disabled?: boolean;
}) {
  return phone ? (
    <PkButton kind="chip" onClick={onClick} {...rest}>
      {children}
    </PkButton>
  ) : (
    <button
      type="button"
      className="nx-btn nx-btn-sm nx-btn-secondary"
      onClick={onClick}
      {...rest}
    >
      {children}
    </button>
  );
}
