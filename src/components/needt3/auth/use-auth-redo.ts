"use client";

import * as React from "react";

import {
  AUTH_REDO_DEFAULT,
  type AuthRedoState,
  authRedoFromSearch,
} from "./auth-redo";

/** The plan the visitor arrived with, read from the address after mount (so
    the server render and the first client render agree). `dismissPlan` is the
    "Start free instead" link. */
export function useAuthRedo(): AuthRedoState & { dismissPlan: () => void } {
  const [state, setState] = React.useState<AuthRedoState>(AUTH_REDO_DEFAULT);
  React.useEffect(() => {
    setState(authRedoFromSearch(window.location.search));
  }, []);
  const dismissPlan = React.useCallback(
    () => setState((s) => ({ ...s, plan: null })),
    []
  );
  return { ...state, dismissPlan };
}
