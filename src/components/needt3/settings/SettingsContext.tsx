"use client";

import { createContext, useContext } from "react";

/**
 * Nothing in Settings is saved with a button: a change writes itself and the
 * header says "Saved" once. Sections call `mark()` after a write.
 */
const MarkContext = createContext<() => void>(() => undefined);

export const MarkProvider = MarkContext.Provider;
export const useMark = () => useContext(MarkContext);
