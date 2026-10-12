"use client";

import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { useQueryClient } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import { LuLayers, LuPlus, LuUpload } from "react-icons/lu";

import { ApiError } from "@/lib/needt3/hooks/core";
import { useUpdateDoc } from "@/lib/needt3/hooks/docs";
import { usePlan } from "@/lib/needt3/hooks/plan";
import type { V3Doc } from "@/lib/needt3/map";
import { qk } from "@/lib/needt3/query-keys";
import { notify } from "@/lib/notifications";

import { useNeedt3Ui } from "@/store/needt3-ui";

import { useV3PortalContainer } from "../ctx/PortalScope";
import { useExit } from "../ctx/useExit";
import {
  DcBackdrop,
  DcCover,
  DcMiniPage,
  DcSplit,
  V3Switch,
  docsCopy,
} from "../docs/DocParts";
import { isProStyleValue } from "../docs/pro-style";
import {
  DOC_BACKDROPS,
  DOC_DEFAULT,
  DOC_FONTS,
  DOC_PAGES,
  DOC_PRESETS,
  DOC_TEXTS,
  type DocStyle,
  type TokenReader,
  backdropName,
  inkFor,
  pageOf,
  presetOf,
  presetPatch,
  styleOf,
  stylePatch,
  textOf,
} from "../docs/style";

const copy = docsCopy.DcStylePanel;

/**
 * A popover hung to the LEFT of the inspector, top-aligned with its trigger
 * and kept inside the window; portalled into the v3 scope so the panel's
 * scroller never clips it.
 */
function DcPop({
  trigger,
  width,
  label,
  children,
}: {
  trigger: (open: boolean) => ReactNode;
  width: number;
  label: string;
  children: (close: () => void) => ReactNode;
}) {
  const container = useV3PortalContainer();
  const [open, setOpen] = useState(false);
  const [shown, leaving] = useExit(open, 130);
  const tRef = useRef<HTMLSpanElement>(null);
  const pRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ right: 0, top: 0 });
  const place = () => {
    const el = tRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const side = el.closest("aside")?.getBoundingClientRect() ?? r;
    setPos({
      right: Math.max(8, window.innerWidth - side.left + 12),
      top: r.top,
    });
  };
  useLayoutEffect(() => {
    const p = pRef.current;
    if (!shown || !p) return;
    const max = window.innerHeight - p.offsetHeight - 12;
    if (pos.top > max) setPos((q) => ({ ...q, top: Math.max(12, max) }));
  }, [shown, pos.top]);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e: MouseEvent) => {
      const t = e.target as Node;
      if (pRef.current?.contains(t) || tRef.current?.contains(t)) return;
      setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
      window.removeEventListener("resize", place);
    };
  }, [open]);
  const close = () => setOpen(false);
  return (
    <>
      <span
        className="docs-dc-pop-1"
        ref={tRef}
        onClick={() => {
          if (!open) place();
          setOpen(!open);
        }}
      >
        {trigger(open)}
      </span>
      {shown && container
        ? createPortal(
            <div
              ref={pRef}
              role="dialog"
              aria-label={label}
              className={
                "docs-dc-pop-2 nx-pop is-right" + (leaving ? " is-leaving" : "")
              }
              style={{ right: pos.right, top: pos.top, width }}
            >
              {children(close)}
            </div>,
            container
          )
        : null}
    </>
  );
}

function DcLabel({
  children,
  first,
}: {
  children: ReactNode;
  first?: boolean;
}) {
  return (
    <div
      className={"docs-dc-label-1 docs-dc-label-s1" + (first ? " is-on" : "")}
    >
      {children}
    </div>
  );
}

function DcRow({
  label,
  sub,
  badge,
  last,
  row,
  onClick,
  plain,
  children,
}: {
  label: string;
  sub?: string;
  badge?: ReactNode;
  last?: boolean;
  row: string;
  onClick?: () => void;
  /** The row holds its own control (a switch): not itself a button. */
  plain?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      data-dc-row={row}
      role={plain ? undefined : "button"}
      tabIndex={plain ? undefined : 0}
      onClick={onClick}
      onKeyDown={
        plain
          ? undefined
          : (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                (e.currentTarget as HTMLElement).click();
              }
            }
      }
      className={"docs-dc-row-1 dc-row is-press" + (last ? "" : " dc-hair")}
    >
      <span className="docs-dc-row-2">
        <span className="docs-dc-row-3">
          {label}
          {badge}
        </span>
        {sub ? <span className="docs-dc-row-4">{sub}</span> : null}
      </span>
      <span className="docs-dc-row-5">{children}</span>
    </div>
  );
}

function DcSeg<T extends string>({
  items,
  value,
  onChange,
  tall,
  attr,
}: {
  items: [T, ReactNode, string][];
  value: T;
  onChange: (v: T) => void;
  tall?: boolean;
  attr?: string;
}) {
  return (
    <div className="docs-dc-seg-1" role="radiogroup">
      {items.map(([id, content, title]) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={value === id}
          title={title}
          {...(attr ? { [attr]: id } : {})}
          onClick={() => onChange(id)}
          className={"docs-seg-cell" + (tall ? " is-tall" : "")}
        >
          {content}
        </button>
      ))}
    </div>
  );
}

function ProPill({ locked }: { locked: boolean }) {
  //todo: the shared ProBadge belongs to the S1 paywall; this is its text.
  return (
    <span className="base-meta" data-pro-locked={locked ? "" : undefined}>
      PRO
    </span>
  );
}

function Ink({
  ink,
  children,
  cls,
}: {
  ink: string;
  children: string;
  cls: string;
}) {
  return (
    <span className={cls} style={{ "--ink": ink } as CSSProperties}>
      {children}
    </span>
  );
}

/** Upload a cover picture as a page asset; resolves to its URL. */
async function uploadCover(pageId: string, file: File) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`/api/pages/${pageId}/assets`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error(`upload failed: ${res.status}`);
  return ((await res.json()) as { url: string }).url;
}

/** Style tab (prototype DocsScreen.jsx `DcStylePanel` 184–331). */
export function StylePanel({ doc, read }: { doc: V3Doc; read: TokenReader }) {
  const update = useUpdateDoc();
  const qc = useQueryClient();
  const plan = usePlan();
  const openSettings = useNeedt3Ui((x) => x.openSettings);
  const fileRef = useRef<HTMLInputElement>(null);
  // Document themes (All Styles, Backdrop) are Pro; colour, text, cover and
  // font stay free (the rule is ../docs/pro-style, which the API enforces). An
  // unknown plan (still loading) counts as not Pro, so a free reader never
  // gets a Pro style through the loading gap.
  const pro = !!plan.data && plan.data.kind !== "free";
  const toPaywall = () => openSettings("plan");
  const s = styleOf(doc);
  const pg = pageOf(s.page);
  const pl = read(pg.l);
  const pd = read(pg.d);
  const txt = textOf(s.text);
  const preset = presetOf(s);

  const write = (
    patch: Partial<Pick<V3Doc, "style" | "coverUrl">>,
    toast?: string
  ) =>
    void update
      .mutateAsync({ id: doc.id, patch })
      .then(({ undo }) => {
        if (toast) {
          notify.success(toast, {
            action: { label: "Undo", onClick: () => void undo() },
          });
        }
      })
      .catch((error: unknown) => {
        // The mutation already put the optimistic change back. A plan the
        // server reads as Free (expired trial, stale plan) refuses a Pro
        // value: refresh what we think the plan is and show the paywall.
        if (
          error instanceof ApiError &&
          error.status === 403 &&
          error.message === "UPGRADE_REQUIRED"
        ) {
          void qc.invalidateQueries({ queryKey: qk.plan() });
          toPaywall();
        }
      });
  const set = (p: Partial<DocStyle>, toast?: string) =>
    write(stylePatch(doc, p), toast);

  const onFile = (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    void uploadCover(doc.id, f)
      // Patch over the document as it is when the upload lands, not as it was
      // when the file was picked: style edits made meanwhile must survive.
      .then((url) =>
        write(
          stylePatch(qc.getQueryData<V3Doc>(qk.doc(doc.id)) ?? doc, {
            cover: url,
          }),
          copy.cover_added
        )
      )
      .catch(() => notify.error("Could not upload the picture."));
  };

  const gallery = (close: () => void) => (
    <div className="docs-dc-gallery-1">
      <div className="docs-dc-gallery-2">
        <span className="docs-dc-gallery-3">
          {docsCopy.DcGallery.all_styles}
        </span>
        <span className="docs-dc-row-4">
          {docsCopy.DcGallery.backdrop_page_text_and_font_together}
        </span>
      </div>
      <div className="scroll-inner docs-dc-gallery-4">
        {DOC_PRESETS.map((p) => {
          const ps: DocStyle = { ...DOC_DEFAULT, ...p.style };
          const on = preset?.id === p.id;
          return (
            <button
              key={p.id}
              type="button"
              data-dc-preset={p.id}
              aria-pressed={on}
              onClick={() => {
                const patch = presetPatch(doc, p.id);
                close();
                if (patch) write(patch, `Style: ${p.name}`);
              }}
              className={
                "dc-tile docs-dc-gallery-5 docs-dc-gallery-s1" +
                (on ? " is-on" : "")
              }
            >
              <DcBackdrop
                id={ps.backdrop}
                read={read}
                frame
                className={"docs-gallery-frame" + (on ? " is-on" : "")}
              >
                <span className="docs-dc-gallery-6">
                  <DcMiniPage s={ps} read={read} title={p.name} />
                </span>
              </DcBackdrop>
              <span className="docs-dc-gallery-7">{p.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );

  const bdChip = (
    <DcBackdrop id={s.backdrop} read={read} frame className="docs-bd-chip">
      {s.backdrop === "none" ? (
        <span className="docs-dc-style-panel-6" />
      ) : null}
    </DcBackdrop>
  );

  return (
    <div className="docs-dc-style-panel-1" data-dc-style="">
      <DcLabel first>{copy.style}</DcLabel>
      <DcBackdrop
        id={s.backdrop}
        read={read}
        frame
        className="docs-style-preview"
      >
        <span
          className={
            "docs-dc-style-panel-2 docs-dc-style-panel-s1" +
            (s.wide ? " is-on" : "")
          }
        >
          <DcMiniPage
            s={s}
            read={read}
            title={doc.title}
            radius={10}
            pad={12}
            lines={[92, 74, 84, 60]}
          />
        </span>
      </DcBackdrop>
      <div className="docs-dc-style-panel-3">
        {pro ? (
          <DcPop
            width={460}
            label={copy.all_styles}
            trigger={(open) => (
              <button
                type="button"
                data-dc-allstyles=""
                aria-expanded={open}
                className="nx-btn nx-btn-secondary docs-dc-style-panel-4"
              >
                <LuLayers size={15} aria-hidden />
                {copy.all_styles}
                <ProPill locked={false} />
                {preset ? (
                  <span className="docs-dc-style-panel-5">{preset.name}</span>
                ) : null}
              </button>
            )}
          >
            {gallery}
          </DcPop>
        ) : (
          <button
            type="button"
            data-dc-allstyles="locked"
            className="nx-btn nx-btn-secondary docs-dc-style-panel-4"
            onClick={toPaywall}
            title={copy.unlock_document_themes_with_pro}
          >
            <LuLayers size={15} aria-hidden />
            {copy.all_styles}
            <ProPill locked />
            <span className="docs-dc-style-panel-5">{copy.themes}</span>
          </button>
        )}
      </div>

      <DcLabel>{copy.color}</DcLabel>
      {pro ? (
        <DcPop
          width={272}
          label={copy.backdrop}
          trigger={() => (
            <DcRow
              label={copy.backdrop}
              row="backdrop"
              sub={backdropName(s.backdrop)}
              badge={<ProPill locked={false} />}
            >
              {bdChip}
            </DcRow>
          )}
        >
          {() => (
            <div className="docs-dc-gallery-1">
              <span className="docs-dc-style-panel-7">{copy.backdrop}</span>
              <div className="docs-dc-style-panel-8">
                {DOC_BACKDROPS.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    data-dc-swatch={b.id}
                    aria-pressed={s.backdrop === b.id}
                    onClick={() => set({ backdrop: b.id })}
                    className="docs-swatch-btn"
                  >
                    <DcBackdrop
                      id={b.id}
                      read={read}
                      frame
                      className={
                        "docs-bd-swatch" + (s.backdrop === b.id ? " is-on" : "")
                      }
                    >
                      {b.id === "none" ? (
                        <span className="docs-dc-style-panel-6" />
                      ) : null}
                    </DcBackdrop>
                    {b.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </DcPop>
      ) : (
        <DcRow
          label={copy.backdrop}
          row="backdrop"
          sub={
            !isProStyleValue("backdrop", s.backdrop)
              ? copy.themes_with_pro
              : `${backdropName(s.backdrop)} ${copy.change_with_pro}`
          }
          onClick={toPaywall}
          badge={<ProPill locked />}
        >
          {bdChip}
        </DcRow>
      )}
      <DcPop
        width={252}
        label={copy.document_color}
        trigger={() => (
          <DcRow label={copy.document_color_2} row="page" sub={pg.name}>
            <DcSplit l={pl} d={pd} size={28} />
          </DcRow>
        )}
      >
        {() => (
          <div className="docs-dc-style-panel-9">
            <span className="docs-dc-style-panel-7">
              {copy.document_color_2}
            </span>
            <div
              className="docs-dc-swatch-grid-1"
              style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }}
            >
              {DOC_PAGES.map((p) => (
                <button
                  className="docs-dc-style-panel-10"
                  key={p.id}
                  type="button"
                  data-dc-swatch={p.id}
                  title={p.name}
                  aria-label={p.name}
                  aria-pressed={s.page === p.id}
                  onClick={() => set({ page: p.id })}
                >
                  <DcSplit l={read(p.l)} d={read(p.d)} size={32} />
                </button>
              ))}
            </div>
            <span className="docs-dc-style-panel-11">
              {copy.each_colour_has_a_light_and_a_dark_readi}
            </span>
          </div>
        )}
      </DcPop>
      <DcPop
        width={252}
        label={copy.text_color}
        trigger={() => (
          <DcRow
            label={copy.text_color_2}
            row="text"
            sub={txt.name + (s.text === "auto" ? ` ${copy.by_page}` : "")}
            last
          >
            <DcSplit
              l={pl}
              d={pd}
              size={28}
              inner={
                pl && pd ? (
                  <span className="docs-dc-style-panel-12">
                    <Ink
                      cls="docs-dc-style-panel-13"
                      ink={inkFor(pl, s.text, read)}
                    >
                      A
                    </Ink>
                    <Ink
                      cls="docs-dc-style-panel-14"
                      ink={inkFor(pd, s.text, read)}
                    >
                      a
                    </Ink>
                  </span>
                ) : null
              }
            />
          </DcRow>
        )}
      >
        {() => (
          <div className="docs-dc-style-panel-9">
            <span className="docs-dc-style-panel-7">{copy.text_color_2}</span>
            <div
              className="docs-dc-swatch-grid-1"
              style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}
            >
              {DOC_TEXTS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  data-dc-swatch={`text-${t.id}`}
                  aria-pressed={s.text === t.id}
                  onClick={() => set({ text: t.id })}
                  className="docs-swatch-btn"
                >
                  <span className="docs-dc-style-panel-15">
                    <DcSplit
                      l={pl}
                      d={pd}
                      size={34}
                      inner={
                        pl && pd ? (
                          <span className="docs-dc-style-panel-16">
                            <Ink
                              cls="docs-dc-style-panel-17"
                              ink={inkFor(pl, t.id, read)}
                            >
                              A
                            </Ink>
                            <Ink
                              cls="docs-dc-style-panel-18"
                              ink={inkFor(pd, t.id, read)}
                            >
                              a
                            </Ink>
                          </span>
                        ) : null
                      }
                    />
                  </span>
                  {t.name}
                </button>
              ))}
            </div>
            <span className="docs-dc-style-panel-19">
              {copy.auto_picks_dark_or_light_ink_for_the_pag}
            </span>
          </div>
        )}
      </DcPop>

      <DcLabel>{copy.cover}</DcLabel>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          onFile(e.target.files);
          e.target.value = "";
        }}
      />
      <DcPop
        width={272}
        label={copy.cover_image}
        trigger={() => (
          <DcRow
            label={copy.cover_image_2}
            row="cover"
            sub={s.cover ? copy.your_picture : copy.none}
            last
          >
            {s.cover ? (
              <span className="docs-dc-style-panel-21">
                <DcCover cover={s.cover} />
              </span>
            ) : (
              <span className="nx-btn nx-btn-secondary nx-btn-sm docs-dc-style-panel-22">
                <LuPlus size={15} aria-hidden />
              </span>
            )}
          </DcRow>
        )}
      >
        {(close) => (
          <div className="docs-dc-gallery-1">
            <span className="docs-dc-style-panel-7">{copy.cover_image_2}</span>
            <button
              type="button"
              className="nx-btn nx-btn-secondary"
              data-dc-cover-upload=""
              onClick={() => {
                close();
                fileRef.current?.click();
              }}
            >
              <LuUpload size={15} aria-hidden />
              {copy.upload_a_picture}
            </button>
            {/* //todo: the drawn cover arts ("art:<theme>") are not offered:
                the editor (PageWorkspace) draws `coverUrl` as a picture URL,
                so an art id would render as a broken image there. */}
            {s.cover ? (
              <button
                type="button"
                className="nx-btn nx-btn-text"
                onClick={() => {
                  close();
                  set({ cover: null }, docsCopy.DocumentScreen.cover_removed);
                }}
              >
                {copy.remove_cover}
              </button>
            ) : null}
          </div>
        )}
      </DcPop>

      {/* //todo: Separator Style is not offered: the title and its rule are
          drawn by the editor (PageWorkspace), which has no separator hook. */}

      <DcLabel>{copy.font}</DcLabel>
      <DcSeg
        tall
        value={s.font}
        onChange={(v) => set({ font: v })}
        attr="data-dc-font"
        items={DOC_FONTS.map((f) => [
          f.id,
          <>
            <span
              className={
                "docs-font-glyph" + (f.id === "mono" ? " is-mono" : "")
              }
              style={{ "--glyph-font": f.css } as CSSProperties}
            >
              {f.glyph}
            </span>
            <span className="docs-dc-style-panel-28">{f.name}</span>
          </>,
          f.name,
        ])}
      />

      <DcLabel>{copy.advanced}</DcLabel>
      <DcRow label={copy.wide_page} row="wide" last plain>
        <span className="docs-dc-style-panel-29" data-dc-wide="">
          <V3Switch
            checked={s.wide}
            label={copy.wide_page}
            onChange={(v) => set({ wide: v })}
          />
        </span>
      </DcRow>
    </div>
  );
}
