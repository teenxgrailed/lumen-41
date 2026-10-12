"use client";

import { type CSSProperties, useRef } from "react";

import { LuImage, LuLink, LuPalette, LuText } from "react-icons/lu";

import { ProBadge } from "@/components/needt3/paywall/Pro";

import strings from "../../../../../docs/port/prototype/port/strings/en.json";
import { PkButton, PkField, PkGlass, PkHueTile, PkSheet, pkCx } from "../kit";
import {
  type AddAsk,
  type AddKind,
  SWATCHES,
  checkAdd,
  parseLink,
  pickedColour,
} from "./model";

const t = strings["phone-habits.jsx"];

const KINDS: readonly {
  k: AddKind;
  label: string;
  hint: string;
  icon: typeof LuLink;
  hue: string;
}[] = [
  {
    k: "link",
    label: t.PhbAddSheet.link,
    hint: "A page, a product, a post",
    icon: LuLink,
    hue: "var(--info)",
  },
  {
    k: "color",
    label: t.PhbAddSheet.colour,
    hint: "A swatch, by eye or by hex",
    icon: LuPalette,
    hue: "var(--hue-pink)",
  },
  {
    k: "note",
    label: t.PhbAddSheet.note,
    hint: "In your words",
    icon: LuText,
    hue: "var(--hue-yellow)",
  },
];

const TITLES: Record<AddAsk["step"], string> = {
  pick: "Add to this board",
  link: "Paste a link",
  color: "Choose a colour",
  note: t.PhbAddSheet.note,
};

/**
 * Add a reference (PhbAddSheet): pick a kind, then its small form. Link,
 * colour and note, or a photo; Pinterest needs a
 * connection, which does not exist: its row says "Coming soon". A photo opens
 * the file picker. The draft is the controller's.
 */
export function AddSheet({
  ask,
  saving,
  onChange,
  onClose,
  onSave,
  onPhoto,
}: {
  ask: AddAsk | null;
  saving: boolean;
  onChange: (p: Partial<AddAsk>) => void;
  onClose: () => void;
  onSave: () => void;
  /** Opens the file picker (it must run inside the tap) and closes the sheet. */
  onPhoto: () => void;
}) {
  /* The last ask stays drawn while the sheet slides away. */
  const last = useRef<AddAsk | null>(null);
  if (ask) last.current = ask;
  const a = ask ?? last.current;
  const check = a ? checkAdd(a) : { ok: false, error: null };
  const colour = a ? pickedColour(a) : null;
  const preview = a?.step === "link" ? parseLink(a.link) : null;
  const title = a ? TITLES[a.step] : "";
  const enter = (e: { key: string; preventDefault: () => void }) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onSave();
    }
  };
  return (
    <PkSheet
      open={!!ask}
      onClose={onClose}
      title={title}
      label={title}
      className="phb-add-sheet"
      footer={
        a && a.step !== "pick" ? (
          <>
            <PkButton onClick={() => onChange({ step: "pick" })}>
              {t.PhbAddSheet.back}
            </PkButton>
            <PkButton
              kind="primary"
              disabled={!check.ok || saving}
              onClick={onSave}
              data-phb-add-save
            >
              {a.step === "link"
                ? t.PhbAddSheet.add_link
                : a.step === "color"
                  ? t.PhbAddSheet.add_colour
                  : t.PhbAddSheet.add_note}
            </PkButton>
          </>
        ) : null
      }
    >
      {!a ? null : a.step === "pick" ? (
        <div className="phb-kinds" role="menu">
          <PkGlass
            as="button"
            className="phb-kind"
            role="menuitem"
            data-phb-kind="photo"
            onClick={onPhoto}
          >
            <PkHueTile
              icon={<LuImage size={20} aria-hidden />}
              hue="var(--hue-blue)"
              size={44}
            />
            <span className="phb-kind-text">
              <span className="phb-kind-label">Photo</span>
              <span className="phb-kind-hint">From your library or camera</span>
            </span>
          </PkGlass>
          {KINDS.map(({ k, label, hint, icon: Icon, hue }) => (
            <PkGlass
              key={k}
              as="button"
              className="phb-kind"
              role="menuitem"
              data-phb-kind={k}
              onClick={() => onChange({ step: k })}
            >
              <PkHueTile
                icon={<Icon size={20} aria-hidden />}
                hue={hue}
                size={44}
              />
              <span className="phb-kind-text">
                <span className="phb-kind-label">{label}</span>
                <span className="phb-kind-hint">{hint}</span>
              </span>
            </PkGlass>
          ))}
          {/* Pinterest has no connection behind it yet: the row says so. */}
          <PkGlass
            as="button"
            className="phb-kind"
            role="menuitem"
            aria-disabled="true"
            disabled
            data-phb-kind="pinterest"
          >
            <PkHueTile
              icon={<LuLink size={20} aria-hidden />}
              hue="var(--brand-pinterest)"
              size={44}
            />
            <span className="phb-kind-text">
              <span className="phb-kind-label">
                Pinterest <ProBadge size="sm" />
              </span>
              <span className="phb-kind-hint">Coming soon</span>
            </span>
          </PkGlass>
        </div>
      ) : a.step === "link" ? (
        <div className="phb-form">
          <PkField
            label={t.PhbAddSheet.link}
            id="phb-link"
            value={a.link}
            onChange={(link) => onChange({ link })}
            placeholder="https://"
            className={check.error ? "is-invalid" : undefined}
            inputProps={{
              inputMode: "url",
              autoComplete: "off",
              enterKeyHint: "done",
              "aria-invalid": !!check.error,
              "aria-describedby": check.error ? "phb-link-err" : undefined,
              onKeyDown: enter,
            }}
          />
          {check.error ? (
            <p id="phb-link-err" role="alert" className="phb-err">
              {check.error}
            </p>
          ) : null}
          {preview ? (
            <div className="phb-preview pk-glass">
              <PkHueTile icon={<LuLink size={18} aria-hidden />} size={40} />
              <span className="phb-kind-text">
                <span className="phb-kind-label">{preview.title}</span>
                <span className="phb-kind-hint">{preview.domain}</span>
              </span>
            </div>
          ) : null}
        </div>
      ) : a.step === "color" && colour ? (
        <div className="phb-form">
          <div
            className="phb-swatch"
            style={
              {
                "--swatch": colour.color,
                "--ink": "var(--v2p-ink)",
              } as CSSProperties
            }
            data-phb-swatch={colour.color}
          >
            <span className="phb-swatch-name">{colour.name}</span>
            <span className="phb-swatch-hex">{colour.color}</span>
          </div>
          <div
            className="phb-swatches"
            role="radiogroup"
            aria-label={t.PhbAddSheet.colours}
          >
            {SWATCHES.map(([hex, name], i) => {
              const on = !colour.typed && a.swatch === i;
              return (
                <button
                  key={hex}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={name}
                  className={pkCx("phb-sw", on && "is-on")}
                  style={{ "--swatch": hex } as CSSProperties}
                  onClick={() => onChange({ swatch: i, hex: "" })}
                />
              );
            })}
          </div>
          <PkField
            label={t.PhbAddSheet.hex}
            id="phb-hex"
            value={a.hex}
            onChange={(hex) => onChange({ hex })}
            placeholder="#000000"
            inputProps={{
              autoComplete: "off",
              enterKeyHint: "done",
              onKeyDown: enter,
            }}
          />
        </div>
      ) : (
        <div className="phb-form">
          <PkField
            label={t.PhbAddSheet.note}
            id="phb-note"
            multiline
            grow
            rows={3}
            value={a.note}
            onChange={(note) => onChange({ note })}
            placeholder={t.PhbAddSheet.type_something}
          />
        </div>
      )}
    </PkSheet>
  );
}
