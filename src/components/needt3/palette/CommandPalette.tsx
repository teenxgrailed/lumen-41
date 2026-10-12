"use client";

import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useRouter } from "next/navigation";

import {
  LuCalendar,
  LuFileText,
  LuFolderKanban,
  LuImage,
  LuLayoutTemplate,
  LuListChecks,
  LuMail,
  LuPanelLeft,
  LuPenLine,
  LuPlus,
  LuRepeat,
  LuSearch,
  LuSettings,
  LuSun,
  LuTrash2,
} from "react-icons/lu";

import { formatInTimeZone, newDate } from "@/lib/date-utils";
import { mailDayLabel, mailTime } from "@/lib/needt3/derive";
import { useCreateDoc, useDocs } from "@/lib/needt3/hooks/docs";
import { useMail } from "@/lib/needt3/hooks/mail";
import { type V3SearchKind, useSearch } from "@/lib/needt3/hooks/search";
import { useTimeZone } from "@/lib/needt3/hooks/settings";

import { useNeedt3Ui } from "@/store/needt3-ui";

import { Sheet } from "../ctx/Sheet";
import { Art } from "../menu/Art";
import { useShellApi } from "../shell/ShellContext";
import { highlightRuns, rank } from "./match";

const MAX = 6;

type Kind = V3SearchKind | "doc" | "mail" | "action";

interface Action {
  id: string;
  title: string;
  icon: ReactNode;
  kbd?: string;
  home?: boolean;
  run: () => void;
}

interface Row {
  key: string;
  kind: Kind;
  title: string;
  idx?: number[];
  meta?: string;
  kbd?: string;
  open: () => void;
}

function Lead({ kind, icon }: { kind: Kind; icon?: ReactNode }) {
  const box = {
    width: 24,
    height: 24,
    flex: "none",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  } as const;
  if (kind === "doc")
    return (
      <span style={box}>
        <Art name="doc" size={24} />
      </span>
    );
  if (kind === "mail")
    return (
      <span style={box}>
        <Art name="mail" size={24} />
      </span>
    );
  if (kind === "project")
    return (
      <span style={box}>
        <Art name="work" size={24} />
      </span>
    );
  if (kind === "event")
    return (
      <span style={box}>
        <Art name="event" size={24} />
      </span>
    );
  if (kind === "task")
    return (
      <span style={box}>
        <span
          className="shell-lead-row"
          style={{
            borderRadius: 5,
            border: "1.5px solid var(--text-quaternary)",
            background: "transparent",
          }}
        />
      </span>
    );
  return (
    <span
      style={{
        ...box,
        borderRadius: 7,
        background: "var(--fill-2)",
        color: "var(--text-secondary)",
      }}
    >
      {icon}
    </span>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return <span className="shell-kbd-span">{children}</span>;
}

function Hl({ text, idx }: { text: string; idx?: number[] }) {
  if (!idx?.length) return <>{text}</>;
  return (
    <>
      {highlightRuns(text, idx).map((r, i) =>
        r.on ? (
          <b className="shell-notes-panel-b" key={i}>
            {r.text}
          </b>
        ) : (
          <span key={i}>{r.text}</span>
        )
      )}
    </>
  );
}

const KIND_META: Record<V3SearchKind, string> = {
  task: "Task",
  project: "Project",
  event: "Event",
};

/**
 * ⌘K (prototype search.jsx): one field finds docs, tasks, projects, events
 * and mail and runs commands; results come grouped, the match is set bold,
 * and the keyboard never has to leave the field. Tasks, projects and events
 * come from `/api/search` (`useSearch`); docs and mail are matched here
 * against the lists the person already has loaded.
 */
export function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const shell = useShellApi();
  const setComposerOpen = useNeedt3Ui((s) => s.setComposerOpen);
  const openSettings = useNeedt3Ui((s) => s.openSettings);
  const tz = useTimeZone();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const docs = useDocs();
  const mail = useMail("inbox");
  const createDoc = useCreateDoc();
  const query = q.trim();
  const search = useSearch(open ? query : "");

  useEffect(() => {
    if (open) {
      setQ("");
      setSel(0);
    }
  }, [open]);

  const go = (href: string) => () => router.push(href);
  const actions: Action[] = useMemo(
    () => [
      {
        id: "a-task",
        title: "New task",
        icon: <LuPlus size={14} />,
        kbd: "N",
        home: true,
        run: () => setComposerOpen(true),
      },
      {
        id: "a-doc",
        title: "New doc",
        icon: <LuPenLine size={14} />,
        home: true,
        run: () => {
          void createDoc
            .mutateAsync({ draft: { title: "" } })
            .then(({ result }) => {
              if (result)
                router.push(`/pages/${encodeURIComponent(result.id)}`);
            })
            .catch(() => undefined);
        },
      },
      {
        id: "a-cal",
        title: "Go to Calendar",
        icon: <LuCalendar size={14} />,
        kbd: "G C",
        home: true,
        run: go("/calendar"),
      },
      {
        id: "a-mail",
        title: "Go to Mailbox",
        icon: <LuMail size={14} />,
        home: true,
        run: go("/mail"),
      },
      {
        id: "a-today",
        title: "Go to Home",
        icon: <LuSun size={14} />,
        kbd: "G H",
        run: go("/today"),
      },
      {
        id: "a-tasks",
        title: "Go to Tasks",
        icon: <LuListChecks size={14} />,
        kbd: "G T",
        run: go("/tasks"),
      },
      {
        id: "a-work",
        title: "Go to Projects",
        icon: <LuFolderKanban size={14} />,
        kbd: "G P",
        run: go("/projects"),
      },
      {
        id: "a-mood",
        title: "Go to Moodboards",
        icon: <LuImage size={14} />,
        run: go("/moodboards"),
      },
      {
        id: "a-docs",
        title: "Go to Documents",
        icon: <LuFileText size={14} />,
        kbd: "G D",
        run: go("/pages"),
      },
      {
        id: "a-habits",
        title: "Go to Habits",
        icon: <LuRepeat size={14} />,
        run: go("/habits"),
      },
      {
        id: "a-tpl",
        title: "Go to Templates",
        icon: <LuLayoutTemplate size={14} />,
        run: go("/templates"),
      },
      {
        id: "a-trash",
        title: "Go to Trash",
        icon: <LuTrash2 size={14} />,
        run: go("/trash"),
      },
      {
        id: "a-side",
        title: "Toggle sidebar",
        icon: <LuPanelLeft size={14} />,
        kbd: "⌘\\",
        home: true,
        run: shell.toggleSidebar,
      },
      {
        id: "a-set",
        title: "Settings",
        icon: <LuSettings size={14} />,
        kbd: "⌘,",
        home: true,
        run: () => openSettings(),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [router, shell.toggleSidebar, setComposerOpen, openSettings]
  );

  const groups = useMemo(() => {
    const actionRow = (a: Action, idx?: number[]): Row => ({
      key: a.id,
      kind: "action",
      title: a.title,
      idx,
      kbd: a.kbd,
      open: a.run,
    });
    const live = (docs.data ?? []).filter((d) => !d.trashedAt);
    const docRow = (d: (typeof live)[number], idx?: number[]): Row => ({
      key: `doc:${d.id}`,
      kind: "doc",
      title: d.title || "Untitled",
      idx,
      open: go(`/pages/${encodeURIComponent(d.id)}`),
    });
    if (!query) {
      return [
        {
          label: "Recent",
          rows: live
            .filter((d) => d.title)
            .slice(0, 4)
            .map((d) => docRow(d)),
        },
        {
          label: "Actions",
          rows: actions.filter((a) => a.home).map((a) => actionRow(a)),
        },
      ].filter((g) => g.rows.length);
    }
    const found = search.data ?? [];
    const byKind = (kind: V3SearchKind) =>
      rank(
        found.filter((r) => r.kind === kind),
        (r) => r.title,
        query,
        MAX
      ).map(
        ({ item, m }): Row => ({
          key: `${kind}:${item.id}`,
          kind,
          title: item.title,
          idx: m.idx,
          meta: KIND_META[kind],
          open: go(item.href),
        })
      );
    // The server's own matches that the local scorer would drop still count.
    const serverRows = (kind: V3SearchKind) => {
      const ranked = byKind(kind);
      const seen = new Set(ranked.map((r) => r.key));
      const restRows = found
        .filter((r) => r.kind === kind && !seen.has(`${kind}:${r.id}`))
        .slice(0, Math.max(0, MAX - ranked.length))
        .map(
          (r): Row => ({
            key: `${kind}:${r.id}`,
            kind,
            title: r.title,
            meta: KIND_META[kind],
            open: go(r.href),
          })
        );
      return ranked.concat(restRows);
    };
    const inbox = mail.data ?? [];
    const today = formatInTimeZone(newDate(), tz, "yyyy-MM-dd");
    return [
      {
        label: "Docs",
        rows: rank(live, (d) => d.title || "Untitled", query, MAX).map(
          ({ item, m }) => docRow(item, m.idx)
        ),
      },
      { label: "Tasks", rows: serverRows("task") },
      { label: "Projects", rows: serverRows("project") },
      { label: "Events", rows: serverRows("event") },
      {
        label: "Mailbox",
        rows: rank(inbox, (e) => `${e.subject}  ${e.from}`, query, MAX).map(
          ({ item, m }): Row => {
            const day = mailDayLabel(item.receivedAt, today);
            return {
              key: `mail:${item.id}`,
              kind: "mail",
              title: item.subject,
              idx: m.idx.filter((i) => i < item.subject.length),
              meta: `${item.from} · ${day === "Today" ? mailTime(item.receivedAt) : day}`,
              //todo: open the message itself once the v3 Mailbox (S4)
              // settles its deep link.
              open: go(`/mail?message=${encodeURIComponent(item.id)}`),
            };
          }
        ),
      },
      {
        label: "Actions",
        rows: rank(actions, (a) => a.title, query, MAX).map(({ item, m }) =>
          actionRow(item, m.idx)
        ),
      },
    ].filter((g) => g.rows.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, docs.data, mail.data, search.data, actions, tz]);

  const flat = groups.flatMap((g) => g.rows);
  const cur = Math.min(sel, Math.max(0, flat.length - 1));

  useEffect(() => {
    setSel(0);
    if (list.current) list.current.scrollTop = 0;
  }, [query]);
  useEffect(() => {
    list.current
      ?.querySelector(`[data-sx="${cur}"]`)
      ?.scrollIntoView?.({ block: "nearest" });
  }, [cur]);

  const activate = (r: Row | undefined) => {
    if (!r) return;
    onClose();
    r.open();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (flat.length) setSel((cur + 1) % flat.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (flat.length) setSel((cur - 1 + flat.length) % flat.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      activate(flat[cur]);
    }
  };

  const searching = !!query && search.isFetching && !flat.length;
  let n = -1;
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Search"
      scrimClassName="shell-search-palette-search-scrim nx-scrim"
      className="shell-search-palette-search nx-sheet"
      exitMs={170}
    >
      <div className="shell-search-palette-row">
        <span className="shell-notes-panel-row-2">
          <LuSearch size={17} />
        </span>
        <input
          className="shell-search-palette-search-2"
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKey}
          spellCheck={false}
          placeholder="Search docs, tasks, mail or type a command"
          aria-label="Search"
          role="combobox"
          aria-expanded={true}
          aria-controls="v3-search-results"
          aria-activedescendant={flat.length ? `v3-sx-${cur}` : undefined}
        />
        <Kbd>esc</Kbd>
      </div>

      <div
        className="shell-search-palette-div"
        ref={list}
        id="v3-search-results"
        role="listbox"
        aria-label="Results"
      >
        {flat.length ? (
          <div key={query ? `q:${query}` : "home"}>
            {groups.map((g) => (
              <div key={g.label} role="group" aria-label={g.label}>
                <div className="shell-search-palette-text">{g.label}</div>
                {g.rows.map((r) => {
                  n += 1;
                  const i = n;
                  const on = i === cur;
                  return (
                    <div
                      className="nx-swap shell-search-palette-sx"
                      key={r.key}
                      id={`v3-sx-${i}`}
                      data-sx={i}
                      role="option"
                      aria-selected={on}
                      onMouseMove={() => {
                        if (sel !== i) setSel(i);
                      }}
                      onClick={() => activate(r)}
                      style={{
                        background: on ? "var(--fill-3)" : "transparent",
                        animationDelay: `${Math.min(i * 16, 160)}ms`,
                      }}
                    >
                      <Lead
                        kind={r.kind}
                        icon={
                          r.kind === "action"
                            ? actions.find((a) => a.id === r.key)?.icon
                            : undefined
                        }
                      />
                      <span
                        className="shell-search-palette-span"
                        style={{
                          color: query
                            ? "var(--text-secondary)"
                            : "var(--text-primary)",
                        }}
                      >
                        <Hl text={r.title} idx={r.idx} />
                      </span>
                      {r.meta ? (
                        <span className="shell-search-palette-span-2">
                          {r.meta}
                        </span>
                      ) : null}
                      {r.kbd ? <Kbd>{r.kbd}</Kbd> : null}
                      {on ? (
                        <span className="shell-search-palette-span-3">↵</span>
                      ) : (
                        <span className="shell-search-palette-span-4" />
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        ) : (
          <div
            key={`none:${query}`}
            className="nx-swap shell-search-palette-swap"
          >
            <span className="shell-search-palette-span-5">
              <Art name="stack" size={44} />
            </span>
            <div className="shell-search-palette-text-2">
              {searching ? "Searching…" : `No results for “${query}”`}
            </div>
            {searching ? null : (
              <div className="shell-search-palette-text-3">
                Try fewer letters, or a doc, task or sender name.
              </div>
            )}
          </div>
        )}
      </div>

      <div className="shell-search-palette-row-2">
        <span className="shell-search-palette-row-3">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd>Move
        </span>
        <span className="shell-search-palette-row-3">
          <Kbd>↵</Kbd>Open
        </span>
        <span className="shell-notes-panel-stack-3" />
        <span>
          {query
            ? `${flat.length} ${flat.length === 1 ? "result" : "results"}`
            : "Docs, tasks, mail"}
        </span>
      </div>
    </Sheet>
  );
}
