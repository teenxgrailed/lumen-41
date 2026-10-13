"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";

import { useRouter } from "next/navigation";

import {
  LuArrowDown,
  LuArrowLeft,
  LuArrowUp,
  LuCaseSensitive,
  LuFileText,
  LuFolder,
  LuLayoutTemplate,
  LuList,
  LuSearch,
} from "react-icons/lu";

import { newDate } from "@/lib/date-utils";
import { useDoc, useDocs } from "@/lib/needt3/hooks/docs";

import { useNeedt3Ui } from "@/store/needt3-ui";

import { DocThumb, docsCopy, useDocTokens } from "../docs/DocParts";
import { ageLabel } from "../docs/labels";
import { Tooltip } from "../menu/Tooltip";
import { useShellApi } from "../shell/ShellContext";
import { useOpenDocId } from "./open-doc";
import { EDITOR_SELECTOR, findRanges, scrollToOutline } from "./outline";

const copy = docsCopy;

function GhostIcon({
  label,
  onClick,
  disabled,
  pressed,
  children,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  pressed?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="btn-icon btn-ghost"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function PanelHead({ title }: { title: string }) {
  return (
    <div className="docs-panel-head-1">
      <span className="docs-dc-row-4">{title}</span>
    </div>
  );
}

/** Contents: the title and the headings of the page; a row scrolls to it. */
function Outline() {
  const rows = useNeedt3Ui((s) => s.docOutline);
  const [at, setAt] = useState(0);
  const go = (i: number) => {
    setAt(i);
    scrollToOutline(
      document.querySelector("[data-doc-page]"),
      document.querySelector(EDITOR_SELECTOR),
      i
    );
  };
  return (
    <>
      <PanelHead title={copy.PanelOutline.contents} />
      {rows.map((r, i) => (
        <button
          key={i}
          type="button"
          className={"nav-row" + (at === i ? " is-active" : "")}
          aria-current={at === i ? "true" : undefined}
          style={{ paddingLeft: 8 + r.level * 14 }}
          onClick={() => go(i)}
        >
          <span className="doc-rail-row-label">{r.text}</span>
        </button>
      ))}
      {rows.length < 2 ? (
        <p className="empty-hint doc-rail-hint">
          {copy.PanelOutline.headings_on_the_page_show_up_here}
        </p>
      ) : null}
    </>
  );
}

const HIGHLIGHT = "doc-find";

/** Find in the page itself: a count, previous and next, every match marked. */
function Find({ docKey }: { docKey: string }) {
  const c = copy.PanelFind;
  const [q, setQ] = useState("");
  const [cased, setCased] = useState(false);
  const [i, setI] = useState(0);
  const [tick, setTick] = useState(0);

  // The page is edited while the panel is open: recount when its text changes.
  useEffect(() => {
    const root = document.querySelector(EDITOR_SELECTOR);
    if (!root || !q) return undefined;
    let raf = 0;
    const mo = new MutationObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setTick((t) => t + 1));
    });
    mo.observe(root, { childList: true, subtree: true, characterData: true });
    return () => {
      cancelAnimationFrame(raf);
      mo.disconnect();
    };
  }, [q, docKey]);

  const ranges = useMemo(
    () => findRanges(document.querySelector(EDITOR_SELECTOR), q, cased),
    // `tick` re-reads the page after an edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [q, cased, docKey, tick]
  );
  const n = ranges.length;
  const cur = n ? Math.min(i, n - 1) : 0;

  useEffect(() => {
    const reg = typeof CSS !== "undefined" ? CSS.highlights : undefined;
    if (!reg || typeof Highlight === "undefined") return undefined;
    if (n) reg.set(HIGHLIGHT, new Highlight(...ranges));
    else reg.delete(HIGHLIGHT);
    return () => {
      reg.delete(HIGHLIGHT);
    };
  }, [ranges, n]);

  const go = (next: number) => {
    setI(next);
    ranges[next]?.startContainer.parentElement?.scrollIntoView?.({
      block: "center",
      behavior: "smooth",
    });
  };

  return (
    <>
      <div className="docs-panel-find-1">
        <span className="docs-panel-find-2">{c.find}</span>
        <span className="docs-panel-find-3">
          <GhostIcon
            label={c.match_case}
            pressed={cased}
            onClick={() => setCased(!cased)}
          >
            <LuCaseSensitive size={16} />
          </GhostIcon>
        </span>
      </div>
      <div className="docs-panel-find-4">
        <span className="docs-panel-find-5">
          <span className="docs-panel-find-6">
            <LuSearch size={14} />
          </span>
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setI(0);
            }}
            placeholder={c.find_on_this_page}
            aria-label={c.find_on_this_page}
            className="docs-find-input"
          />
        </span>
        <div className="docs-panel-find-8">
          <span className="docs-panel-find-9" aria-live="polite">
            {!q ? c.type_to_search : n ? `${cur + 1} of ${n}` : c.no_results}
          </span>
          <span className="docs-panel-find-10">
            <GhostIcon
              label={c.previous}
              disabled={!n}
              onClick={() => go((cur - 1 + n) % n)}
            >
              <LuArrowUp size={14} />
            </GhostIcon>
            <GhostIcon
              label={c.next}
              disabled={!n}
              onClick={() => go((cur + 1) % n)}
            >
              <LuArrowDown size={14} />
            </GhostIcon>
          </span>
        </div>
      </div>
    </>
  );
}

let lastSwitch: "doc" | "app" | null = null;

/**
 * The bottom-left switcher (prototype `SidebarSwitcher`): the rail shows the
 * app's places or the open document's panel; the document stays in the
 * centre. Each rail mounts its own copy, so the last value is kept here and
 * the indicator slides from it on mount.
 */
export function DocSwitch({ value }: { value: "doc" | "app" }) {
  const setRail = useNeedt3Ui((s) => s.setDocRail);
  const [pos, setPos] = useState<"doc" | "app">(lastSwitch ?? value);
  useEffect(() => {
    let a = 0;
    let b = 0;
    if (pos !== value) {
      a = requestAnimationFrame(() => {
        b = requestAnimationFrame(() => setPos(value));
      });
    }
    lastSwitch = value;
    return () => {
      cancelAnimationFrame(a);
      cancelAnimationFrame(b);
    };
  }, [value, pos]);
  const segs: ["app" | "doc", ReactNode, string][] = [
    ["app", <LuFolder key="a" size={17} />, "Places"],
    ["doc", <LuFileText key="d" size={17} />, "Document"],
  ];
  return (
    <div className="sk-switch" role="tablist" aria-label="Sidebar content">
      <span
        className="sk-switch-ind"
        aria-hidden="true"
        style={{ transform: pos === "doc" ? "translateX(36px)" : "none" }}
      />
      {segs.map(([id, icon, label]) => (
        <Tooltip key={id} label={label} side="top">
          <button
            type="button"
            role="tab"
            aria-selected={pos === id}
            aria-label={label}
            data-sb-switch={id}
            className={"sk-switch-seg" + (pos === id ? " is-on" : "")}
            onClick={() => {
              if (id !== value) {
                lastSwitch = value;
                setRail(id);
              }
            }}
          >
            {icon}
          </button>
        </Tooltip>
      ))}
    </div>
  );
}

/**
 * Opening a document trades the app's places for the document's own: the rail
 * becomes its control panel (prototype `DocPanel`) — what it is, what is in
 * it, how to move through it. The folder button at the foot hands it back.
 * Tasks and Files are not here: there is no list of a page's tasks or files
 * to show yet.
 */
export function DocRail() {
  const router = useRouter();
  const shell = useShellApi();
  const id = useOpenDocId();
  const doc = useDoc(id).data;
  // A single page comes without its first lines; the Docs list (already
  // cached for the sidebar's Pinned) has them.
  const preview = useDocs().data?.find((d) => d.id === id)?.preview;
  const read = useDocTokens();
  const tab = useNeedt3Ui((s) => s.docRailTab);
  const setTab = useNeedt3Ui((s) => s.setDocRailTab);
  const c = copy.DocPanel;
  const [now] = useState(() => newDate().getTime());
  const updated = doc
    ? ageLabel(doc.updatedAt, now).replace(/^Just now$/, c.just_now)
    : "";
  const tabs: ["outline" | "find", ReactNode, string][] = [
    ["outline", <LuList key="o" size={16} />, c.contents],
    ["find", <LuSearch key="f" size={16} />, c.find_in_document],
  ];
  return (
    <aside className="docs-doc-panel-1" aria-label="Document">
      <div className="docs-doc-panel-2">
        <GhostIcon
          label={c.back_to_documents}
          onClick={() => router.push("/pages")}
        >
          <LuArrowLeft size={16} />
        </GhostIcon>
        <GhostIcon label={c.hide_panel} onClick={shell.toggleSidebar}>
          <LuLayoutTemplate size={16} />
        </GhostIcon>
      </div>
      <div className="docs-doc-panel-3">
        {doc ? (
          <DocThumb
            doc={{ ...doc, preview: doc.preview ?? preview }}
            read={read}
            w={30}
            h={36}
          />
        ) : null}
        <span className="docs-doc-list-4">
          <span
            className={
              "docs-doc-list-5 docs-doc-panel-s1" + (doc?.title ? " is-on" : "")
            }
          >
            {doc?.title || c.untitled}
          </span>
          <span className="docs-dc-row-4">
            {doc ? `${c.updated} ${updated}` : ""}
          </span>
        </span>
      </div>
      <span className="docs-doc-panel-4" role="tablist">
        {tabs.map(([k, icon, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            aria-label={label}
            title={label}
            className={
              "docs-doc-panel-5 docs-doc-panel-s2" + (tab === k ? " is-on" : "")
            }
            onClick={() => setTab(k)}
          >
            {icon}
          </button>
        ))}
      </span>
      <div className="scroll-inner docs-doc-panel-6">
        {tab === "outline" ? <Outline /> : <Find docKey={id ?? ""} />}
      </div>
      <DocSwitch value="doc" />
    </aside>
  );
}
