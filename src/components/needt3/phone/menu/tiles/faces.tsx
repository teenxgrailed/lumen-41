"use client";

import type { CSSProperties, ReactNode } from "react";

import type { MenuTile } from "@/lib/phone-menu/layout";

import { DocThumb, useDocTokens } from "../../../docs/DocParts";
import { Glyph } from "../../../glyphs/Glyph";
import { initialsOf } from "../../../shell/Avatar";
import { pkCx } from "../../kit/util";
import { Swap, pages } from "./Swap";
import type { DayEvent, TileFacts, TileView } from "./model";

/**
 * What a tile draws (owner ref 2026-11-21, menu-tiles-2011/ref-tiles-profile):
 * top left a small grey category, under it the big live value or name, under
 * that one grey line of detail; below, a real object of the thing (a ring with
 * its pause button, habit dots, an event chip, a folder with its papers),
 * glowing in its own colour from a corner (the CSS, never the accent). The
 * category is never the title again. Faces take their size from the tile and
 * move only through <Swap>.
 */

/** Hours the day strip spans: 07:00 to 22:00. */
const STRIP_FROM = 7 * 60;
const STRIP_TO = 22 * 60;

/** The three lines at the top of every tile. */
function Lines({ view }: { view: TileView }) {
  const n = view.word.length;
  return (
    <div className="ntm-lines">
      <span className="ntm-kind">{view.label}</span>
      <span className="ntm-title" data-fit={n > 12 ? "s" : n > 8 ? "m" : "l"}>
        {view.word}
      </span>
      <span className={pkCx("ntm-sub", view.alert && "is-alert")}>
        {view.sub}
      </span>
    </div>
  );
}

const Skel = ({ n = 2 }: { n?: number }) => (
  <div className="ntm-obj ntm-skel" aria-hidden="true">
    {Array.from({ length: n }, (_, i) => (
      <span key={i} style={{ width: `${92 - i * 22}%` }} />
    ))}
  </div>
);

const Empty = ({ children }: { children: ReactNode }) => (
  <p className="ntm-obj ntm-none">{children}</p>
);

/** The focus ring: the accent is the arc's mark, never a fill. */
export function FocusRing({
  pct,
  paused,
  running,
}: {
  pct: number;
  paused: boolean;
  running: boolean;
}) {
  const R = 29;
  const C = 2 * Math.PI * R;
  return (
    <span className={pkCx("ntm-ring", paused && "is-paused")}>
      <svg width="68" height="68" viewBox="0 0 68 68" aria-hidden="true">
        <circle
          cx="34"
          cy="34"
          r={R}
          fill="none"
          stroke="var(--v2p-line)"
          strokeWidth="3.5"
        />
        <circle
          cx="34"
          cy="34"
          r={R}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - pct)}
          opacity={pct > 0 ? 1 : 0}
          transform="rotate(-90 34 34)"
        />
        {running ? (
          <g fill="var(--v2p-ink)">
            <rect x="27" y="25" width="4.5" height="18" rx="1.6" />
            <rect x="36.5" y="25" width="4.5" height="18" rx="1.6" />
          </g>
        ) : (
          <path
            d="M29 25.5v17a1.6 1.6 0 0 0 2.4 1.4l14-8.5a1.6 1.6 0 0 0 0-2.8l-14-8.5A1.6 1.6 0 0 0 29 25.5z"
            fill="var(--v2p-ink)"
          />
        )}
      </svg>
    </span>
  );
}

function DayStrip({ events, nowMin }: { events: DayEvent[]; nowMin: number }) {
  const span = STRIP_TO - STRIP_FROM;
  const pos = (m: number) =>
    `${Math.min(100, Math.max(0, ((m - STRIP_FROM) / span) * 100))}%`;
  return (
    <span className="ntm-strip" aria-hidden="true">
      {events.map((e, i) => (
        <span
          key={i}
          className="ntm-strip-ev"
          style={
            {
              left: pos(e.start),
              width: `max(4px, calc(${pos(Math.min(e.end, STRIP_TO))} - ${pos(e.start)}))`,
            } as CSSProperties
          }
        />
      ))}
      {nowMin >= STRIP_FROM && nowMin <= STRIP_TO ? (
        <span className="ntm-strip-now" style={{ left: pos(nowMin) }} />
      ) : null}
    </span>
  );
}

function Flame({ n }: { n: number }) {
  return (
    <span className="ntm-flame" aria-hidden="true">
      <svg width="54" height="64" viewBox="0 0 54 64">
        <defs>
          <linearGradient id="ntm-flame-g" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="oklch(0.82 0.16 70)" />
            <stop offset="1" stopColor="oklch(0.66 0.2 35)" />
          </linearGradient>
        </defs>
        <path
          d="M27 2c3 11 18 18 18 36 0 12-8 22-18 22S9 50 9 38c0-7 4-11 7-15 1 5 4 8 7 9-2-11-1-22 4-30z"
          fill="url(#ntm-flame-g)"
        />
      </svg>
      <span className="ntm-flame-n">{n}</span>
    </span>
  );
}

function DocsFace({ view, facts }: { view: TileView; facts: TileFacts }) {
  const read = useDocTokens();
  const docs = facts.docs;
  return (
    <>
      <Lines view={view} />
      {docs === undefined ? (
        <Skel />
      ) : docs.length === 0 ? (
        <Empty>No pages yet</Empty>
      ) : (
        <div className="ntm-obj ntm-pages" aria-hidden="true">
          {docs
            .slice(0, 2)
            .reverse()
            .map((d, i, a) => (
              <span
                key={d.id}
                className="ntm-page"
                data-front={i === a.length - 1 ? "" : undefined}
              >
                <DocThumb doc={d} read={read} w={50} h={62} />
              </span>
            ))}
        </div>
      )}
    </>
  );
}

export function TileFace({
  tile,
  view,
  facts,
  offset,
  active,
}: {
  tile: MenuTile;
  view: TileView;
  facts: TileFacts;
  offset: number;
  active: boolean;
}) {
  switch (tile.id) {
    case "today": {
      const rows = facts.today;
      return (
        <>
          <Lines view={view} />
          {rows === undefined ? (
            <Skel />
          ) : rows.length === 0 ? (
            <Empty>Nothing planned</Empty>
          ) : (
            <Swap
              className="ntm-obj"
              items={pages(rows, 2)}
              offset={offset}
              active={active}
              render={(pg) => (
                <ul className="ntm-chips-col">
                  {pg.map((r, i) => (
                    <li key={i} className="ntm-chip-row">
                      <span className="ntm-check" aria-hidden="true" />
                      <span className="ntm-time">{r.time ?? "any"}</span>
                      <span className="ntm-txt">{r.title}</span>
                    </li>
                  ))}
                </ul>
              )}
            />
          )}
        </>
      );
    }
    case "focus": {
      const f = facts.focus;
      return (
        <>
          <Lines view={view} />
          <span className="ntm-obj ntm-focus">
            <FocusRing
              pct={f?.pct ?? 0}
              paused={!!f?.paused}
              running={!!f && !f.paused}
            />
          </span>
        </>
      );
    }
    case "calendar": {
      const ev = facts.events;
      const later = ev?.slice(1, 3) ?? [];
      return (
        <>
          <Lines view={view} />
          {ev === undefined ? (
            <Skel />
          ) : (
            <div className="ntm-obj ntm-cal">
              {later.length ? (
                <ul className="ntm-chips-col">
                  {later.map((e, i) => (
                    <li key={i} className="ntm-chip-row is-event">
                      <span className="ntm-evbar" aria-hidden="true" />
                      <span className="ntm-time">{e.at}</span>
                      <span className="ntm-txt">{e.title}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              <DayStrip events={ev} nowMin={facts.nowMin ?? 0} />
            </div>
          )}
        </>
      );
    }
    case "habits": {
      const rows = facts.habitRows;
      return (
        <>
          <Lines view={view} />
          {rows === undefined ? (
            <Skel n={1} />
          ) : rows.length === 0 ? (
            <Empty>No habits yet</Empty>
          ) : (
            <div className="ntm-obj ntm-stack" aria-hidden="true">
              {rows.slice(0, 4).map((h) => (
                <span
                  key={h.id}
                  className="ntm-av"
                  data-done={h.done ? "" : undefined}
                  style={
                    h.color
                      ? ({ "--dot": h.color } as CSSProperties)
                      : undefined
                  }
                >
                  {h.done ? (
                    <svg width="14" height="14" viewBox="0 0 14 14">
                      <path
                        d="M3 7.4l2.5 2.5L11 4.3"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : null}
                </span>
              ))}
              {rows.length > 4 ? (
                <span className="ntm-av is-more">+{rows.length - 4}</span>
              ) : null}
            </div>
          )}
        </>
      );
    }
    case "inbox": {
      const titles = facts.inboxTitles;
      return (
        <>
          <Lines view={view} />
          {facts.counts.unplaced === undefined || titles === undefined ? (
            <Skel />
          ) : titles.length === 0 ? (
            <Empty>Everything has a time</Empty>
          ) : (
            <div className="ntm-obj ntm-papers-col" aria-hidden="true">
              {titles.slice(0, 2).map((t, i) => (
                <span
                  key={i}
                  className="ntm-paper"
                  style={{ "--pi": i } as CSSProperties}
                >
                  <span className="ntm-txt">{t}</span>
                </span>
              ))}
            </div>
          )}
        </>
      );
    }
    case "mail": {
      const rows = facts.mailRows;
      return (
        <>
          <Lines view={view} />
          {rows === undefined ? (
            <Skel />
          ) : rows.length === 0 ? (
            <Empty>No mail</Empty>
          ) : (
            <Swap
              className="ntm-obj"
              items={rows}
              offset={offset}
              active={active}
              render={(m) => (
                <div className="ntm-mail">
                  <span
                    className="ntm-av is-sm"
                    data-unread={m.unread ? "" : undefined}
                  >
                    {initialsOf(m.from)}
                  </span>
                  <span className="ntm-mail-t">
                    <span className="ntm-txt ntm-strong">{m.from}</span>
                    <span className="ntm-txt ntm-soft">{m.subject}</span>
                  </span>
                </div>
              )}
            />
          )}
        </>
      );
    }
    case "docs":
      return <DocsFace view={view} facts={facts} />;
    case "ask":
      return (
        <>
          <Lines view={view} />
          <span className="ntm-obj ntm-ask" aria-hidden="true">
            <Glyph name="ai" size={18} />
            <span className="ntm-txt">Ask anything about your day</span>
            <span className="ntm-send">
              <svg width="14" height="14" viewBox="0 0 14 14">
                <path
                  d="M7 11.5V3M3.2 6.6L7 2.8l3.8 3.8"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </span>
        </>
      );
    case "streak": {
      const n = facts.streak;
      return (
        <>
          <Lines view={view} />
          <span className="ntm-obj ntm-streak" aria-hidden="true">
            <span className="ntm-week">
              {(
                facts.week ?? Array.from({ length: 7 }, () => "quiet" as const)
              ).map((s, i) => (
                <span key={i} className="ntm-wd" data-s={s} />
              ))}
            </span>
            {n === undefined ? null : <Flame n={n} />}
          </span>
        </>
      );
    }
    case "project": {
      const p = tile.projectId ? facts.projects.get(tile.projectId) : undefined;
      const titles = p?.titles ?? [];
      return (
        <>
          <Lines view={view} />
          <span className="ntm-obj ntm-folder" aria-hidden="true">
            {p ? (
              titles.length ? (
                <Swap
                  className="ntm-papers-swap"
                  items={pages(titles, 2)}
                  offset={offset}
                  active={active}
                  render={(pg) => (
                    <span className="ntm-papers">
                      {pg.map((t, i) => (
                        <span
                          key={i}
                          className="ntm-paper"
                          style={{ "--pi": i } as CSSProperties}
                        >
                          <span className="ntm-txt">{t}</span>
                        </span>
                      ))}
                    </span>
                  )}
                />
              ) : null
            ) : null}
            <span className="ntm-fbody" />
          </span>
        </>
      );
    }
  }
}
