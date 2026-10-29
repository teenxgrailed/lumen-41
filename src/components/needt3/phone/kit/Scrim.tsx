"use client";

import type { Ref } from "react";

import { pkCx } from "./util";

/**
 * The blurred scrim behind a sheet or the pull-down, stronger toward the
 * edges. Drive it with `--pk-scrim-k` (0..1) on `scrimRef`; the factor goes on
 * the layers, never as opacity on a parent of the blur.
 */
export function PkScrim({
  scrimRef,
  onClick,
  open,
}: {
  scrimRef?: Ref<HTMLDivElement>;
  onClick?: () => void;
  open?: boolean;
}) {
  return (
    <div
      ref={scrimRef}
      className={pkCx("pk-scrim", open && "is-open")}
      onClick={onClick}
      aria-hidden="true"
    >
      <span className="pk-scrim-blur is-2" />
      <span className="pk-scrim-tint" />
    </div>
  );
}
