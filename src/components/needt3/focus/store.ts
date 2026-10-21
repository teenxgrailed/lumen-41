import { create } from "zustand";

import type { FocusSummary, LengthChoice } from "@/lib/needt3/focus";

/**
 * What the setup view has been given so far. Held here, not in the view, so
 * the form survives the window crossing 700 px (the two faces are different
 * components). `null` until the person touches a field: the view then reads
 * the saved defaults, so a changed Settings → Focus length still shows.
 */
export interface SetupDraft {
  purpose: string;
  len: LengthChoice;
  custom: string;
  /** "" = no task. */
  taskId: string;
}

/**
 * The Focus window's own state (prototype `fcUi`: view, preset, summary,
 * note). Whether the window is open is `useNeedt3Ui().focusOpen`, which the
 * sidebar pill, ⌘⇧F and the phone's Start focus already write. The session
 * itself is the server's, in the query cache.
 */
interface FocusWindowState {
  /** After a session ends, the End view's numbers; null otherwise. */
  summary: FocusSummary | null;
  /** The task the setup view starts with ("Next task", a task's own Focus). */
  preset: string | null;
  /** The line under the setup title ("Break's over…"). */
  note: string | null;
  /** The task a break returns to once it is over. */
  breakAfter: string | null;
  draft: SetupDraft | null;
  /** "Not yet" was pressed: the Done ask stays away for this summary. */
  askDismissed: boolean;
  /** End session was pressed and is waiting for its one confirm. */
  confirmEnd: boolean;
  /** The session id "Keep going" was pressed on once its full-time task was
   *  ticked: the "N min left" ask stays away for that session. */
  fullTimeKept: string | null;

  patch: (p: Partial<Omit<FocusWindowState, "patch" | "reset">>) => void;
  reset: () => void;
}

const BLANK = {
  summary: null,
  preset: null,
  note: null,
  breakAfter: null,
  draft: null,
  askDismissed: false,
  confirmEnd: false,
  fullTimeKept: null,
} satisfies Partial<FocusWindowState>;

export const useFocusWindow = create<FocusWindowState>()((set) => ({
  ...BLANK,
  patch: (p) => set(p),
  reset: () => set(BLANK),
}));
