/* THE CORNER'S CONTRACT.
 *
 * The prototype fired notifications through `window.__notify({kind, title,
 * body, when, acts, ms, sticky})`. The global was an artefact of classic
 * scripts — there was no other way for one file to reach another — and it is
 * dropped here for a context and a hook. The PAYLOAD survives unchanged,
 * because that shape is the contract every caller was written against.
 *
 * `acts` carry `say` to run the agent or `go` to move the app; a notice may
 * carry both kinds of act, and the corner runs whichever the act names.
 */

/** What happened. Each kind owns one glyph and one tone, and nothing else. */
export type NoticeKind =
  | "placed"
  | "moved"
  | "risk"
  | "done"
  | "agent"
  | "person"
  | "blocked";

/**
 * One button on a notice.
 *
 * `say` is handed to the agent exactly as if it had been typed into the panel
 * — the corner has one voice, so an action and a sentence go the same way.
 * `go` names a screen for the app to move to.
 */
export interface NoticeAct {
  label: string;
  /** A line for the agent, verbatim. */
  say?: string;
  /** A screen id the shell knows how to reach. */
  go?: string;
  /**
   * Something only the caller can do — opening a deep link, retrying the
   * request that failed. The prototype had no such act because a prototype
   * has nothing to run; the application does, and a button that cannot do
   * the one thing it is for is worse than no button.
   */
  run?: () => void;
}

/** What a caller hands to `notify`. */
export interface NoticePayload {
  kind: NoticeKind;
  title: string;
  body: string;
  /** Authored, not computed: the corner never runs a clock over the wording. */
  when?: string;
  acts?: readonly NoticeAct[];
  /** How long it waits before it leaves. Default `DISMISS_MS`. */
  ms?: number;
  /** Waits until it is dismissed or acted on, however long that takes. */
  sticky?: boolean;
  /**
   * A name for a recurring message, so the next one of its kind replaces the
   * last instead of stacking beside it. A sync that reports itself six times
   * is one notice six times, not six notices.
   */
  key?: string;
}

/** A payload once the stack owns it. */
export interface Notice extends NoticePayload {
  id: string;
  /** Set for the 220ms it takes to leave, so the card can animate out first. */
  leaving?: boolean;
}

/** What anywhere in the app can do to the stack. */
export interface NoticeApi {
  /** Raise a notice; returns its id, so a caller can drop its own. */
  notify: (payload: NoticePayload) => string;
  /** Send one away, animation included. */
  dismiss: (id: string) => void;
  /** Send all of them away. A caller that asks to clear without naming one
   * means the lot. */
  dismissAll: () => void;
}

/** What the stack itself reads. Separate, so a caller that only fires does
 *  not re-render on every arrival. */
export interface NoticeStack {
  notices: readonly Notice[];
  /** Reaching for a card says you are not finished with it. */
  hold: () => void;
  release: () => void;
}

/* ── THE SEAM ───────────────────────────────────────────────────────────
 * Everything above is the corner's own. Everything below is where somebody
 * else's answer arrives. Today that is a scripted stand-in reading the
 * fixture; next pass it is the surface in `src/components/ai/`. The corner
 * knows only this interface, so replacing the one does not touch the other.
 */

/** One line in the panel. */
export interface CornerMessage {
  id: string;
  from: "you" | "needt";
  text: string;
}

/** What comes back when the agent has been asked something. */
export interface CornerReply {
  text: string;
  /**
   * The agent is about to do something on screen rather than only answer, so
   * the panel closes and gets out of the way of its own hand.
   */
  acting?: boolean;
}

/** Whatever is answering. The corner asks it two things and nothing more. */
export interface CornerAgent {
  /** True while a run is in flight: the island must never interrupt one. */
  busy: () => boolean;
  /** Answer one line. Rejections are the caller's to handle. */
  respond: (prompt: string) => Promise<CornerReply>;
}
