"use client";

import {
  type CSSProperties,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { useRouter } from "next/navigation";

import {
  LuCheck,
  LuChevronLeft,
  LuEllipsis,
  LuLink,
  LuPalette,
  LuStar,
  LuTrash2,
  LuUsers,
} from "react-icons/lu";

import { useDocAccess } from "@/lib/needt3/hooks/doc-share";
import { useDoc, useTrashDoc, useUpdateDoc } from "@/lib/needt3/hooks/docs";
import { notify } from "@/lib/notifications";

import { DcCover, useDocTokens } from "../../docs/DocParts";
import { backdropVars } from "../../docs/backdrop";
import { fontOf, pageVars, styleOf } from "../../docs/style";
import { StError, StNoAccess } from "../../states/StScreen";
import { screenState } from "../../states/status";
import { PkFog, PkTopBand } from "../kit/Screen";
import { pkCx } from "../kit/util";
import { snack } from "../overlays/snack";
import { usePhoneCover } from "../shell/cover";
import { PageStyleSheet } from "./PageStyleSheet";
import { PdGlass, PdMenu, type PdMenuItem } from "./PhoneMenu";
import { ShareSheetPhone } from "./ShareSheetPhone";
import { scrollVars } from "./logic";
import { useReaderSlide } from "./useReaderSlide";

/** A focus that lands in the editor's text: the keyboard is (about to be) up. */
const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement &&
  !!el.closest("[data-doc-editor]") &&
  (el.isContentEditable || el.tagName === "INPUT" || el.tagName === "TEXTAREA");

type Sheet = "style" | "share" | null;

/**
 * The document on the phone (phone-docs.jsx `PdDocReader` 785): the page
 * full-bleed on its backdrop in its own colour, ink and font, springing in
 * from the right, with ‹ Docs and ⋯ in glass over the top band and the large
 * title handing over to a compact one. Back is the chip, or a swipe from the
 * left edge (`useReaderSlide`). ⋯ holds Page Style, Share, Pin, Copy link and
 * Delete; Page Style and Share are sheets.
 *
 * The page itself is the existing editor (`PageWorkspace`, kept mounted by
 * `DocumentFace` and moved into `editorSlot`: collaboration, revisions, its block model, title and the
 * editor_v2 format). The prototype's own block editor (Aa / + Content /
 * selection bar) drives a block model the app does not have, so it is not
 * ported; the editor's own header is hidden here (motion.css P7) because the
 * chrome above replaces it.
 */
export function ReaderPhone({
  pageId,
  editorSlot,
}: {
  pageId: string;
  /** Callback ref of the empty slot the editor's host element is moved into. */
  editorSlot: (el: HTMLElement | null) => void;
}) {
  const router = useRouter();
  const query = useDoc(pageId);
  const doc = query.data;
  const access = useDocAccess(pageId);
  const update = useUpdateDoc();
  const trash = useTrashDoc();
  const read = useDocTokens();
  const s = styleOf(doc);
  const font = fontOf(s.font);
  const bd = s.backdrop !== "none";
  const faded = bd && s.bdLook === "faded";

  const root = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [typing, setTyping] = useState(false);
  // The follow-up of an async action must not depend on this face still being
  // there: if the width crossed 700 px meanwhile, leave by the router.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // The menu, a sheet and the keyboard take the screen: menu A steps down.
  usePhoneCover(menu || sheet !== null || typing);

  const slide = useReaderSlide({
    rootRef: root,
    onGone: () => router.push("/pages"),
    enabled: !typing && !menu && sheet === null,
  });

  // The band, the compact title and the fog follow the scroll (custom
  // properties on the root, written only when a clamped value changes).
  useLayoutEffect(() => {
    const el = scroller.current;
    const r = root.current;
    if (!el || !r) return undefined;
    let last = "";
    const readScroll = () => {
      const v = scrollVars(el.scrollTop, el.scrollHeight, el.clientHeight);
      const key = `${v.band.toFixed(3)}${v.kt.toFixed(3)}${v.fog.toFixed(3)}`;
      if (key === last) return;
      last = key;
      r.style.setProperty("--pk-band", v.band.toFixed(3));
      r.style.setProperty("--pk-kt", v.kt.toFixed(3));
      r.style.setProperty("--pk-fog-k", v.fog.toFixed(3));
      r.setAttribute("data-pk-band-on", v.band > 0.01 ? "1" : "0");
      r.setAttribute("data-pk-fog-on", v.fog > 0.01 ? "1" : "0");
    };
    readScroll();
    // One read per frame: scroll and resize (a keystroke grows the page)
    // both land here, and the reads of scrollHeight force a layout.
    let frame = 0;
    const queue = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        readScroll();
      });
    };
    el.addEventListener("scroll", queue, { passive: true });
    const ro =
      typeof ResizeObserver === "function" ? new ResizeObserver(queue) : null;
    if (ro) {
      ro.observe(el);
      if (el.firstElementChild) ro.observe(el.firstElementChild);
    }
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("scroll", queue);
      ro?.disconnect();
    };
  }, [pageId]);

  // No rubber band under the editor: the document itself must not spring
  // while this page is open (the scroller's own is off in docs.css).
  useEffect(() => {
    const html = document.documentElement;
    const before = html.style.overscrollBehaviorY;
    html.style.overscrollBehaviorY = "none";
    return () => {
      html.style.overscrollBehaviorY = before;
    };
  }, []);

  // The page's paper runs to the top of the display. On iOS the status bar
  // and toolbar take the colour at the edge, so the document's ground is the
  // paper while this page is open (phone-ground.css `data-ground="page"`):
  // static for the page, switched when it opens and closes, never animated.
  // On a backdrop the paper starts below the band and the ground stays.
  const groundVars = bd ? null : pageVars(s, read);
  const groundL = groundVars?.["--dt-page-l"] ?? "";
  const groundD = groundVars?.["--dt-page-d"] ?? "";
  useLayoutEffect(() => {
    if (!groundL || !groundD) return undefined;
    const html = document.documentElement;
    html.style.setProperty("--v3-page-ground-l", groundL);
    html.style.setProperty("--v3-page-ground-d", groundD);
    html.setAttribute("data-ground", "page");
    return () => {
      html.removeAttribute("data-ground");
      html.style.removeProperty("--v3-page-ground-l");
      html.style.removeProperty("--v3-page-ground-d");
    };
  }, [groundL, groundD]);

  // Native focus events on the root: the editor is portalled in (DocumentFace),
  // so React's synthetic focus events would not reach this component.
  useEffect(() => {
    const r = root.current;
    if (!r) return undefined;
    const on = (e: FocusEvent) => {
      if (isTyping(e.target)) setTyping(true);
    };
    const off = (e: FocusEvent) => {
      if (!isTyping(e.relatedTarget)) setTyping(false);
    };
    r.addEventListener("focusin", on);
    r.addEventListener("focusout", off);
    return () => {
      r.removeEventListener("focusin", on);
      r.removeEventListener("focusout", off);
    };
  }, []);

  const done = () => {
    const a = document.activeElement;
    if (a instanceof HTMLElement && root.current?.contains(a)) a.blur();
    setTyping(false);
  };

  const closeMenu = () => setMenu(false);
  // Until the role is known (or when it cannot be read) only Copy link is
  // offered: a viewer must never see the write actions flash.
  const viewerOnly = !access.data || access.data.myRole === "VIEWER";

  const pin = () => {
    closeMenu();
    if (!doc) return;
    void update
      .mutateAsync({ id: doc.id, patch: { isFavorite: !doc.isFavorite } })
      .then(({ undo }) => snack(doc.isFavorite ? "Unpinned" : "Pinned", undo))
      .catch(() => undefined);
  };
  const copyLink = () => {
    closeMenu();
    void navigator.clipboard
      ?.writeText(
        `${window.location.origin}/pages/${encodeURIComponent(pageId)}`
      )
      .then(() => snack("Link copied"))
      .catch(() => notify.error("Could not copy the link."));
  };
  const remove = () => {
    closeMenu();
    if (!doc) return;
    void trash
      .mutateAsync({ id: doc.id, trashed: true })
      .then(({ undo }) => {
        snack(`“${doc.title || "Untitled"}” moved to Trash`, async () => {
          await undo();
          router.push(`/pages/${encodeURIComponent(doc.id)}`);
        });
        if (alive.current) slide.back();
        else router.push("/pages");
      })
      .catch(() => undefined);
  };

  const items: PdMenuItem[] = viewerOnly
    ? [
        {
          id: "link",
          label: "Copy link",
          icon: <LuLink size={18} aria-hidden />,
          onClick: copyLink,
        },
      ]
    : [
        {
          id: "style",
          label: "Page Style",
          icon: <LuPalette size={18} aria-hidden />,
          onClick: () => {
            closeMenu();
            setSheet("style");
          },
        },
        {
          id: "share",
          label: "Share",
          icon: <LuUsers size={18} aria-hidden />,
          onClick: () => {
            closeMenu();
            setSheet("share");
          },
        },
        {
          id: "pin",
          label: doc?.isFavorite ? "Unpin" : "Pin",
          icon: <LuStar size={18} aria-hidden />,
          onClick: pin,
        },
        {
          id: "link",
          label: "Copy link",
          icon: <LuLink size={18} aria-hidden />,
          onClick: copyLink,
        },
        { sep: true },
        {
          id: "delete",
          label: "Delete",
          icon: <LuTrash2 size={18} aria-hidden />,
          tone: "alert",
          onClick: remove,
        },
      ];

  const state = screenState(query);
  const sheetVars = {
    fontFamily: font.css,
    ...pageVars(s, read),
    ...(s.font !== "sans" ? { "--font-sans": font.css } : null),
  } as CSSProperties;

  return (
    <div className="pd-place" data-pd-place="docs">
      <div
        ref={root}
        className={pkCx(
          "pd-reader pk-screen",
          bd && "is-bd",
          typing && "is-editing"
        )}
        style={pageVars(s, read) as CSSProperties}
        data-pd-reader={pageId}
        data-pd-mode={typing ? "edit" : "read"}
        data-pk-screen="doc"
        data-pk-band-on="0"
        data-pk-fog-on="0"
      >
        <div ref={scroller} className="pd-reader-scroll">
          {state === "no-access" ? (
            <div className="pd-state" data-st-state="no-access">
              <StNoAccess title={doc?.title} kind="document" />
            </div>
          ) : state === "error" || state === "offline" ? (
            <div className="pd-state" data-st-state={state}>
              <StError
                text={
                  state === "offline"
                    ? "You’re offline — reconnect to load this."
                    : undefined
                }
                onRetry={query.refetch}
              />
            </div>
          ) : (
            <div
              className={pkCx(
                "mb-doc pd-doc",
                bd && "has-bd",
                faded && "is-faded",
                bd && s.bdBlur && "is-blur"
              )}
              data-mb-screen="doc"
              data-dc-backdrop={s.backdrop}
              data-dc-page={s.page}
              data-dc-font={s.font}
              style={bd ? backdropVars(s.backdrop, read) : undefined}
            >
              <article
                data-doc-sheet=""
                data-dc-font={s.font}
                className={pkCx(
                  "dt-themed mb-doc-card",
                  bd && "on-backdrop",
                  s.cover && "has-cover"
                )}
                style={sheetVars}
              >
                {s.cover ? (
                  <div data-mb-cover="" className="mb-doc-cover">
                    <DcCover cover={s.cover} />
                  </div>
                ) : null}
                {/* The editor brings its own canvas, title and header; on the
                    phone the chrome replaces its header and cover (motion.css
                    P7 and v3-overrides/docs.css). */}
                <div ref={editorSlot} className="contents" />
              </article>
            </div>
          )}
        </div>
        <PkTopBand />
        <div className="pk-compact" aria-hidden="true">
          <span className="pk-compact-title">{doc?.title || "Untitled"}</span>
        </div>
        <div className="pd-bar">
          <PdGlass
            icon={<LuChevronLeft size={20} aria-hidden />}
            label="Back to Docs"
            className="pd-back"
            onClick={slide.back}
            data={{ "data-pd-back": "" }}
          >
            Docs
          </PdGlass>
          {typing ? (
            <PdGlass
              icon={<LuCheck size={20} aria-hidden />}
              label="Done"
              onClick={done}
              keepFocus
              data={{ "data-pd-acc": "done" }}
            >
              Done
            </PdGlass>
          ) : (
            <PdGlass
              icon={<LuEllipsis size={20} aria-hidden />}
              label="More"
              onClick={() => setMenu(true)}
              data={{ "data-pd-more": "doc" }}
            />
          )}
        </div>
        {typing ? null : <PkFog />}
        <PdMenu
          open={menu}
          onClose={closeMenu}
          items={items}
          label="Page actions"
        />
        {doc ? (
          <>
            <PageStyleSheet
              doc={doc}
              read={read}
              open={sheet === "style"}
              onClose={() => setSheet(null)}
            />
            <ShareSheetPhone
              doc={doc}
              open={sheet === "share"}
              onClose={() => setSheet(null)}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}
