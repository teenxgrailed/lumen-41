"use client";

import {
  type PropsWithChildren,
  createContext,
  useContext,
  useState,
} from "react";

const PortalScope = createContext<HTMLElement | null>(null);

export function useV3PortalContainer() {
  return useContext(PortalScope);
}

/** Mount inside V3Root so every Radix layer inherits the scoped theme. */
export function V3PortalScope({ children }: PropsWithChildren) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  return (
    <PortalScope.Provider value={container}>
      {children}
      <div ref={setContainer} data-v3-portals="" />
    </PortalScope.Provider>
  );
}
