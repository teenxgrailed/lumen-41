"use client";

import { useEffect, useRef, useState } from "react";

import type { V3BoardItem } from "@/lib/needt3/hooks/boards";

import {
  COLOUR_PRESETS,
  SIX_HEX,
  isFigma,
  linkFromUrl,
  normHex,
} from "./logic";
import { BoardDialog, DialogFoot, DialogHead, FavBadge, Visual } from "./parts";

/** Focus a field a moment after its dialog opens (after the enter motion starts). */
function useFocusOnOpen(open: boolean) {
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const t = window.setTimeout(() => ref.current?.focus(), 40);
    return () => window.clearTimeout(t);
  }, [open]);
  return ref;
}

/** Paste a link: the preview is built from the address; the server adds the page's own title and picture. */
export function LinkDialog({
  open,
  saving,
  onClose,
  onAdd,
}: {
  open: boolean;
  saving: boolean;
  onClose: () => void;
  onAdd: (url: string) => Promise<boolean>;
}) {
  const [v, setV] = useState("");
  const ref = useFocusOnOpen(open);
  useEffect(() => {
    if (open) setV("");
  }, [open]);
  const link = linkFromUrl(v);
  const bad = !!v.trim() && !link;
  const go = async () => {
    if (!link || saving) return;
    if (await onAdd(link.url)) onClose();
  };
  const preview: V3BoardItem | null = link
    ? {
        id: "preview",
        kind: "link",
        url: link.url,
        color: null,
        text: null,
        title: link.title,
        ratio: link.ratio,
        colorName: null,
        source: { name: link.name, domain: link.domain },
        thumbnailUrl: null,
        position: 0,
        createdAt: null,
      }
    : null;
  return (
    <BoardDialog open={open} onClose={onClose} label="Paste a link">
      <DialogHead
        art="page"
        title="Paste a link"
        sub="Any page, a Figma file, a Pin — it’s saved as a link"
      />
      <label className="pl-stack-6">
        <span className="pl-label">URL</span>
        <input
          ref={ref}
          name="mb-url"
          value={v}
          placeholder="https://"
          inputMode="url"
          autoComplete="off"
          enterKeyHint="done"
          aria-invalid={bad}
          aria-describedby={bad ? "mb-url-err" : undefined}
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void go();
          }}
          className={"pl-field" + (bad ? " is-invalid" : "")}
        />
        {bad ? (
          <span id="mb-url-err" role="alert" className="pl-link-sheet-text">
            That doesn’t look like a link — try https://…
          </span>
        ) : null}
      </label>
      {preview && link ? (
        <div className="nx-swap pl-link-sheet-row">
          <span className="pl-link-sheet-el">
            <Visual it={preview} />
          </span>
          <span className="pl-link-sheet-col">
            <span className="pl-link-sheet-text-2">{link.title}</span>
            <span className="pl-link-sheet-row-2">
              <FavBadge it={preview} size={14} />
              {link.domain}
            </span>
            {isFigma(preview) ? (
              <span className="pl-meta">
                Opens in Figma · we only keep the link
              </span>
            ) : null}
          </span>
        </div>
      ) : null}
      <DialogFoot>
        <button type="button" className="nx-btn nx-btn-text" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="nx-btn nx-btn-primary mb-link-add"
          disabled={!link || saving}
          onClick={() => void go()}
        >
          Add link
        </button>
      </DialogFoot>
    </BoardDialog>
  );
}

export function ColourDialog({
  open,
  saving,
  onClose,
  onAdd,
}: {
  open: boolean;
  saving: boolean;
  onClose: () => void;
  onAdd: (hex: string, name: string) => Promise<boolean>;
}) {
  const [c, setC] = useState<string>(COLOUR_PRESETS[2][0]);
  const [n, setN] = useState("");
  useEffect(() => {
    if (open) {
      setC(COLOUR_PRESETS[2][0]);
      setN("");
    }
  }, [open]);
  const hex = SIX_HEX(c) ? normHex(c) : null;
  const go = async () => {
    if (!hex || saving) return;
    if (await onAdd(hex, n)) onClose();
  };
  return (
    <BoardDialog open={open} onClose={onClose} label="Add a colour">
      <DialogHead
        art="tune"
        title="Add a colour"
        sub="A swatch to keep next to your references"
      />
      <div className="pl-color-sheet-row">
        <span
          className="pl-color-sheet-el"
          style={hex ? ({ "--pl-bg": hex } as React.CSSProperties) : undefined}
        />
        <div className="pl-color-sheet-row-2">
          {COLOUR_PRESETS.map(([h, nm]) => (
            <button
              key={h}
              type="button"
              aria-label={nm}
              title={nm}
              onClick={() => {
                setC(h);
                if (!n || COLOUR_PRESETS.some((p) => p[1] === n)) setN(nm);
              }}
              className={
                "nx-press pl-color-sheet-btn" +
                (hex === h ? " nx-selected" : "")
              }
              style={{ "--pl-bg": h } as React.CSSProperties}
            />
          ))}
        </div>
      </div>
      <div className="pl-color-sheet-row-3">
        <label className="pl-color-sheet-col">
          <span className="pl-label">Hex</span>
          <input
            name="mb-hex"
            value={c}
            autoComplete="off"
            enterKeyHint="done"
            aria-invalid={!hex}
            aria-describedby={!hex ? "mb-hex-err" : undefined}
            onChange={(e) => setC(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void go();
            }}
            className={"pl-field is-num" + (!hex ? " is-invalid" : "")}
          />
        </label>
        <label className="pl-color-sheet-col-2">
          <span className="pl-label">
            Name <span>· optional</span>
          </span>
          <input
            name="mb-colorname"
            value={n}
            placeholder="Colour name"
            autoComplete="off"
            enterKeyHint="done"
            onChange={(e) => setN(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void go();
            }}
            className="pl-field"
          />
        </label>
      </div>
      {!hex ? (
        <span id="mb-hex-err" role="alert" className="pl-color-sheet-text">
          Use six hex digits, like #8A8178.
        </span>
      ) : null}
      <DialogFoot>
        <button type="button" className="nx-btn nx-btn-text" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="nx-btn nx-btn-primary mb-color-add"
          disabled={!hex || saving}
          onClick={() => void go()}
        >
          Add colour
        </button>
      </DialogFoot>
    </BoardDialog>
  );
}

export function NoteDialog({
  open,
  saving,
  onClose,
  onAdd,
}: {
  open: boolean;
  saving: boolean;
  onClose: () => void;
  onAdd: (text: string) => Promise<boolean>;
}) {
  const [v, setV] = useState("");
  const ref = useFocusOnOpen(open);
  useEffect(() => {
    if (open) setV("");
  }, [open]);
  const go = async () => {
    if (!v.trim() || saving) return;
    if (await onAdd(v)) onClose();
  };
  return (
    <BoardDialog open={open} onClose={onClose} label="Add a note">
      <DialogHead
        art="doc"
        title="Add a note"
        sub="A thought that belongs with the pictures"
      />
      <textarea
        ref={ref}
        name="mb-note"
        value={v}
        rows={4}
        placeholder="Add a note"
        aria-label="Note"
        autoComplete="off"
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void go();
        }}
        className="pl-field is-area is-tall"
      />
      <DialogFoot>
        <span className="pl-note-sheet-el">⌘↵ to add</span>
        <button type="button" className="nx-btn nx-btn-text" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="nx-btn nx-btn-primary"
          disabled={!v.trim() || saving}
          onClick={() => void go()}
        >
          Add note
        </button>
      </DialogFoot>
    </BoardDialog>
  );
}

/** The three small "add" dialogs, driven by the controller's `sheet`. */
export function AddDialogs({
  sheet,
  saving,
  onClose,
  onLink,
  onColour,
  onNote,
}: {
  sheet: "link" | "colour" | "note" | "share" | null;
  saving: boolean;
  onClose: () => void;
  onLink: (url: string) => Promise<boolean>;
  onColour: (hex: string, name: string) => Promise<boolean>;
  onNote: (text: string) => Promise<boolean>;
}) {
  return (
    <>
      <LinkDialog
        open={sheet === "link"}
        saving={saving}
        onClose={onClose}
        onAdd={onLink}
      />
      <ColourDialog
        open={sheet === "colour"}
        saving={saving}
        onClose={onClose}
        onAdd={onColour}
      />
      <NoteDialog
        open={sheet === "note"}
        saving={saving}
        onClose={onClose}
        onAdd={onNote}
      />
    </>
  );
}
