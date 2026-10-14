"use client";

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";

import { useRouter } from "next/navigation";

import {
  LuArrowDown,
  LuArrowLeft,
  LuArrowUp,
  LuCaseSensitive,
  LuCheck,
  LuCircleCheck,
  LuFileText,
  LuFolder,
  LuImage,
  LuLayoutTemplate,
  LuList,
  LuPaperclip,
  LuPlus,
  LuSearch,
} from "react-icons/lu";

import { newDate } from "@/lib/date-utils";
import { useAddPageFile, usePageFiles } from "@/lib/needt3/hooks/doc-files";
import { useDoc } from "@/lib/needt3/hooks/docs";

import { type DocRailTab, useNeedt3Ui } from "@/store/needt3-ui";

import { DocThumb, docsCopy, useDocTokens } from "../docs/DocParts";
import { ageLabel } from "../docs/labels";
import { Tooltip } from "../menu/Tooltip";
import { useShellApi } from "../shell/ShellContext";
import { useOpenDocId } from "./open-doc";
import { EDITOR_SELECTOR, findRanges, scrollToOutline } from "./outline";
import {
  type DocTaskRow,
  fileMeta,
  isMedia,
  taskItemAt,
  tasksOf,
  whereLabel,
} from "./rail-data";

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

function PanelHead({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="docs-panel-head-1">
      <span className="docs-dc-row-4">{title}</span>
      <span className="docs-panel-head-2">{children}</span>
    </div>
  );
}

const SHEET_SELECTOR = "[data-doc-sheet]";

/** Lines the prototype does not have (its Tasks and Files tabs show fixtures). */
const RAIL = {
  linked: "linked task",
  nothing_attached:
    "Nothing attached to this page yet. Add a file with the plus.",
  could_not_load: "Could not load the files.",
};

/**
 * Tasks in this document: every to-do in the page's text, under the heading
 * it sits in, and every task the page links to. Ticking a row ticks the box in
 * the text (the page is the one place a to-do lives); a row scrolls to it.
 * Completed ones are hidden until asked for.
 */
function Tasks({ docKey }: { docKey: string }) {
  const c = copy.PanelTasks;
  const [rows, setRows] = useState<DocTaskRow[]>([]);
  const [showDone, setShowDone] = useState(false);

  useEffect(() => {
    const sheet = document.querySelector(SHEET_SELECTOR);
    let raf = 0;
    let last = "";
    const read = () => {
      const next = tasksOf(sheet?.querySelector(".needt-page-editor") ?? null);
      const key = JSON.stringify(next);
      if (key === last) return;
      last = key;
      setRows(next);
    };
    read();
    if (!sheet) return undefined;
    const mo = new MutationObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(read);
    });
    mo.observe(sheet, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["data-checked"],
    });
    return () => {
      cancelAnimationFrame(raf);
      mo.disconnect();
    };
  }, [docKey]);

  const editor = () =>
    document.querySelector(`${SHEET_SELECTOR} .needt-page-editor`);
  const tick = (row: DocTaskRow) =>
    taskItemAt(editor(), row.nth)
      ?.querySelector<HTMLInputElement>('input[type="checkbox"]')
      ?.click();
  const show = (row: DocTaskRow) =>
    taskItemAt(editor(), row.nth)?.scrollIntoView?.({
      block: "center",
      behavior: "smooth",
    });

  const shown = rows.filter((r) => showDone || !r.done);
  const hiddenDone = rows.length - shown.length;
  return (
    <>
      <PanelHead title={c.tasks}>
        <GhostIcon
          label={c.show_completed}
          pressed={showDone}
          onClick={() => setShowDone(!showDone)}
        >
          <LuCircleCheck size={14} />
        </GhostIcon>
      </PanelHead>
      {shown.map((r, i) => {
        const where = whereLabel(r);
        return (
          <div
            key={`${r.kind}${r.nth}${i}`}
            className="nav-row docs-panel-tasks-1"
          >
            {r.kind === "item" ? (
              <button
                type="button"
                role="checkbox"
                aria-checked={r.done}
                aria-label={r.text}
                className="nt-check docs-panel-tasks-2"
                data-checked={r.done ? "true" : "false"}
                onClick={() => tick(r)}
              >
                <span className="nt-check-box">
                  {r.done ? <LuCheck size={12} aria-hidden /> : null}
                </span>
              </button>
            ) : (
              <span className="docs-panel-tasks-2" aria-hidden="true">
                <LuCircleCheck size={16} />
              </span>
            )}
            <span className="docs-doc-list-4">
              {r.kind === "link" && r.href ? (
                <a
                  className={"docs-panel-tasks-3 docs-panel-tasks-s1"}
                  href={r.href}
                >
                  {r.text}
                </a>
              ) : (
                <button
                  type="button"
                  className={
                    "docs-panel-tasks-3 docs-panel-tasks-s1" +
                    (r.done ? " is-on" : "")
                  }
                  onClick={() => show(r)}
                >
                  {r.text}
                </button>
              )}
              {where ? (
                <span className="docs-panel-tasks-4">
                  {where}
                  {r.kind === "link" ? ` \u00b7 ${RAIL.linked}` : ""}
                </span>
              ) : null}
            </span>
          </div>
        );
      })}
      {shown.length === 0 ? (
        <p className="empty-hint doc-rail-hint">
          {hiddenDone
            ? `${hiddenDone} completed. Show them with the check above.`
            : c.no_open_tasks_on_this_page_type_in_the_t}
        </p>
      ) : null}
    </>
  );
}

/**
 * Files: what is attached to this page, pictures as a grid and the rest as
 * rows. The plus adds a file (10 MB at most); a row opens it.
 */
function Files({ id }: { id: string | null }) {
  const c = copy.PanelFiles;
  const files = usePageFiles(id);
  const add = useAddPageFile(id);
  const input = useRef<HTMLInputElement>(null);
  const list = files.data ?? [];
  const media = list.filter(isMedia);
  const rest = list.filter((f) => !isMedia(f));
  return (
    <>
      <PanelHead title={c.attachments}>
        <GhostIcon
          label={c.add_a_file}
          disabled={!id || add.isPending}
          onClick={() => input.current?.click()}
        >
          <LuPlus size={14} />
        </GhostIcon>
      </PanelHead>
      <input
        ref={input}
        type="file"
        hidden
        data-doc-rail-file=""
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? []);
          e.target.value = "";
          picked.forEach((f) => add.mutate(f));
        }}
      />
      {media.length ? (
        <>
          <span className="docs-panel-files-1">{c.media}</span>
          <div className="docs-panel-files-2">
            {media.map((f) => (
              <a
                key={f.id}
                href={f.url}
                target="_blank"
                rel="noreferrer noopener"
                className="docs-files-thumb"
                aria-label={f.name}
                title={f.name}
                style={{ overflow: "hidden", position: "relative" }}
              >
                <LuImage size={18} aria-hidden />
                {/* eslint-disable-next-line @next/next/no-img-element -- the page's own attachment */}
                <img
                  src={f.url}
                  alt=""
                  loading="lazy"
                  draggable={false}
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                />
              </a>
            ))}
          </div>
        </>
      ) : null}
      {rest.length ? (
        <>
          <span className="docs-panel-files-3">{c.files}</span>
          {rest.map((f) => (
            <a
              key={f.id}
              href={f.url}
              target="_blank"
              rel="noreferrer noopener"
              className="nav-row docs-panel-files-4"
            >
              <span className="docs-panel-files-5">
                <LuPaperclip size={12} aria-hidden />
              </span>
              <span className="docs-panel-files-6">
                <span className="docs-panel-files-7">{f.name}</span>
                <span className="docs-dc-row-4">{fileMeta(f)}</span>
              </span>
            </a>
          ))}
        </>
      ) : null}
      {files.isSuccess && list.length === 0 ? (
        <p className="empty-hint doc-rail-hint">{RAIL.nothing_attached}</p>
      ) : null}
      {files.isError ? (
        <p className="empty-hint doc-rail-hint">{RAIL.could_not_load}</p>
      ) : null}
    </>
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
 * Four tabs, as in the prototype: Contents, Tasks in this document, Files
 * (what is attached to the page) and Find.
 */
export function DocRail() {
  const router = useRouter();
  const shell = useShellApi();
  const id = useOpenDocId();
  const doc = useDoc(id).data;
  const read = useDocTokens();
  const tab = useNeedt3Ui((s) => s.docRailTab);
  const setTab = useNeedt3Ui((s) => s.setDocRailTab);
  const c = copy.DocPanel;
  const [now] = useState(() => newDate().getTime());
  const updated = doc
    ? ageLabel(doc.updatedAt, now).replace(/^Just now$/, c.just_now)
    : "";
  const tabs: [DocRailTab, ReactNode, string][] = [
    ["outline", <LuList key="o" size={16} />, c.contents],
    ["tasks", <LuCircleCheck key="t" size={16} />, c.tasks_in_this_document],
    ["files", <LuPaperclip key="p" size={16} />, c.files],
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
        {doc ? <DocThumb doc={doc} read={read} w={30} h={36} /> : null}
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
        {tab === "outline" ? (
          <Outline />
        ) : tab === "tasks" ? (
          <Tasks docKey={id ?? ""} />
        ) : tab === "files" ? (
          <Files id={id} />
        ) : (
          <Find docKey={id ?? ""} />
        )}
      </div>
      <DocSwitch value="doc" />
    </aside>
  );
}
