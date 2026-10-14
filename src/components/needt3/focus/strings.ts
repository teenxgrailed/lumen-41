/**
 * The Focus window's copy, read from the prototype's extracted strings
 * (docs/port/prototype/port/strings/en.json, `focus.jsx`) so it is never
 * retyped. A line the extraction did not catch (it joins pieces at run time)
 * is spelled out here once, from focus.jsx.
 */
import strings from "../../../../docs/port/prototype/port/strings/en.json";

const f = strings["focus.jsx"];

export const sounds = f.FC_SOUNDS;
export const lengths = f.FC_LENGTHS;
export const finish = f.fcFinish;
export const win = f.FocusWindow;
export const setup = f.FcSetup;
export const run = f.FcRun;
export const taskCard = f.FcTaskCard;
export const end = f.FcEnd;

/** focus.jsx FC_RULE. */
export const RULE =
  "The scheduler will not place anything inside the session, and the mark up there stops breathing until it ends.";
export const CLOSE = "Close";
export const MINIMISE = "Minimise (Esc)";
export const CUSTOM_MIN = "min";
export const START_PILL = strings["Sidebar.jsx"].FocusControl;

/** "50 min session · ends 16:17". */
export const sessionLine = (dur: string, ends: string | null) =>
  ends ? `${dur} ${run.session_ends} ${ends}` : `${dur} session`;

/* Ending early is one press and one confirm; no wait. */
export const endSession = "End session";
export const endBreak = "End break";
export const keepGoing = "Keep going";
/** "End now? 12 min focused so far." */
export const endAsk = (focused: string) => `End now? ${focused} so far.`;
export const focusedSoFar = (dur: string | null) =>
  dur ? `${dur} focused` : "Under a minute focused";
