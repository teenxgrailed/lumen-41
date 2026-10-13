"use client";

import { createContext, useContext } from "react";

/**
 * Shell-local chrome state that is not in the S1 UI store: the narrow
 * floating rail, Focus Mode, Customize Sidebar and the Keyboard sheet.
 */
export interface ShellApi {
  /** Window below 1100px: the rail floats over the page. */
  narrow: boolean;
  focusMode: boolean;
  toggleSidebar: () => void;
  setFocusMode: (on: boolean) => void;
  openCustomize: () => void;
  openKeys: () => void;
  openWhatsNew: () => void;
}

const noop = () => {};

export const ShellContext = createContext<ShellApi>({
  narrow: false,
  focusMode: false,
  toggleSidebar: noop,
  setFocusMode: noop,
  openCustomize: noop,
  openKeys: noop,
  openWhatsNew: noop,
});

export function useShellApi() {
  return useContext(ShellContext);
}
