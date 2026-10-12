"use client";

import type { ReactNode } from "react";

import type { ZoneSpec } from "./drop";

/**
 * The element phone-drag reads (`data-pd-*`): wrap a PkSection in it and rows
 * may be lifted out of it and (by its mode) dropped into it. A zone without a
 * spec is locked ("none"): rows may only leave.
 */
export function PkDropZone({
  k,
  spec,
  folded,
  children,
}: {
  k: string;
  spec?: ZoneSpec;
  folded?: boolean;
  children?: ReactNode;
}) {
  return (
    <div
      className="ptk-zone"
      data-pd-zone={k}
      data-pd-mode={spec ? spec.mode : "none"}
      data-pd-folded={folded ? "1" : undefined}
    >
      {children}
    </div>
  );
}
