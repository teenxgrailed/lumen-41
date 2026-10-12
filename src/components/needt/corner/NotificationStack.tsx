"use client";

/* NOTIFICATIONS — what the app did, stacked over the place you would ask.
 *
 * The island says one thing by BECOMING the thing: the pill swells, speaks,
 * shrinks. That works for a hint nobody has to keep. A notification is the
 * other case — something actually happened, it may need an answer, and it has
 * to survive long enough to be read and acted on. So it is a card, it stacks,
 * and it waits. It is the one separate element in the corner, and the only
 * one, for that reason.
 *
 * They live directly above the chat pill rather than at the top of the screen,
 * because that corner is already where this product speaks from: the island,
 * the panel and these are three registers of one voice coming from one place.
 * A notice in the opposite corner would be a fourth stranger.
 *
 * THE STACK. Newest at the bottom, nearest the pill, because that is where the
 * eye already is — `.nf-stack` is `column-reverse`, so the newest child is
 * drawn last and sits lowest. Older ones are pushed up and folded behind the
 * ones in front. Arrival overshoots by 3px and returns: `needt-nf-in`, which
 * is how a hand slides a card onto a desk.
 */
import * as React from "react";

import { CornerButton, CornerIconButton } from "./controls";
import { CornerGlyph, type CornerGlyphName, CornerPlate } from "./glyphs";
import { useNoticeStack, useNotify } from "./notices";
import { foldAt, shown } from "./stack";
import type { Notice, NoticeAct, NoticeKind } from "./types";

/** One glyph and one tone per kind. The tone is a token, never a raw colour. */
export const NOTICE_KINDS: Readonly<
  Record<NoticeKind, { glyph: CornerGlyphName; tone: string }>
> = Object.freeze({
  placed: { glyph: "calendar-check", tone: "var(--accent)" },
  moved: { glyph: "move-right", tone: "var(--accent)" },
  risk: { glyph: "triangle-alert", tone: "var(--destructive)" },
  done: { glyph: "check", tone: "var(--success)" },
  agent: { glyph: "sparkles", tone: "var(--accent)" },
  person: { glyph: "user", tone: "var(--info)" },
  blocked: { glyph: "link", tone: "var(--destructive)" },
});

function NoticeCard({
  notice,
  depth,
  onAct,
  onClose,
}: {
  notice: Notice;
  depth: number;
  onAct: (notice: Notice, act: NoticeAct) => void;
  onClose: (id: string) => void;
}) {
  const kind = NOTICE_KINDS[notice.kind] ?? NOTICE_KINDS.agent;
  const fold = foldAt(depth);

  return (
    <div
      className={`nf-card${notice.leaving ? " is-out" : ""}`}
      style={{
        order: -depth,
        transform: `scale(${fold.scale})`,
        opacity: fold.opacity,
        pointerEvents: fold.interactive ? "auto" : "none",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 11,
          padding: "11px 11px 11px 12px",
        }}
      >
        <CornerPlate glyph={kind.glyph} tone={kind.tone} />
        <span
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          <span style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span
              style={{
                flex: 1,
                minWidth: 0,
                font: "var(--type-ui-medium)",
                color: "var(--text-primary)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {notice.title}
            </span>
            <span
              style={{
                flex: "none",
                font: "var(--type-meta)",
                color: "var(--text-disabled)",
              }}
            >
              {notice.when ?? "now"}
            </span>
          </span>
          <span
            style={{
              font: "var(--type-meta)",
              color: "var(--text-tertiary)",
              textWrap: "pretty",
            }}
          >
            {notice.body}
          </span>
          {notice.acts && notice.acts.length ? (
            <span style={{ display: "flex", gap: 6, paddingTop: 7 }}>
              {notice.acts.map((act, i) => (
                <CornerButton
                  key={act.label}
                  size="sm"
                  variant={i === 0 ? "flat" : "ghost"}
                  onClick={() => onAct(notice, act)}
                >
                  {act.label}
                </CornerButton>
              ))}
            </span>
          ) : null}
        </span>
        {/* `.nf-x` is invisible until the card is hovered: a dismiss is not
            one of the things a notice is offering to do. */}
        <span className="nf-x">
          <CornerIconButton
            label="Dismiss notification"
            variant="ghost"
            onClick={() => onClose(notice.id)}
          >
            <CornerGlyph name="x" size={13} />
          </CornerIconButton>
        </span>
      </div>
    </div>
  );
}

export interface NotificationStackProps {
  /** The shell hides the corner while the room belongs to something else. */
  hidden?: boolean;
  /** An act's `say`, handed on verbatim — the corner has one voice. */
  onSay?: (line: string) => void;
  /** An act's `go`: a screen the shell knows how to reach. */
  onGo?: (screen: string) => void;
}

export function NotificationStack({
  hidden,
  onSay,
  onGo,
}: NotificationStackProps) {
  const { notices, hold, release } = useNoticeStack();
  const { dismiss } = useNotify();

  function act(notice: Notice, action: NoticeAct) {
    dismiss(notice.id);
    if (action.say) onSay?.(action.say);
    if (action.go) onGo?.(action.go);
    action.run?.();
  }

  if (hidden || !notices.length) return null;

  const cards = shown(notices);
  /* A failure has to interrupt; everything else can wait for a pause. The
     region is one element for the whole stack, so the politeness is the
     loudest thing currently in it. */
  const urgent = cards.some((notice) => notice.kind === "risk");

  return (
    <div
      className="nf-stack"
      /* The companion keeps clear of this; a card it sat on top of could not
         be read or dismissed. The marker belongs on the stack, which is the
         size of the cards, not on the frame that anchors it. */
      data-assistant-avoid
      role="region"
      aria-label="Needt notifications"
      aria-live={urgent ? "assertive" : "polite"}
      aria-atomic="false"
      /* Hovering stops the dismiss clock. Reaching for a card is the clearest
         possible statement that you are not finished with it. */
      onMouseEnter={hold}
      onMouseLeave={release}
    >
      {cards.map((notice, i) => (
        <NoticeCard
          key={notice.id}
          notice={notice}
          depth={cards.length - 1 - i}
          onAct={act}
          onClose={dismiss}
        />
      ))}
    </div>
  );
}
