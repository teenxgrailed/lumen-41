"use client";

import { type CSSProperties, type ReactNode, useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import { LuPalette, LuUsers } from "react-icons/lu";

import { newDate } from "@/lib/date-utils";
import { useDoc, useTrashDoc, useUpdateDoc } from "@/lib/needt3/hooks/docs";
import { useProjects } from "@/lib/needt3/hooks/projects";
import type { V3Doc } from "@/lib/needt3/map";
import { notify } from "@/lib/notifications";

import { DcCover, V3Switch, docsCopy, useDocTokens } from "../docs/DocParts";
import { backdropVars } from "../docs/backdrop";
import { ageLabel } from "../docs/labels";
import {
  type TokenReader,
  fontOf,
  pageVars,
  styleOf,
  stylePatch,
} from "../docs/style";
import { StScreen } from "../states/StScreen";
import { ShareSheet } from "./ShareSheet";
import { StylePanel } from "./StylePanel";
import { useDocPanel } from "./panel";

const copy = docsCopy;
const NARROW = 900;

type Tab = "style" | "info";

/** Info tab: the page's facts and the actions the chrome owns. */
function InfoPanel({ doc }: { doc: V3Doc }) {
  const c = copy.InfoPanel;
  const router = useRouter();
  const update = useUpdateDoc();
  const trash = useTrashDoc();
  const projects = useProjects();
  const now = newDate().getTime();
  const project = doc.projectId
    ? (projects.data ?? []).find((p) => p.id === doc.projectId)
    : null;
  const line = (label: string, value: ReactNode, last?: boolean) => (
    <div className={"docs-dc-row-1 dc-row" + (last ? "" : " dc-hair")}>
      <span className="docs-dc-row-2">
        <span className="docs-dc-row-3">{label}</span>
      </span>
      <span className="docs-dc-row-5 docs-dc-row-4">{value}</span>
    </div>
  );
  return (
    <div className="docs-dc-style-panel-1" data-dc-info="">
      <div className="docs-dc-label-1 docs-dc-label-s1 is-on">
        {c.properties}
      </div>
      {line(c.created, ageLabel(doc.createdAt, now))}
      {line(c.updated, ageLabel(doc.updatedAt, now))}
      {line(c.project, project?.name ?? c.no_project, true)}
      <div className="docs-dc-label-1 docs-dc-label-s1">{c.actions}</div>
      <div className="docs-dc-row-1 dc-row dc-hair">
        <span className="docs-dc-row-2">
          <span className="docs-dc-row-3">{c.pin}</span>
        </span>
        <span className="docs-dc-row-5">
          <V3Switch
            checked={doc.isFavorite}
            label={c.pin}
            onChange={(v) =>
              void update
                .mutateAsync({ id: doc.id, patch: { isFavorite: v } })
                .then(({ undo }) =>
                  notify.success(v ? "Pinned" : "Unpinned", {
                    action: { label: "Undo", onClick: () => void undo() },
                  })
                )
                .catch(() => undefined)
            }
          />
        </span>
      </div>
      {/* //todo: Present, Move to…, Duplicate and Versions: the editor's own
          ⋯ menu (PageWorkspace) has Version history; the rest have no v3
          flow yet. Words / reading time need the editor's text. */}
      <button
        type="button"
        className="nx-btn nx-btn-danger"
        style={{ marginTop: 12 }}
        onClick={() =>
          void trash
            .mutateAsync({ id: doc.id, trashed: true })
            .then(({ undo }) => {
              notify.success(`“${doc.title || "Untitled"}” moved to Trash`, {
                action: {
                  label: "Undo",
                  onClick: () =>
                    void undo().then(() =>
                      router.push(`/pages/${encodeURIComponent(doc.id)}`)
                    ),
                },
              });
              router.push("/pages");
            })
            .catch(() => undefined)
        }
      >
        {c.delete}
      </button>
    </div>
  );
}

/** Backdrops cross-fade: the last one stays underneath while the new one fades in. */
function useBackdropLayers(id: string) {
  const [layers, setLayers] = useState<[string, string]>([id, id]);
  if (layers[1] !== id) setLayers([layers[1], id]);
  return layers;
}

function Backdrop({
  layers,
  read,
  blur,
}: {
  layers: [string, string];
  read: TokenReader;
  blur?: boolean;
}) {
  if (layers[1] === "none") {
    return layers[0] !== "none" ? (
      <div
        key={`out:${layers[0]}`}
        aria-hidden="true"
        className="dc-bd dc-bd-out docs-bd-layer"
        style={backdropVars(layers[0], read)}
      />
    ) : null;
  }
  return (
    <>
      {layers.map((id, i) =>
        id === "none" ? null : (
          <div
            key={`${i}:${id}`}
            aria-hidden="true"
            className={
              "dc-bd docs-bd-layer" +
              (i ? " dc-bd-in" : "") +
              (blur ? " is-blur" : "")
            }
            style={backdropVars(id, read)}
          />
        )
      )}
    </>
  );
}

/**
 * The document chrome (prototype DocsScreen.jsx `DocumentScreen` 1613,
 * `DocTopRight` 981): the backdrop edge to edge, the page as a card on it in
 * its own colour, ink and font, the Share sheet and the right inspector
 * (Style, Info). The editor inside is the existing `PageWorkspace`
 * (collaboration, revisions, editor_v2), lives in the `editorSlot` (see
 * `phone/docs/Faces`): its block model, title and cover stay its own.
 */
export function DocumentScreen({
  pageId,
  editorSlot,
}: {
  pageId: string;
  /**
   * Callback ref of the empty slot the editor lives in. The editor is not
   * rendered here: `DocumentFace` keeps it mounted in one place and moves its
   * host element into whichever face is showing (so a resize across 700 px
   * never remounts it).
   */
  editorSlot: (el: HTMLElement | null) => void;
}) {
  const query = useDoc(pageId);
  const doc = query.data;
  const read = useDocTokens();
  const s = styleOf(doc);
  const font = fontOf(s.font);
  const bdOn = s.backdrop !== "none";
  const layers = useBackdropLayers(s.backdrop);
  const [share, setShare] = useState(false);
  const [tab, setTab] = useState<Tab>("style");
  const [panelOpen, setPanelOpen] = useDocPanel();
  const [narrow, setNarrow] = useState(false);

  // Under 900px the inspector floats over the page instead of taking width.
  useEffect(() => {
    const fit = () => setNarrow(window.innerWidth < NARROW);
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  // ⌘⌥\ toggles the panel (⌘\ alone is the sidebar, the shell's).
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (
        (e.metaKey || e.ctrlKey) &&
        e.altKey &&
        (e.code === "Backslash" || e.key === "\\")
      ) {
        e.preventDefault();
        setPanelOpen(!panelOpen);
      }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [panelOpen, setPanelOpen]);

  const update = useUpdateDoc();
  const removeCover = () => {
    if (!doc) return;
    void update
      .mutateAsync({ id: doc.id, patch: stylePatch(doc, { cover: null }) })
      .then(({ undo }) =>
        notify.success(copy.DocumentScreen.cover_removed, {
          action: { label: "Undo", onClick: () => void undo() },
        })
      )
      .catch(() => undefined);
  };

  const openTab = (t: Tab) => {
    if (panelOpen && tab === t) {
      setPanelOpen(false);
      return;
    }
    setTab(t);
    setPanelOpen(true);
  };

  const sheetVars = {
    fontFamily: font.css,
    ...pageVars(s, read),
    ...(s.font !== "sans" ? { "--font-sans": font.css } : null),
  } as CSSProperties;

  const tabs: [Tab, string][] = [
    ["style", copy.DocumentScreen.style],
    ["info", copy.DocumentScreen.info],
  ];

  return (
    <StScreen query={query} kind="doc" screen="doc" title={doc?.title}>
      <div className="flex min-h-0 flex-1 flex-col px-2 pb-2">
        {/* DocTopRight: Share and the inspector toggle. //todo: these belong
            in the top bar's right slot; the shell (T05) exposes none yet. */}
        <div className="flex h-11 flex-none items-center justify-end gap-2 px-2">
          <button
            type="button"
            className="nx-btn nx-btn-secondary nx-btn-sm"
            aria-pressed={panelOpen && tab === "style"}
            title="Style · ⌘⌥\"
            onClick={() => openTab("style")}
          >
            <LuPalette size={14} aria-hidden />
            {copy.DocumentScreen.style}
          </button>
          <button
            type="button"
            className="nx-btn nx-btn-secondary nx-btn-sm"
            data-doc-share-btn=""
            aria-expanded={share}
            aria-haspopup="dialog"
            disabled={!doc}
            onClick={() => setShare(true)}
          >
            <LuUsers size={14} aria-hidden />
            {copy.DocTopRight.share}
          </button>
        </div>
        <div className="docs-document-screen-1">
          <div className="docs-document-screen-2" data-dc-area="">
            <Backdrop layers={layers} read={read} blur={s.bdBlur} />
            <div
              data-doc-page=""
              data-dc-backdrop={s.backdrop}
              className={
                "scroll-inner docs-document-screen-3" +
                (bdOn ? " is-bd" : "") +
                (narrow ? " is-narrow" : "")
              }
            >
              <article
                key={pageId}
                data-doc-sheet=""
                data-dc-font={s.font}
                className={
                  "dt-themed dc-card docs-sheet" +
                  (bdOn ? " on-backdrop" : "") +
                  (s.wide ? " is-wide" : "")
                }
                style={{ ...sheetVars, padding: "0 0 96px" }}
              >
                {s.cover ? (
                  <div
                    data-doc-cover=""
                    className="dc-cover-wrap docs-document-screen-4"
                    style={{ margin: 0 }}
                  >
                    <DcCover cover={s.cover} />
                    <span className="dc-cover-tools docs-document-screen-5">
                      <button
                        type="button"
                        className="nx-btn nx-btn-secondary nx-btn-sm"
                        onClick={removeCover}
                      >
                        {copy.DocumentScreen.remove}
                      </button>
                    </span>
                  </div>
                ) : null}
                {/* The editor brings its own canvas and a full-height frame;
                    on the page it takes the page's colour instead. The cover
                    is the chrome's (above), so the editor's cover controls are
                    hidden (v3-overrides/docs.css). */}
                <div ref={editorSlot} className="contents" />
              </article>
            </div>
          </div>
          <div
            data-dc-panel=""
            data-dc-panel-float={narrow ? "" : undefined}
            aria-hidden={!panelOpen}
            className={"docs-inspector" + (panelOpen ? " is-open" : "")}
            style={{ width: panelOpen ? 272 : 0 }}
          >
            <aside className="docs-document-screen-8">
              <div className="docs-dc-seg-1" role="tablist">
                {tabs.map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={tab === id}
                    className={
                      "docs-document-screen-9 docs-document-screen-s1" +
                      (tab === id ? " is-on" : "")
                    }
                    onClick={() => setTab(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {/* //todo: the Insert and Format tabs drive the prototype's own
                  block model; PageWorkspace has its slash menu and toolbar,
                  so they are not ported (chrome only, T14). */}
              <div
                key={tab}
                className="scroll-inner nx-swap docs-document-screen-10"
              >
                {doc ? (
                  tab === "style" ? (
                    <StylePanel doc={doc} read={read} />
                  ) : (
                    <InfoPanel doc={doc} />
                  )
                ) : null}
              </div>
            </aside>
          </div>
        </div>
      </div>
      {doc ? (
        <ShareSheet
          doc={doc}
          read={read}
          open={share}
          onClose={() => setShare(false)}
        />
      ) : null}
    </StScreen>
  );
}
