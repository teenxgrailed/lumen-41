"use client";

import { createContext, useContext } from "react";

/**
 * The slot Ask Needt's panel is portalled into: the last child of the shell's
 * main row (prototype App.jsx `data-chat-dock`). The shell owns the element
 * and its width; null until it has mounted, and for any tree without a shell.
 */
export const ChatDockContext = createContext<HTMLElement | null>(null);

export function useChatDock(): HTMLElement | null {
  return useContext(ChatDockContext);
}
