"use client";

/* ONE ASK NEEDT FOR BOTH FACES.
 *
 * The conversation (`useAskNeedt`) and what it is looking at (`useAskScope`)
 * live here, above the desktop / phone switch, and are handed to whichever
 * face is drawn: the docked panel on the desktop, the sheet on the phone. So
 * crossing 700 px keeps the thread, a reply that is still streaming, and the
 * scope, and a phone that has never opened Ask still knows which task was
 * pressed last. Same arrangement as the Focus controller (FocusHost).
 */
import * as React from "react";

import { useAskNeedt } from "./useAskNeedt";
import { useAskScope } from "./useAskScope";

export interface AskApi {
  ask: ReturnType<typeof useAskNeedt>;
  asking: ReturnType<typeof useAskScope>;
}

const AskContext = React.createContext<AskApi | null>(null);

export function AskProvider({ children }: { children: React.ReactNode }) {
  const ask = useAskNeedt();
  const asking = useAskScope();
  const api = React.useMemo(() => ({ ask, asking }), [ask, asking]);
  return <AskContext.Provider value={api}>{children}</AskContext.Provider>;
}

/** The shared Ask controller; only inside the v3 shell (`AskProvider`). */
export function useAsk(): AskApi {
  const api = React.useContext(AskContext);
  if (!api) throw new Error("useAsk needs <AskProvider> (the v3 shell)");
  return api;
}
