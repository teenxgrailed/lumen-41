"use client";

import { useEffect, useState } from "react";

import { newDate } from "@/lib/date-utils";

type Gift = { id: string; months: number; note: string | null; endsAt: string };

const lengthWords = (months: number) =>
  months === 12 ? "a year" : months === 1 ? "1 month" : `${months} months`;

/** "5 February 2027", the same in every browser. */
const longDate = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(newDate(iso));

/**
 * The gift screen: shown once, the first time the app opens after an admin
 * gave the person Pro. Plain words, no price, nothing to accept or cancel.
 * Motion is a short fade and is switched off for reduced motion.
 */
export function GiftWelcome() {
  const [gift, setGift] = useState<Gift | null>(null);

  useEffect(() => {
    let alive = true;
    try {
      void Promise.resolve(fetch("/api/gift"))
        .then((res) => (res && res.ok ? res.json() : null))
        .then((data: { gift: Gift | null } | null) => {
          if (alive && data?.gift) setGift(data.gift);
        })
        .catch(() => undefined);
    } catch {
      /* No network layer: no screen. */
    }
    return () => {
      alive = false;
    };
  }, []);

  if (!gift) return null;

  function close() {
    const id = gift?.id;
    setGift(null);
    if (!id) return;
    void Promise.resolve(
      fetch("/api/gift", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      })
    ).catch(() => undefined);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="gift-title"
      data-assistant-avoid
      className="gift-welcome"
    >
      <div className="gift-card">
        <h2 id="gift-title">A gift for you</h2>
        <p>
          We gave you {lengthWords(gift.months)} of Pro, until{" "}
          {longDate(gift.endsAt)}.
        </p>
        {gift.note ? <p className="gift-note">{gift.note}</p> : null}
        <p className="gift-muted">No card, nothing to cancel.</p>
        <button
          type="button"
          className="nx-btn nx-btn-secondary"
          onClick={close}
        >
          Start using Pro
        </button>
      </div>
      <style>{`
.gift-welcome{position:fixed;inset:0;z-index:2000;display:grid;place-items:center;background:rgba(0,0,0,.4);padding:16px;animation:gift-in .2s ease-out}
.gift-card{max-width:360px;width:100%;box-sizing:border-box;padding:20px;border-radius:12px;background:var(--bg-1,#fffdf9);color:inherit;font-size:13px;line-height:1.5}
.gift-card h2{margin:0 0 8px;font-size:13px;font-weight:600}
.gift-card p{margin:0 0 8px}
.gift-card .gift-muted{opacity:.6;font-size:12px}
.gift-card .gift-note{padding:8px 10px;border-radius:8px;background:rgba(127,127,127,.12)}
.gift-card button{margin-top:8px}
@keyframes gift-in{from{opacity:0}to{opacity:1}}
@media (prefers-reduced-motion:reduce){.gift-welcome{animation:none}}
      `}</style>
    </div>
  );
}
