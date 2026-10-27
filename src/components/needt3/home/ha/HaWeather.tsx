"use client";

import { useEffect, useId, useRef, useState } from "react";

export interface HaWxDetail {
  /** The saved city. */
  place: string;
  /** "Partly cloudy". */
  summary: string;
  /** Label / value pairs: feels like, high and low, rain, wind, sun. */
  rows: { k: string; v: string }[];
  /** The next few hours. */
  hours: { time: string; ic: string; t: string }[];
}

export interface HaWx {
  /** The weather emoji. */
  ic?: string;
  /** "12°" */
  t?: string;
  /** "light rain" */
  d?: string;
  /** "10:00": the first event of the day, when there is one. */
  first?: string;
  /** The card that opens on hover or focus. */
  detail?: HaWxDetail;
}

/**
 * 9 - weather and the first event on one line: under the brief on the phone,
 * top right on desktop. Whichever half is known is shown, nothing is shown for
 * neither. There is no "leave by": Needt has no real travel time.
 *
 * The weather half opens a card on hover or keyboard focus (tap on a touch
 * screen): feels like, high and low, rain, wind, sunrise and sunset and the
 * next few hours. Esc closes it.
 */
export function HaWeather({ wx }: { wx: HaWx | null | undefined }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const detail = wx?.detail;

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  if (!wx || (!wx.t && !wx.first)) return null;

  const main = wx.t ? (
    <>
      {wx.ic ? (
        <span className="ha-wx-ic" aria-hidden="true">
          {wx.ic}
        </span>
      ) : null}
      <b>{wx.t}</b>
      {wx.d}
    </>
  ) : null;

  return (
    <div
      ref={root}
      className="ha-wx"
      data-ha-wx=""
      onMouseEnter={() => detail && setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          setOpen(false);
        }
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null))
          setOpen(false);
      }}
    >
      {main && detail ? (
        <button
          type="button"
          className="ha-wx-btn"
          aria-expanded={open}
          aria-controls={id}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
        >
          {main}
        </button>
      ) : (
        main
      )}
      {wx.t && wx.first ? <i /> : null}
      {wx.first ? <>first event {wx.first}</> : null}
      {detail && open ? (
        <div
          id={id}
          className="ha-wx-card"
          role="group"
          aria-label={`Weather in ${detail.place}`}
          data-ha-wx-card=""
        >
          <div className="ha-wx-card-head">
            <b>{detail.place}</b>
            <span>{detail.summary}</span>
          </div>
          <dl className="ha-wx-card-rows">
            {detail.rows.map((r) => (
              <div key={r.k}>
                <dt>{r.k}</dt>
                <dd>{r.v}</dd>
              </div>
            ))}
          </dl>
          {detail.hours.length ? (
            <ol className="ha-wx-card-hours" aria-label="Next hours">
              {detail.hours.map((h) => (
                <li key={h.time}>
                  <span>{h.time}</span>
                  {h.ic ? <span aria-hidden="true">{h.ic}</span> : null}
                  <b>{h.t}</b>
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
