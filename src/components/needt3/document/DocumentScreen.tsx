"use client";

import { type CSSProperties, type ReactNode, useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import {
  LuCalendar,
  LuClock,
  LuFolder,
  LuHistory,
  LuStar,
  LuTrash2,
} from "react-icons/lu";

import { runPageTool } from "@/components/pages/page-commands";

import { newDate } from "@/lib/date-utils";
import { useDocAccess } from "@/lib/needt3/hooks/doc-share";
import { useDoc, useTrashDoc, useUpdateDoc } from "@/lib/needt3/hooks/docs";
import { useProjects } from "@/lib/needt3/hooks/projects";
import type { V3Doc } from "@/lib/needt3/map";
import { announcePagePatched } from "@/lib/needt3/page-events";
import { notify } from "@/lib/notifications";

import { type DocTab, useNeedt3Ui } from "@/store/needt3-ui";

import { DcCover, docsCopy, useDocTokens } from "../docs/DocParts";
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
import { InsertPanel } from "./InsertPanel";
import { ShareSheet } from "./ShareSheet";
import { StylePanel } from "./StylePanel";
import { NO_STATS, type PageStats, outlineOf, statsOf } from "./outline";
import { inspectorTab, isPanelShortcut, useDocPanel } from "./panel";

const copy = docsCopy;
const NARROW = 900;

const num = (n: number) => n.toLocaleString("en-US");

/** Info tab: the page's facts and the actions the chrome owns. */
export function InfoPanel({ doc, stats }: { doc: V3Doc; stats: PageStats }) {
  const c = copy.InfoPanel;
  const router = useRouter();
  const update = useUpdateDoc();
  const trash = useTrashDoc();
  const projects = useProjects();
  const access = useDocAccess(doc.id);
  const now = newDate().getTime();
  const project = doc.projectId
    ? (projects.data ?? []).find((p) => p.id === doc.projectId)
    : null;
  const line = (
    icon: ReactNode,
    label: string,
    value: string,
    last?: boolean
  ) => (
    <div
      className={"docs-info-line-1 docs-info-line-s1" + (last ? " is-on" : "")}
    >
      <span className="docs-info-line-2">{icon}</span>
      <span className="docs-info-line-3">{label}</span>
      <span className="docs-info-line-4" title={value}>
        {value}
      </span>
    </div>
  );
  const eyebrow = (label: string, first?: boolean) => (
    <div
      className={"docs-dc-label-1 docs-dc-label-s1" + (first ? " is-on" : "")}
    >
      {label}
    </div>
  );
  const row = (label: string, value: string, last?: boolean) => (
    <div
      className={"docs-panel-row-1 docs-panel-row-s1" + (last ? " is-on" : "")}
    >
      <span className="docs-panel-row-2">{label}</span>
      <span className="docs-panel-row-3">{value}</span>
    </div>
  );
  const canEdit = !!access.data && access.data.myRole !== "VIEWER";
  const minutes = Math.max(1, Math.round(stats.words / 200));
  return (
    <div className="docs-dc-style-panel-1" data-dc-info="">
      {eyebrow(c.properties, true)}
      {line(<LuCalendar size={15} />, c.created, ageLabel(doc.createdAt, now))}
      {line(<LuClock size={15} />, c.updated, ageLabel(doc.updatedAt, now))}
      {line(
        <LuFolder size={15} />,
        c.project,
        project?.name ?? c.no_project,
        true
      )}
      {/* //todo: Author, "Review by Needt" and "Who wrote what" need the page's
          author and a review route; Present, Move to… and Duplicate have no
          v3 flow yet. */}
      {eyebrow(c.actions)}
      <button
        type="button"
        className="nav-row docs-action-line-1 docs-action"
        disabled={!canEdit}
        aria-pressed={doc.isFavorite}
        onClick={() => {
          const next = !doc.isFavorite;
          // The editor holds its own copy of the pin (its "Page options" star).
          const tell = (v: boolean) =>
            announcePagePatched({
              pageId: doc.id,
              values: { isFavorite: v },
              from: "chrome",
            });
          tell(next);
          void update
            .mutateAsync({ id: doc.id, patch: { isFavorite: next } })
            .then(({ undo }) =>
              notify.success(next ? "Pinned" : "Unpinned", {
                action: {
                  label: "Undo",
                  onClick: () => {
                    tell(!next);
                    void undo();
                  },
                },
              })
            )
            .catch(() => tell(!next));
        }}
      >
        <LuStar
          size={15}
          aria-hidden
          fill={doc.isFavorite ? "currentColor" : "none"}
        />
        <span className="docs-share-panel-9">
          {doc.isFavorite ? "Unpin" : c.pin}
        </span>
      </button>
      <button
        type="button"
        className="nav-row docs-action-line-1 docs-action"
        onClick={() => runPageTool({ pageId: doc.id, tool: "history" })}
      >
        <LuHistory size={15} aria-hidden />
        <span className="docs-share-panel-9">{c.versions}</span>
      </button>
      <button
        type="button"
        className="nav-row docs-action-line-1 docs-action is-danger"
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
        <LuTrash2 size={15} aria-hidden />
        <span className="docs-share-panel-9">{c.delete}</span>
      </button>
      {eyebrow(c.numbers)}
      {row(c.words, num(stats.words))}
      {row(c.characters, num(stats.characters))}
      {row(c.blocks, num(stats.blocks))}
      {row(c.reading_time, `${minutes} min`, true)}
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
 * The document chrome (prototype DocsScreen.jsx `DocumentScreen`): the
 * backdrop edge to edge, the page as a card on it in its own colour, ink and
 * font, and the right inspector (Insert, Style, Info). The top bar's right
 * side (Insert, Share), the breadcrumb and the left rail (Contents, Find)
 * belong to the shell and read the same `needt3-ui` document state. The
 * editor inside is the existing `PageWorkspace` (collaboration, revisions,
 * editor_v2), lives in the `editorSlot` (see `phone/docs/Faces`): its block
 * model, title and cover controls stay its own; the sheet's CSS
 * (`v3-overrides/doc-opened.css`) gives its title, rule and blocks the
 * prototype's measures.
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
  const access = useDocAccess(pageId);
  const read = useDocTokens();
  const s = styleOf(doc);
  const font = fontOf(s.font);
  const bdOn = s.backdrop !== "none";
  const faded = bdOn && s.bdLook === "faded";
  const layers = useBackdropLayers(s.backdrop);
  const share = useNeedt3Ui((st) => st.docShareOpen);
  const setShare = useNeedt3Ui((st) => st.setDocShareOpen);
  const tab = useNeedt3Ui((st) => st.docTab);
  const setTab = useNeedt3Ui((st) => st.setDocTab);
  const [panelOpen, setPanelOpen] = useDocPanel();
  const [narrow, setNarrow] = useState(false);
  const [stats, setStats] = useState<PageStats>(NO_STATS);
  const [sheet, setSheet] = useState<HTMLElement | null>(null);

  // Opening a document shows its own rail; leaving closes its Share sheet.
  useEffect(() => {
    useNeedt3Ui.getState().setDocRail("doc");
    useNeedt3Ui.getState().setDocShareOpen(false);
    return () => {
      useNeedt3Ui.getState().setDocShareOpen(false);
      useNeedt3Ui.getState().setDocOutline([]);
    };
  }, [pageId]);

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
      if (isPanelShortcut(e)) {
        e.preventDefault();
        setPanelOpen(!panelOpen);
      }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [panelOpen, setPanelOpen]);

  // The rail's Contents and the Info tab's Numbers follow the page's text.
  const title = doc?.title ?? "";
  useEffect(() => {
    const el = sheet;
    if (!el) return undefined;
    let raf = 0;
    const read = () => {
      const editor = el.querySelector<HTMLElement>(".needt-page-editor");
      useNeedt3Ui.getState().setDocOutline(outlineOf(editor, title));
      setStats((prev) => {
        const next = statsOf(editor);
        return prev.words === next.words &&
          prev.characters === next.characters &&
          prev.blocks === next.blocks
          ? prev
          : next;
      });
    };
    const soon = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(read);
    };
    read();
    const mo = new MutationObserver(soon);
    mo.observe(el, { childList: true, subtree: true, characterData: true });
    return () => {
      cancelAnimationFrame(raf);
      mo.disconnect();
    };
  }, [sheet, title]);

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

  const sheetVars = {
    fontFamily: font.css,
    ...pageVars(s, read),
    ...(s.font !== "sans" ? { "--font-sans": font.css } : null),
  } as CSSProperties;

  const isDatabase = !!doc?.isDatabase;
  const shown: DocTab = inspectorTab(tab, isDatabase);
  const tabs: [DocTab, string][] = [
    ["insert", copy.DocumentScreen.insert],
    ["style", copy.DocumentScreen.style],
    ["info", copy.DocumentScreen.info],
  ];
  const offered = tabs.filter(([id]) => !(isDatabase && id === "insert"));
  const look = bdOn
    ? (faded ? "faded" : "immersive") + (s.bdBlur ? " blur" : "")
    : undefined;

  return (
    <StScreen query={query} kind="doc" screen="doc" title={doc?.title}>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="docs-document-screen-1">
          <div className="docs-document-screen-2" data-dc-area="">
            <Backdrop layers={layers} read={read} blur={s.bdBlur} />
            {faded ? (
              <div
                aria-hidden="true"
                className="docs-bd-fade"
                data-dc-faded=""
                style={pageVars(s, read) as CSSProperties}
              />
            ) : null}
            <div
              data-doc-page=""
              data-dc-backdrop={s.backdrop}
              data-dc-look={look}
              className={
                "scroll-inner docs-document-screen-3" +
                (bdOn ? " is-bd" : "") +
                (narrow ? " is-narrow" : "")
              }
            >
              <article
                key={pageId}
                ref={setSheet}
                data-doc-sheet=""
                data-dc-font={s.font}
                data-dc-sep={s.separator}
                data-has-cover={s.cover ? "" : undefined}
                className={
                  "dt-themed dc-card docs-sheet" +
                  (bdOn ? " on-backdrop" : "") +
                  (faded ? " is-faded" : "") +
                  (s.wide ? " is-wide" : "")
                }
                style={sheetVars}
              >
                {s.cover ? (
                  <div
                    data-doc-cover=""
                    className="dc-cover-wrap docs-document-screen-4"
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
            inert={!panelOpen || undefined}
            className={"docs-inspector" + (panelOpen ? " is-open" : "")}
            style={{ width: panelOpen ? 272 : 0 }}
          >
            <aside className="docs-document-screen-8">
              <div className="docs-dc-seg-1" role="tablist">
                {offered.map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={shown === id}
                    className={
                      "docs-document-screen-9 docs-document-screen-s1" +
                      (shown === id ? " is-on" : "")
                    }
                    onClick={() => setTab(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {/* //todo: the Format tab (block colour, card groups) drives the
                  prototype's own block model; the editor has its selection
                  bar and "/" menu, so it is not ported. */}
              <div
                key={shown}
                className="scroll-inner nx-swap docs-document-screen-10"
              >
                {doc ? (
                  shown === "insert" ? (
                    <InsertPanel
                      pageId={pageId}
                      canEdit={!!access.data && access.data.myRole !== "VIEWER"}
                    />
                  ) : shown === "style" ? (
                    <StylePanel doc={doc} read={read} />
                  ) : (
                    <InfoPanel doc={doc} stats={stats} />
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
