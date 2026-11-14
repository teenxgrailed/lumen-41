"use client";

import { type ReactNode, createContext, useContext } from "react";

/**
 * A layer an auth route can hand to the sign-in scenes to draw on their sky,
 * under the collage and the form. `AuthScope` provides it, `AuthFrame` (desktop)
 * and `MaScene` (phone) render it through `AuthGroundSlot`. Routes that pass
 * nothing draw nothing.
 */
export const AuthGroundContext = createContext<ReactNode>(null);

export function AuthGroundSlot() {
  return <>{useContext(AuthGroundContext)}</>;
}
