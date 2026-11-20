"use client";

import type { CSSProperties, ReactNode } from "react";

import type { MenuTile } from "@/lib/phone-menu/layout";

import { DocThumb, useDocTokens } from "../../../docs/DocParts";
import { Glyph } from "../../../glyphs/Glyph";
import { pkCx } from "../../kit/util";
import { Swap, pages } from "./Swap";
import type { DayEvent, TileFacts, TileView } from "./model";

/**
 * What a tile draws: the object itself in miniature, from the user's own data
 * (the next tasks, today's habits, the latest mail, the last document...),
 * under the tile's one name. The faces take their size from the tile (a wide
 * tile just has more room) and move only through <Swap>.
 */

/** Hours the day strip spans: 07:00 to 22:00. */
const STRIP_FROM = 7 * 60;
const STRIP_TO = 22 * 60;

function Top({
  name,
  meta,
  alert,
}: {
  name: string;
  meta?: string | null;
  alert?: boolean;
}) {
  return (
    <div className="ntm-top">
      <span className="ntm-name">{name}</span>
      {meta ? (
        <span className={pkCx("ntm-meta", alert && "is-alert")}>{meta}</span>
      ) : null}
    </div>
  );
}

const Skel = ({ n = 3 }: { n?: number }) => (
  <div className="ntm-skel" aria-hidden="true">
    {Array.from({ length: n }, (_, i) => (
      <span key={i} style={{ width: `${88 - i * 18}%` }} />
    ))}
  </div>
);

const Empty = ({ children }: { children: ReactNode }) => (
  <p className="ntm-none">{children}</p>
);

/** The focus tile's ring: the accent is the ring's mark, never a fill. */
export function FocusRing({
  pct,
  paused,
  children,
}: {
  pct: number;
  paused: boolean;
  children?: ReactNode;
}) {
  const R = 27;
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
          strokeWidth="4"
        />
        <circle
          cx="34"
          cy="34"
          r={R}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - Math.max(pct, 0.001))}
          transform="rotate(-90 34 34)"
        />
      </svg>
      <span className="ntm-ring-n">{children}</span>
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

function DocsFace({
  facts,
  offset,
  active,
}: {
  facts: TileFacts;
  offset: number;
  active: boolean;
}) {
  const read = useDocTokens();
  const docs = facts.docs;
  return (
    <>
      <Top
        name="Docs"
        meta={facts.counts.docs ? `${facts.counts.docs}` : null}
      />
      {docs === undefined ? (
        <Skel />
      ) : docs.length === 0 ? (
        <Empty>No pages yet</Empty>
      ) : (
        <Swap
          className="ntm-fill"
          items={docs}
          offset={offset}
          active={active}
          render={(d) => (
            <div className="ntm-doc">
              <DocThumb doc={d} read={read} w={74} h={86} />
              <span className="ntm-doc-t">
                <span className="ntm-txt ntm-strong">
                  {d.title || "Untitled"}
                </span>
                <span className="ntm-sub">
                  {facts.docsAgo?.get(d.id)
                    ? `edited ${facts.docsAgo.get(d.id)}`
                    : ""}
                </span>
              </span>
            </div>
          )}
        />
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
  const c = facts.counts;
  switch (tile.id) {
    case "today": {
      const rows = facts.today;
      const meta = c.overdue
        ? `${c.overdue} overdue`
        : c.today !== undefined
          ? `${c.today} left`
          : null;
      return (
        <>
          <Top name="Today" meta={meta} alert={!!c.overdue} />
          {rows === undefined ? (
            <Skel />
          ) : rows.length === 0 ? (
            <Empty>Nothing planned</Empty>
          ) : (
            <Swap
              items={pages(rows, 3)}
              offset={offset}
              active={active}
              render={(pg) => (
                <ul className="ntm-rows">
                  {pg.map((r, i) => (
                    <li key={i}>
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
          <Top name="Focus" />
          <div className="ntm-focus">
            <FocusRing pct={f?.pct ?? 0} paused={!!f?.paused}>
              {f ? f.label.replace(" min", "") : "25"}
            </FocusRing>
            <span className="ntm-focus-t">
              <span className="ntm-txt ntm-strong">
                {f ? (f.paused ? "Paused" : "Time left") : "Start"}
              </span>
              <span className="ntm-sub">
                {f
                  ? /:/.test(f.label)
                    ? "elapsed"
                    : "minutes"
                  : "25 min session"}
              </span>
            </span>
          </div>
        </>
      );
    }
    case "calendar": {
      const ev = facts.events;
      return (
        <>
          <Top name="Calendar" />
          {ev === undefined ? (
            <Skel n={2} />
          ) : ev.length === 0 ? (
            <div className="ntm-next">
              <span className="ntm-big">Free</span>
              <span className="ntm-sub">Nothing else today</span>
            </div>
          ) : (
            <Swap
              items={ev.slice(0, 3)}
              offset={offset}
              active={active}
              render={(e) => (
                <div className="ntm-next">
                  <span className="ntm-big">{e.at}</span>
                  <span className="ntm-txt">{e.title}</span>
                </div>
              )}
            />
          )}
          {ev ? <DayStrip events={ev} nowMin={facts.nowMin ?? 0} /> : null}
        </>
      );
    }
    case "habits": {
      const rows = facts.habitRows;
      const done = rows?.filter((h) => h.done).length ?? 0;
      return (
        <>
          <Top
            name="Habits"
            meta={rows && rows.length ? `${done} of ${rows.length}` : null}
          />
          {rows === undefined ? (
            <Skel />
          ) : rows.length === 0 ? (
            <Empty>No habits yet</Empty>
          ) : (
            <Swap
              items={pages(rows, 4)}
              offset={offset}
              active={active}
              render={(pg) => (
                <ul className="ntm-rows">
                  {pg.map((h) => (
                    <li key={h.id}>
                      <span
                        className="ntm-dot"
                        data-done={h.done ? "" : undefined}
                        style={
                          h.color
                            ? ({ "--dot": h.color } as CSSProperties)
                            : undefined
                        }
                      />
                      <span className="ntm-txt">{h.title}</span>
                    </li>
                  ))}
                </ul>
              )}
            />
          )}
        </>
      );
    }
    case "inbox": {
      const titles = facts.inboxTitles;
      return (
        <>
          <Top name="Inbox" />
          {c.unplaced === undefined || titles === undefined ? (
            <Skel n={2} />
          ) : c.unplaced === 0 ? (
            <div className="ntm-next">
              <span className="ntm-big">Clear</span>
              <span className="ntm-sub">Everything has a time</span>
            </div>
          ) : (
            <>
              <span className="ntm-big">{c.unplaced}</span>
              <Swap
                items={titles}
                offset={offset}
                active={active}
                render={(t) => <span className="ntm-txt">{t}</span>}
              />
            </>
          )}
        </>
      );
    }
    case "mail": {
      const rows = facts.mailRows;
      return (
        <>
          <Top
            name="Mail"
            meta={c.mail ? `${c.mail} unread` : null}
            alert={false}
          />
          {rows === undefined ? (
            <Skel />
          ) : rows.length === 0 ? (
            <Empty>No mail</Empty>
          ) : (
            <Swap
              items={rows}
              offset={offset}
              active={active}
              render={(m) => (
                <div className="ntm-mail">
                  <span className="ntm-txt ntm-strong">{m.from}</span>
                  <span className="ntm-txt">{m.subject}</span>
                  <span className="ntm-sub ntm-clamp">{m.preview}</span>
                </div>
              )}
            />
          )}
        </>
      );
    }
    case "docs":
      return <DocsFace facts={facts} offset={offset} active={active} />;
    case "ask":
      return (
        <>
          <Top name="Ask Needt" />
          <span className="ntm-ask">
            <Glyph name="ai" size={20} />
            <span className="ntm-sub">Ask anything about your day</span>
          </span>
        </>
      );
    case "streak": {
      const n = facts.streak;
      return (
        <>
          <Top name="Streak" />
          {n === undefined ? (
            <Skel n={2} />
          ) : (
            <span className="ntm-big">
              {n} {n === 1 ? "day" : "days"}
            </span>
          )}
          <span className="ntm-week" aria-hidden="true">
            {(
              facts.week ?? Array.from({ length: 7 }, () => "quiet" as const)
            ).map((s, i) => (
              <span key={i} className="ntm-wd" data-s={s} />
            ))}
          </span>
        </>
      );
    }
    case "project": {
      const p = tile.projectId ? facts.projects.get(tile.projectId) : undefined;
      const titles = p?.titles ?? [];
      return (
        <div className="ntm-folder">
          {p ? (
            titles.length ? (
              <Swap
                className="ntm-papers-swap"
                items={pages(titles, 3)}
                offset={offset}
                active={active}
                render={(pg) => (
                  <div className="ntm-papers">
                    {pg.map((t, i) => (
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
              />
            ) : (
              <div className="ntm-papers">
                <span
                  className="ntm-paper"
                  style={{ "--pi": 0 } as CSSProperties}
                >
                  <span className="ntm-txt">Nothing open</span>
                </span>
              </div>
            )
          ) : null}
          <span className="ntm-flap">
            <span className="ntm-name">{view.name}</span>
            {p ? <span className="ntm-meta">{p.open} open</span> : null}
          </span>
        </div>
      );
    }
  }
}
