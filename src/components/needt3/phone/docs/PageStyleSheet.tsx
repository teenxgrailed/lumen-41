"use client";

import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

import { LuBan, LuImage, LuLock, LuUpload } from "react-icons/lu";

import type { V3Doc } from "@/lib/needt3/map";

import { DcCover, docsCopy } from "../../docs/DocParts";
import { backdropVars } from "../../docs/backdrop";
import { isProStyleValue } from "../../docs/pro-style";
import {
  DOC_BACKDROPS,
  DOC_DEFAULT,
  DOC_FONTS,
  DOC_PAGES,
  DOC_PRESETS,
  type DocStyle,
  type TokenReader,
  pageOf,
  pageVars,
  presetOf,
  styleOf,
} from "../../docs/style";
import { PkButton } from "../kit/Material";
import { PkSheet } from "../kit/Sheet";
import { pkCx } from "../kit/util";
import {
  BG_KINDS,
  BG_LIST,
  type BgKind,
  bgChoice,
  bgKind,
  coverKind,
} from "./logic";
import { useStyleWrite } from "./useStyleWrite";

function Seg<T extends string>({
  items,
  value,
  onChange,
  label,
  attr,
}: {
  items: { id: T; label: string; icon?: ReactNode; locked?: boolean }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  attr: string;
}) {
  return (
    <div className="pd-seg" role="radiogroup" aria-label={label}>
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          role="radio"
          aria-checked={value === it.id}
          className={pkCx("pd-seg-btn", value === it.id && "is-on")}
          onClick={() => onChange(it.id)}
          {...{ [attr]: it.id }}
          {...(it.locked ? { "data-pro-locked": "" } : {})}
        >
          {it.icon ? <span className="pd-seg-icon">{it.icon}</span> : null}
          <span>
            {it.label}
            {it.locked ? (
              <LuLock
                size={10}
                aria-label="Pro"
                style={{ marginLeft: 4, verticalAlign: "-1px" }}
              />
            ) : null}
          </span>
        </button>
      ))}
    </div>
  );
}

function Switch({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={pkCx("pd-switch", on && "is-on")}
      onClick={() => onChange(!on)}
      data-pd-blur=""
    >
      <span className="pd-switch-knob" />
    </button>
  );
}

const bgIcon = (k: BgKind) =>
  k === "none" ? (
    <LuBan size={16} aria-hidden />
  ) : k === "image" ? (
    <LuImage size={16} aria-hidden />
  ) : (
    <span className={`pd-bg-ico is-${k}`} aria-hidden="true" />
  );

/**
 * Page Style (phone-docs.jsx `PdPageStyleSheet` 458): Presets, Cover,
 * Background, the backdrop's look and blur, and the default font, in one sheet
 * with detents 0.62 / 0.94, plus the page-colour sheet that Background > Solid
 * opens. It writes the desktop Style panel's fields through `useStyleWrite`,
 * with the same Pro gates: a Gradient or Image backdrop, and every preset but
 * Default, are Pro; colour, cover and font are free.
 * Not offered, as on the desktop: the drawn cover arts (the editor draws the
 * cover as a picture URL) and Separator Style.
 */
export function PageStyleSheet({
  doc,
  read,
  open,
  onClose,
}: {
  doc: V3Doc;
  read: TokenReader;
  open: boolean;
  onClose: () => void;
}) {
  const w = useStyleWrite(doc);
  const s = styleOf(doc);
  const [colour, setColour] = useState(false);
  // Closing the sheet from the colour page must not reopen on it.
  useEffect(() => {
    if (!open) setColour(false);
  }, [open]);
  const file = useRef<HTMLInputElement>(null);
  const preset = presetOf(s);
  const bg = bgKind(s);
  const cover = coverKind(s.cover);
  const pg = pageOf(s.page);
  const pickFile = () => file.current?.click();

  const pickBg = (k: BgKind) => {
    const { patch, pickColour } = bgChoice(k, s);
    if (!w.set(patch)) return;
    if (pickColour) setColour(true);
  };

  return (
    <>
      <input
        ref={file}
        type="file"
        accept="image/*"
        hidden
        data-pd-cover-file=""
        onChange={(e) => {
          w.cover(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <PkSheet
        open={open && !colour}
        onClose={onClose}
        title="Page Style"
        detents={[0.62, 0.94]}
        label="Page Style"
        bodyClass="pd-ps-body"
      >
        <div className="pd-ps" data-pd-pagestyle="">
          <section className="pd-ps-card">
            <span className="pd-ps-label">Presets</span>
            <div
              className="pd-ps-presets pk-no-drag"
              role="radiogroup"
              aria-label="Presets"
            >
              {DOC_PRESETS.map((p) => {
                const ps: DocStyle = { ...DOC_DEFAULT, ...p.style };
                const bd = ps.backdrop !== "none";
                const on = preset?.id === p.id;
                const locked =
                  !w.pro && isProStyleValue("backdrop", ps.backdrop);
                return (
                  <button
                    key={p.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    className={pkCx("pd-preset", on && "is-on")}
                    data-pd-preset={p.id}
                    {...(locked ? { "data-pro-locked": "" } : {})}
                    onClick={() => w.preset(p.id, p.name)}
                  >
                    <span
                      className={pkCx("pd-preset-pic", bd && "has-bd")}
                      style={bd ? backdropVars(ps.backdrop, read) : undefined}
                    >
                      <span
                        className="dt-themed pd-preset-page"
                        style={pageVars(ps, read)}
                      >
                        <span className="pd-preset-aa">Aa</span>
                        <span className="pd-preset-line" />
                        <span className="pd-preset-line is-short" />
                      </span>
                    </span>
                    <span className="pd-preset-name">
                      {p.name}
                      {locked ? (
                        <LuLock
                          size={10}
                          aria-label="Pro"
                          style={{ marginLeft: 4, verticalAlign: "-1px" }}
                        />
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="pd-ps-group">
            <span className="pd-ps-label">Cover</span>
            <Seg<"none" | "image">
              label="Cover"
              attr="data-pd-cover"
              value={cover}
              items={[
                { id: "none", label: "None", icon: bgIcon("none") },
                { id: "image", label: "Image", icon: bgIcon("image") },
              ]}
              onChange={(k) => {
                if (k === "none") {
                  if (cover === "image") {
                    w.set(
                      { cover: null },
                      docsCopy.DocumentScreen.cover_removed
                    );
                  }
                } else if (cover !== "image") pickFile();
              }}
            />
            {cover === "image" ? (
              <div className="pd-ps-cover-row">
                <span className="pd-ps-cover-pic">
                  <DcCover cover={s.cover} />
                </span>
                <PkButton
                  kind="quiet"
                  small
                  icon={<LuUpload size={16} aria-hidden />}
                  onClick={pickFile}
                >
                  Replace
                </PkButton>
              </div>
            ) : null}
          </section>

          <section className="pd-ps-group">
            <span className="pd-ps-label">Background</span>
            <Seg<BgKind>
              label="Background"
              attr="data-pd-bg"
              value={bg}
              onChange={pickBg}
              items={BG_KINDS.map(([id, label]) => ({
                id,
                label,
                icon: bgIcon(id),
                locked: !w.pro && (id === "gradient" || id === "image"),
              }))}
            />
            {bg === "solid" ? (
              <button
                type="button"
                className="pd-ps-line"
                onClick={() => setColour(true)}
                data-pd-solid=""
              >
                <span className="pd-ps-line-label">Page colour</span>
                <span className="pd-ps-line-value">{pg.name}</span>
                <span
                  className="pd-swatch-fill is-split is-sm"
                  style={
                    {
                      "--split-l": read(pg.l),
                      "--split-d": read(pg.d),
                    } as CSSProperties
                  }
                />
              </button>
            ) : null}
            {bg === "gradient" || bg === "image" ? (
              <div className="pd-bd-row pk-no-drag">
                {BG_LIST[bg].map((id) => (
                  <button
                    key={id}
                    type="button"
                    className={pkCx("pd-bd-tile", s.backdrop === id && "is-on")}
                    aria-pressed={s.backdrop === id}
                    data-pd-bd={id}
                    onClick={() => w.set({ backdrop: id })}
                  >
                    <span
                      className="pd-bd-pic"
                      style={backdropVars(id, read)}
                    />
                    <span className="pd-bd-name">
                      {DOC_BACKDROPS.find((b) => b.id === id)?.name ?? id}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
            {s.backdrop !== "none" ? (
              <>
                <Seg<"immersive" | "faded">
                  label="Backdrop look"
                  attr="data-pd-look"
                  value={s.bdLook === "faded" ? "faded" : "immersive"}
                  onChange={(v) => w.set({ bdLook: v })}
                  items={[
                    { id: "immersive", label: "Immersive" },
                    { id: "faded", label: "Faded" },
                  ]}
                />
                <div className="pd-ps-line is-static">
                  <span className="pd-ps-line-label">Blur image</span>
                  <Switch
                    on={!!s.bdBlur}
                    label="Blur image"
                    onChange={(v) => w.set({ bdBlur: v })}
                  />
                </div>
              </>
            ) : null}
          </section>

          <section className="pd-ps-group">
            <span className="pd-ps-label">Default font</span>
            <div
              className="pd-fonts"
              role="radiogroup"
              aria-label="Default font"
            >
              {DOC_FONTS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  role="radio"
                  aria-checked={s.font === f.id}
                  className={pkCx("pd-font", s.font === f.id && "is-on")}
                  data-pd-font={f.id}
                  onClick={() => w.set({ font: f.id })}
                >
                  <span
                    className="pd-font-glyph"
                    style={{ "--pd-font": f.css } as CSSProperties}
                  >
                    {f.glyph}
                  </span>
                  <span className="pd-font-name">{f.name}</span>
                </button>
              ))}
            </div>
          </section>
        </div>
      </PkSheet>

      <PkSheet
        open={open && colour}
        onClose={() => setColour(false)}
        title="Page colour"
        meta="Each has a Light and a Dark reading"
        label="Page colour"
      >
        <div
          className="pd-colors"
          role="radiogroup"
          aria-label="Page colour"
          data-pd-colors="page"
        >
          {DOC_PAGES.map((p) => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={s.page === p.id}
              aria-label={p.name}
              className={pkCx("pd-swatch", s.page === p.id && "is-on")}
              data-pd-swatch={p.id}
              onClick={() => w.set({ page: p.id })}
            >
              <span
                className="pd-swatch-fill is-split"
                style={
                  {
                    "--split-l": read(p.l),
                    "--split-d": read(p.d),
                  } as CSSProperties
                }
              />
              <span className="pd-swatch-name">{p.name}</span>
            </button>
          ))}
        </div>
      </PkSheet>
    </>
  );
}
