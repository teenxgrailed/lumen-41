"use client";

import { useEffect, useId, useMemo, useState } from "react";

import {
  LuCalendarDays,
  LuCheck,
  LuClock,
  LuLoaderCircle,
} from "react-icons/lu";

type Slot = { start: string; end: string };

export function BookingForm({
  slug,
  timeZone,
}: {
  slug: string;
  timeZone: string;
}) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameId = useId();
  const emailId = useId();

  useEffect(() => {
    void fetch(`/api/public/booking/${encodeURIComponent(slug)}/slots`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load availability");
        return response.json() as Promise<{ slots: Slot[] }>;
      })
      .then((data) => setSlots(data.slots))
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  }, [slug]);

  const grouped = useMemo(() => {
    return slots.reduce<Record<string, Slot[]>>((days, slot) => {
      const key = new Intl.DateTimeFormat(undefined, {
        weekday: "long",
        month: "short",
        day: "numeric",
        timeZone,
      }).format(new Date(slot.start));
      (days[key] ??= []).push(slot);
      return days;
    }, {});
  }, [slots, timeZone]);

  async function submit() {
    if (!selected || !name.trim() || !email.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/public/booking/${encodeURIComponent(slug)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: JSON.stringify({
            guestName: name,
            guestEmail: email,
            start: selected,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          }),
        }
      );
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Booking failed");
      setConfirmed(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Booking failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (confirmed) {
    return (
      <div className="pub-card pub-book-done">
        <span className="pub-book-done-mark">
          <LuCheck size={18} aria-hidden />
        </span>
        <h2 className="pub-card-title pub-book-done-title">You’re booked</h2>
        <p className="pub-lead">A confirmation has been sent to {email}.</p>
      </div>
    );
  }

  return (
    <div className="pub-book-grid">
      <div className="pub-card">
        <div className="pub-book-head">
          <LuCalendarDays size={14} aria-hidden /> Choose a time
        </div>
        {loading ? (
          <LuLoaderCircle size={18} className="pub-spin pub-book-loading" />
        ) : (
          <div className="pub-book-days">
            {Object.entries(grouped).map(([day, daySlots]) => (
              <section key={day}>
                <h3 className="pub-book-day">{day}</h3>
                <div className="pub-book-slots">
                  {daySlots.map((slot) => (
                    <button
                      key={slot.start}
                      type="button"
                      onClick={() => setSelected(slot.start)}
                      aria-pressed={selected === slot.start}
                      className={`nx-btn nx-btn-secondary pub-book-slot${
                        selected === slot.start ? " nx-selected" : ""
                      }`}
                    >
                      {new Intl.DateTimeFormat(undefined, {
                        hour: "numeric",
                        minute: "2-digit",
                        timeZone,
                      }).format(new Date(slot.start))}
                    </button>
                  ))}
                </div>
              </section>
            ))}
            {slots.length === 0 && (
              <p className="pub-meta pub-book-empty">
                No available times in the next two weeks.
              </p>
            )}
          </div>
        )}
      </div>
      <aside className="pub-card pub-book-aside">
        <div className="pub-book-head">
          <LuClock size={14} aria-hidden /> Your details
        </div>
        <div className="nt-form">
          <div className="nt-row">
            <label className="nt-row-label" htmlFor={nameId}>
              Name
            </label>
            <div className="nt-row-control">
              <input
                id={nameId}
                className="nt-input"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Your name"
                autoComplete="name"
              />
            </div>
          </div>
          <div className="nt-row">
            <label className="nt-row-label" htmlFor={emailId}>
              Email
            </label>
            <div className="nt-row-control">
              <input
                id={emailId}
                className="nt-input"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                type="email"
                autoComplete="email"
              />
            </div>
          </div>
          {error && (
            <p className="pub-error" role="alert">
              {error}
            </p>
          )}
          <button
            type="button"
            className="nx-btn nx-btn-primary pub-book-submit"
            disabled={!selected || !name.trim() || !email.trim() || submitting}
            onClick={submit}
          >
            {submitting && (
              <LuLoaderCircle size={14} className="pub-spin" aria-hidden />
            )}
            Confirm booking
          </button>
          <p className="pub-meta">
            Times are shown in {timeZone}. The slot is checked again before it
            is confirmed.
          </p>
        </div>
      </aside>
    </div>
  );
}
