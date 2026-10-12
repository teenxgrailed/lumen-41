"use client";

import { type ReactNode, useRef, useState } from "react";

import { LuArrowUp } from "react-icons/lu";

import { clock, durLabel } from "@/lib/needt3/day";
import { addMinutes, hourOf, minutesBetween } from "@/lib/needt3/derive";
import { useCreateEvent } from "@/lib/needt3/hooks/events";

import { PkButton, PkField, PkSheet } from "../kit";
import { PovOpt } from "./parts";
import { snack } from "./snack";
import { type EventFacts, type NewEventDraft, usePhoneOverlays } from "./store";
import { event as copy } from "./strings";

export interface PkEventSheetProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  meta?: ReactNode;
  /** [label, value] pairs: Time, Length, Calendar, Overlaps. */
  facts?: readonly (readonly [string, string])[];
  /** `undefined` = a Done button; `null` = no footer. */
  footer?: ReactNode;
  children?: ReactNode;
}

/**
 * The event detail (phone-overlays.jsx `PkEventSheet`): a title, the day
 * line, and a list of facts. Read-only, as the prototype draws it.
 */
export function PkEventSheet({
  open,
  onClose,
  title,
  meta,
  facts,
  footer,
  children,
}: PkEventSheetProps) {
  return (
    <PkSheet
      open={open}
      onClose={onClose}
      title={title}
      meta={meta}
      className="pov-event"
      footer={
        footer !== undefined ? (
          footer
        ) : (
          <PkButton kind="primary" onClick={onClose}>
            {copy.done}
          </PkButton>
        )
      }
    >
      {facts && facts.length ? (
        <dl className="pov-evfacts">
          {facts.map(([k, v]) => (
            <div key={k} className="pov-evfact">
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {children}
    </PkSheet>
  );
}

/** The event detail against the overlay store (the last one stays drawn while it slides away). */
export function StoreEventSheet() {
  const event = usePhoneOverlays((s) => s.event);
  const close = usePhoneOverlays((s) => s.closeEvent);
  const held = useRef<EventFacts | null>(null);
  if (event) held.current = event;
  const e = event ?? held.current;
  return (
    <PkEventSheet
      open={!!event}
      onClose={close}
      title={e?.title ?? ""}
      meta={e?.meta ?? null}
      facts={e?.facts ?? []}
    />
  );
}

const LENGTHS = [15, 30, 45, 60, 90, 120] as const;

export interface PkNewEventSheetProps {
  open: boolean;
  onClose: () => void;
  /** The slot that was tapped: local "YYYY-MM-DDTHH:mm" stamps. */
  draft: NewEventDraft | null;
}

/**
 * A new event from a tapped slot, written through `useCreateEvent` (it picks
 * a Needt calendar, or makes one named "Needt", so there is always somewhere
 * to write; synced provider calendars are read-only from v3). Says so with an
 * Undo once it is made.
 */
export function PkNewEventSheet({
  open,
  onClose,
  draft,
}: PkNewEventSheetProps) {
  const createEvent = useCreateEvent();
  const held = useRef<NewEventDraft | null>(null);
  if (draft) held.current = draft;
  const d = draft ?? held.current;
  const [title, setTitle] = useState("");
  const [minutes, setMinutes] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  if (!d) return null;
  const length = minutes ?? Math.max(15, minutesBetween(d.startAt, d.endAt));
  const startAt = d.startAt;
  const endAt = addMinutes(startAt, length) ?? d.endAt;
  const h = hourOf(startAt);

  const add = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { undo } = await createEvent({
        title: title.trim() || d.title || "New event",
        startAt,
        endAt,
        isAllDay: false,
      });
      onClose();
      snack("Event added", undo);
    } catch {
      // useCreateEvent has said so.
    } finally {
      setBusy(false);
    }
  };

  return (
    <PkSheet
      open={open}
      onClose={onClose}
      onShut={() => {
        setTitle("");
        setMinutes(null);
      }}
      title="New event"
      meta={`${startAt.slice(0, 10)}${h != null ? ` · ${clock(h)}` : ""}`}
      className="pov-event"
      footer={
        <PkButton
          kind="primary"
          icon={<LuArrowUp size={18} />}
          disabled={busy}
          onClick={() => void add()}
          data-pov-add-event=""
        >
          Add
        </PkButton>
      }
    >
      <PkField
        id="pov-event-title"
        value={title}
        onChange={setTitle}
        placeholder={d.title || "New event"}
        inputProps={{ "aria-label": "Title" }}
      />
      <div className="pov-opts" data-pov-lengths="">
        {LENGTHS.map((m) => (
          <PovOpt key={m} on={length === m} onClick={() => setMinutes(m)}>
            {durLabel(m)}
          </PovOpt>
        ))}
      </div>
    </PkSheet>
  );
}

/** The new-event sheet against the overlay store. */
export function StoreNewEventSheet() {
  const draft = usePhoneOverlays((s) => s.newEvent);
  const close = usePhoneOverlays((s) => s.closeNewEvent);
  return <PkNewEventSheet open={!!draft} onClose={close} draft={draft} />;
}
