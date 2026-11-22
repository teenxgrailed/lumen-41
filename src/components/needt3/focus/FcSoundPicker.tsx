"use client";

/* The sound picker on the running screens, desktop and phone: one chip that
   names the current sound, and a small panel of radio rows (noise first, then
   the lo-fi tracks). It plays nothing itself: it only reports the pick, and
   `useFocusSound` in the host does the playing, so a pick is heard at once and
   survives the window closing. Hidden where the browser has no Web Audio. */
import { useEffect, useRef, useState } from "react";

import { LuAudioLines, LuCheck, LuMusic, LuVolumeX } from "react-icons/lu";

import { SOUNDS, type Sound } from "@/lib/needt3/focus";
import { canPlaySound } from "@/lib/needt3/focus-audio";

import { SOUND_LABEL, soundGroups, soundNames } from "./strings";

const GROUPS: readonly { id: string; label: string | null; items: Sound[] }[] =
  [
    { id: "off", label: null, items: ["off"] },
    {
      id: "noise",
      label: soundGroups.noise,
      items: SOUNDS.filter((s) => s === "brown" || s === "pink"),
    },
    {
      id: "lofi",
      label: soundGroups.lofi,
      items: SOUNDS.filter((s) => s.startsWith("lofi-")),
    },
  ];

export function SoundGlyph({
  sound,
  size = 14,
}: {
  sound: Sound;
  size?: number;
}) {
  if (sound === "off") return <LuVolumeX size={size} aria-hidden="true" />;
  if (sound === "brown" || sound === "pink")
    return <LuAudioLines size={size} aria-hidden="true" />;
  return <LuMusic size={size} aria-hidden="true" />;
}

export function FcSoundPicker({
  sound,
  onPick,
  placement = "up",
  open: openProp,
  onOpenChange,
  inline = false,
}: {
  sound: Sound;
  onPick: (s: Sound) => void;
  /** Which way the panel opens from the chip. */
  placement?: "up" | "down";
  /** Optional control from outside (the phone shots open it by hand). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** The rows only, always shown (the setup card), with no chip. */
  inline?: boolean;
}) {
  const [inner, setInner] = useState(false);
  const open = openProp ?? inner;
  const setOpen = (v: boolean) => {
    setInner(v);
    onOpenChange?.(v);
  };
  const root = useRef<HTMLDivElement>(null);
  const setRef = useRef(setOpen);
  setRef.current = setOpen;
  // Hidden until mounted: whether Web Audio exists is a client fact.
  const [can, setCan] = useState(false);
  useEffect(() => setCan(canPlaySound()), []);

  useEffect(() => {
    if (!open) return undefined;
    const down = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setRef.current(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setRef.current(false);
    };
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  if (!can) return null;
  const panel = (
    <div
      className={"fc-snd-panel" + (inline ? " is-inline" : "")}
      role="radiogroup"
      aria-label={SOUND_LABEL}
      data-fc-sound-panel={inline ? undefined : ""}
    >
      {GROUPS.map((g) => (
        <div className="fc-snd-group" key={g.id}>
          {g.label ? <span className="fc-snd-label">{g.label}</span> : null}
          {g.items.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={sound === s}
              className={"fc-snd-row" + (sound === s ? " is-on" : "")}
              onClick={() => onPick(s)}
              data-fc-sound-row={s}
            >
              <SoundGlyph sound={s} />
              <span className="fc-snd-name">{soundNames[s]}</span>
              {sound === s ? <LuCheck size={14} aria-hidden="true" /> : null}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
  if (inline) return panel;
  return (
    <div className="fc-snd" ref={root} data-placement={placement}>
      <button
        type="button"
        className="px-chip-btn fc-chip"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`${SOUND_LABEL}: ${soundNames[sound]}`}
        onClick={() => setOpen(!open)}
        data-fc-sound={sound}
      >
        <SoundGlyph sound={sound} />
        {soundNames[sound]}
      </button>
      {open ? panel : null}
    </div>
  );
}
