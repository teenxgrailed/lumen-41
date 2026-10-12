"use client";

import {
  type AnimationEvent,
  type ButtonHTMLAttributes,
  type MouseEvent,
  type ReactNode,
  forwardRef,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { createPortal } from "react-dom";
import {
  LuCheck,
  LuChevronDown,
  LuCloud,
  LuEllipsis,
  LuFileText,
  LuFolder,
  LuPlus,
  LuTarget,
} from "react-icons/lu";

import { formatInTimeZone, newDate } from "@/lib/date-utils";
import { useConnections } from "@/lib/needt3/hooks/connections";
import { useCreateDoc, useDocs, useUpdateDoc } from "@/lib/needt3/hooks/docs";
import { useEvents } from "@/lib/needt3/hooks/events";
import { useMail } from "@/lib/needt3/hooks/mail";
import { useProjects } from "@/lib/needt3/hooks/projects";
import { useTimeZone } from "@/lib/needt3/hooks/settings";
import { useTasks } from "@/lib/needt3/hooks/tasks";
import { notify } from "@/lib/notifications";

import { useNeedt3Ui } from "@/store/needt3-ui";

import { useV3PortalContainer } from "../ctx/PortalScope";
import { registerCtx } from "../ctx/registry";
import { RichMenu } from "../menu/RichMenu";
import { Tooltip } from "../menu/Tooltip";
import { AccountMenu } from "./AccountMenu";
import { PlaceGlyph } from "./PlaceGlyph";
import { useShellApi } from "./ShellContext";
import {
  dayProgress,
  nextEventBadge,
  overdueCount,
  unreadCount,
  urgentIssue,
} from "./live";
import {
  type PlaceId,
  type SectionId,
  type ShellPlace,
  TILE_SHORT,
  foldSection,
  moreAlign,
  moreIsWide,
  placeById,
  placeForPath,
  setPlaceOn,
  splitPlaces,
} from "./places";
import { useSidebarPrefs } from "./useSidebarPrefs";

/* ---------- live clock: re-render once a minute, on the minute ---------- */
function useMinute(timeZone: string) {
  const read = () =>
    formatInTimeZone(newDate(), timeZone, "yyyy-MM-dd'T'HH:mm");
  const [now, setNow] = useState(read);
  useEffect(() => {
    let t = 0;
    const tick = () => {
      setNow(read());
      t = window.setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50);
    };
    tick();
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeZone]);
  return now;
}

/* ---------- a place tile ---------- */
interface TileBadge {
  text: string;
  title?: string;
  danger?: boolean;
  accent?: boolean;
}

interface TileProps {
  place: { id: string; label: string };
  active: boolean;
  progress?: { done: number; total: number } | null;
  urgent?: string | null;
  badge?: TileBadge | null;
  alert?: string | null;
  wide?: boolean;
}

/** The urgent wash breathes three times, then rests (a new reason replays). */
function useRested(urgent: string | null | undefined) {
  const [rested, setRested] = useState(false);
  const issue = urgentIssue(urgent ?? null);
  useEffect(() => setRested(false), [issue]);
  const onAnimationEnd = (e: AnimationEvent<HTMLElement>) => {
    if (
      e.target === e.currentTarget &&
      String(e.animationName).includes("sb-urgent")
    )
      setRested(true);
  };
  return { rested, onAnimationEnd };
}

function tileClass({ wide, urgent }: TileProps, rested: boolean) {
  return (
    "sb-place sb-place-box" +
    (wide ? " is-wide" : "") +
    (urgent ? " sb-urgent is-urgent" + (rested ? " is-rested" : "") : "")
  );
}

function TileBody({
  place,
  active,
  progress,
  urgent,
  badge,
  alert,
}: TileProps) {
  const short = TILE_SHORT[place.id as PlaceId];
  const pct = progress
    ? Math.max(0, Math.min(1, progress.done / Math.max(progress.total, 1)))
    : 0;
  const full =
    !!progress && progress.total > 0 && progress.done >= progress.total;
  const label = progress ? (
    full ? (
      <>
        <LuCheck size={11} />
        {progress.done}/{progress.total}
      </>
    ) : (
      `${progress.done}/${progress.total}`
    )
  ) : null;
  return (
    <>
      <PlaceGlyph id={place.id} />
      <span className={`sb-place-label${active ? " is-on" : ""}`}>
        {short || place.label}
      </span>
      {progress ? (
        <span
          className={`sb-count${full ? " is-full" : ""}`}
          data-pct={Math.round(pct * 100)}
          title={`${progress.done} of ${progress.total} due today done`}
        >
          <span className="sb-count-label">{label}</span>
          <span
            className="sb-count-fill"
            aria-hidden="true"
            style={{
              clipPath: `inset(0 ${((1 - pct) * 100).toFixed(2)}% 0 0 round 9999px)`,
            }}
          >
            <span className="sb-count-label">{label}</span>
          </span>
        </span>
      ) : badge ? (
        <span
          className="sb-badge shell-place-tile-badge"
          title={badge.title}
          style={{
            background: urgent
              ? "color-mix(in oklch, var(--destructive) 18%, transparent)"
              : badge.danger
                ? "var(--destructive)"
                : badge.accent
                  ? "var(--fill-accent)"
                  : "var(--fill-5)",
            color: urgent
              ? "var(--destructive)"
              : badge.danger
                ? "var(--text-on-fill)"
                : badge.accent
                  ? "var(--accent)"
                  : "var(--text-secondary)",
          }}
        >
          {badge.text}
        </span>
      ) : null}
      {alert ? (
        <span
          className="shell-place-tile-layer"
          title={alert}
          style={{ right: badge ? 36 : 10 }}
        />
      ) : null}
    </>
  );
}

/** A place, not a link only: where you go AND what is waiting there. */
function PlaceTile(props: TileProps & { href: string }) {
  const { rested, onAnimationEnd } = useRested(props.urgent);
  const short = TILE_SHORT[props.place.id as PlaceId];
  return (
    <Link
      href={props.href}
      className={tileClass(props, rested)}
      aria-label={props.place.label}
      aria-current={props.active ? "page" : undefined}
      title={props.urgent || (short ? props.place.label : undefined)}
      data-sb-place={props.place.id}
      onAnimationEnd={props.urgent ? onAnimationEnd : undefined}
    >
      <TileBody {...props} />
    </Link>
  );
}

/** The More tile: a button (it opens the menu), drawn like a place. */
const MoreTile = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { active: boolean; wide: boolean }
>(function MoreTile({ active, wide, ...rest }, ref) {
  const place = { id: "more", label: "More" } as const;
  return (
    <button
      ref={ref}
      type="button"
      {...rest}
      className={tileClass({ place, active, wide }, false)}
      aria-label="More"
      aria-current={active ? "page" : undefined}
      data-sb-place="more"
    >
      <TileBody place={place} active={active} />
    </button>
  );
});

/* ---------- section heads, folds and rows ---------- */
function HeadBtn({
  label,
  onClick,
  on,
  btnRef,
  children,
}: {
  label: string;
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
  on?: boolean;
  btnRef?: React.Ref<HTMLButtonElement>;
  children: ReactNode;
}) {
  return (
    <Tooltip label={label} side="top-end">
      <button
        type="button"
        ref={btnRef}
        aria-label={label}
        aria-expanded={on || undefined}
        className={`sb-hbtn${on ? " is-on" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          onClick(e);
        }}
      >
        {children}
      </button>
    </Tooltip>
  );
}

function SectionHead({
  id,
  title,
  shut,
  addLabel,
  onAdd,
  addOpen,
  addRef,
  onFold,
}: {
  id: SectionId;
  title: string;
  shut: boolean;
  addLabel: string;
  onAdd: () => void;
  addOpen?: boolean;
  addRef?: React.Ref<HTMLButtonElement>;
  onFold: () => void;
}) {
  return (
    <div
      className={`sb-head${addOpen ? " is-hot" : ""}`}
      role="button"
      tabIndex={0}
      aria-expanded={!shut}
      data-sb-head={id}
      onClick={onFold}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onFold();
        }
      }}
    >
      <span className="sb-head-title">{title}</span>
      <span className="sb-head-tools">
        <HeadBtn label={addLabel} onClick={onAdd} on={addOpen} btnRef={addRef}>
          <LuPlus size={16} />
        </HeadBtn>
        <HeadBtn label={shut ? "Expand" : "Collapse"} onClick={onFold}>
          <span
            className="sb-chev"
            style={{ transform: shut ? "rotate(-90deg)" : "none" }}
          >
            <LuChevronDown size={15} />
          </span>
        </HeadBtn>
      </span>
    </div>
  );
}

function Fold({ shut, children }: { shut: boolean; children: ReactNode }) {
  return (
    <div
      className={`nx-fold${shut ? " is-shut" : ""}`}
      aria-hidden={shut || undefined}
    >
      <div className="base-stack">{children}</div>
    </div>
  );
}

/** A nav row: 32px, radius 10, 16px icon — the one sidebar rhythm. */
function SbRow({
  href,
  icon,
  label,
  current,
  trailing,
  hoverTrailing,
}: {
  href: string;
  icon: ReactNode;
  label: ReactNode;
  current?: boolean;
  trailing?: ReactNode;
  hoverTrailing?: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`sb-row${current ? " is-current" : ""}`}
      aria-current={current ? "page" : undefined}
    >
      <span className="sb-row-icon">{icon}</span>
      <span
        className="sb-row-label"
        title={
          typeof label === "string" && label.length > 22 ? label : undefined
        }
      >
        {label}
      </span>
      {trailing != null || hoverTrailing ? (
        <span className="sb-row-trail">
          {trailing != null ? (
            <span className="sb-row-count">{trailing}</span>
          ) : null}
          {hoverTrailing ? (
            <span className="sb-row-more">{hoverTrailing}</span>
          ) : null}
        </span>
      ) : null}
    </Link>
  );
}

/* ---------- Pin a doc: search first, arrows + Enter ---------- */
function PinPop({
  anchor,
  onClose,
}: {
  anchor: HTMLElement | null;
  onClose: () => void;
}) {
  const container = useV3PortalContainer();
  const docs = useDocs();
  const update = useUpdateDoc();
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const panel = useRef<HTMLDivElement>(null);
  const list = (docs.data ?? []).filter(
    (d) =>
      !d.trashedAt &&
      !d.isFavorite &&
      (d.title || "Untitled").toLowerCase().includes(q.trim().toLowerCase())
  );
  useEffect(() => setI(0), [q]);
  useEffect(() => {
    const away = (e: globalThis.MouseEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !anchor?.contains(t)) onClose();
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [anchor, onClose]);
  useEffect(() => {
    panel.current
      ?.querySelector(`[data-i="${i}"]`)
      ?.scrollIntoView?.({ block: "nearest" });
  }, [i]);
  const pin = (d: (typeof list)[number] | undefined) => {
    if (!d) return;
    onClose();
    void update
      .mutateAsync({ id: d.id, patch: { isFavorite: true } })
      .then(({ undo }) =>
        notify.success(`Pinned “${d.title || "Untitled"}”`, {
          action: { label: "Undo", onClick: () => void undo() },
        })
      )
      .catch(() => undefined);
  };
  if (!container) return null;
  const host = (anchor?.closest(".sb-head") as HTMLElement | null) ?? anchor;
  const r = host?.getBoundingClientRect();
  const left = Math.min((r?.right ?? 280) + 10, window.innerWidth - 300);
  const top = Math.max(
    8,
    Math.min((r?.top ?? 100) - 8, window.innerHeight - 380)
  );
  return createPortal(
    <div
      ref={panel}
      role="dialog"
      aria-label="Pin a doc"
      className="nx-pop sb-pinpop"
      style={{ left, top }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          setI((n) => Math.min(n + 1, list.length - 1));
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setI((n) => Math.max(n - 1, 0));
        } else if (e.key === "Enter") {
          e.preventDefault();
          pin(list[i]);
        }
      }}
    >
      <span className="sb-pinpop-grab" aria-hidden="true" />
      <input
        autoFocus
        className="sb-pinpop-q"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Pin a doc"
        aria-label="Pin a doc"
      />
      <div className="sb-pinpop-list scroll-inner" role="listbox">
        {list.length ? (
          list.map((d, n) => (
            <button
              key={d.id}
              type="button"
              role="option"
              aria-selected={n === i}
              data-i={n}
              className={`sb-pinpop-item${n === i ? " is-on" : ""}`}
              onMouseEnter={() => setI(n)}
              onClick={() => pin(d)}
            >
              <span className="sb-row-icon">
                <LuFileText size={16} />
              </span>
              <span className="sb-row-label" title={d.title || "Untitled"}>
                {d.title || "Untitled"}
              </span>
            </button>
          ))
        ) : (
          <span className="sb-pinpop-empty">
            {docs.isLoading
              ? "Loading…"
              : q
                ? "No docs match"
                : "Every doc is pinned"}
          </span>
        )}
      </div>
    </div>,
    container
  );
}

/* ---------- Focus: a pill that opens the Focus window ---------- */
function FocusControl() {
  const focusOpen = useNeedt3Ui((s) => s.focusOpen);
  const setFocusOpen = useNeedt3Ui((s) => s.setFocusOpen);
  //todo: running state (clock + ring) once the Focus window (S4) exposes
  // its session; until then the pill is always idle.
  return (
    <Tooltip label="Start a focus session" keys="⌘⇧F" side="top-start">
      <button
        type="button"
        aria-label="Focus"
        aria-haspopup="dialog"
        aria-expanded={focusOpen}
        data-sb-focus="idle"
        className={`nx-press sb-focus sb-reveal${focusOpen ? " is-open" : ""}`}
        onClick={() => setFocusOpen(true)}
      >
        <span className="sb-focus-mark" aria-hidden="true">
          <LuTarget size={16} />
        </span>
        <span className="sb-focus-label sb-reveal-label">Focus</span>
      </button>
    </Tooltip>
  );
}

/** "/projects?new=project" — the screen that owns the thing opens its own
 *  create flow (the prototype's `needt-new` event, as a URL). */
const newHref = (path: string, what: string) => `${path}?new=${what}`;

/* ---------- the rail ---------- */
export function Sidebar() {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const shell = useShellApi();
  const setComposerOpen = useNeedt3Ui((s) => s.setComposerOpen);
  const [prefs, setPrefs] = useSidebarPrefs();
  const { tiles, rest } = splitPlaces(prefs);
  const sections = prefs.sections.filter((s) => s.on);
  const timeZone = useTimeZone();
  const now = useMinute(timeZone);
  const today = now.slice(0, 10);

  const tasks = useTasks();
  const docs = useDocs();
  const createDoc = useCreateDoc();
  const updateDoc = useUpdateDoc();
  const projects = useProjects();
  const connections = useConnections();
  const showMail = tiles.some((p) => p.id === "mail");
  const showCal = tiles.some((p) => p.id === "calendar");
  const mail = useMail("inbox");
  const events = useEvents();

  const taskList = useMemo(() => tasks.data ?? [], [tasks.data]);
  const progress = dayProgress(taskList, today);
  const overdue = overdueCount(taskList, today);
  const unread = showMail ? unreadCount(mail.data ?? []) : 0;
  const cal = showCal ? nextEventBadge(events.data ?? [], now) : null;
  const down = (connections.data ?? []).filter((c) => c.state !== "connected");
  const mailDown = down.filter((c) => c.kind === "mail");

  const pinned = (docs.data ?? []).filter((d) => d.isFavorite && !d.trashedAt);
  const projectRows = (projects.data ?? [])
    .filter((p) => !p.archived)
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((p) => ({
      ...p,
      open: taskList.filter((t) => t.projectId === p.id && !t.done && !t.noSlot)
        .length,
    }));

  const [pinOpen, setPinOpen] = useState(false);
  const pinRef = useRef<HTMLButtonElement>(null);
  const here = placeForPath(pathname);

  const tile = (p: ShellPlace) => {
    const urgent =
      p.id === "today" && overdue
        ? `${overdue} overdue — they compete for today’s hours`
        : p.id === "calendar"
          ? (cal?.urgent ?? null)
          : null;
    const badge: TileBadge | null =
      p.id === "tasks" && overdue
        ? {
            text: String(overdue),
            danger: true,
            title: `${overdue} overdue ${overdue === 1 ? "task" : "tasks"}`,
          }
        : p.id === "mail" && unread
          ? { text: String(unread), accent: true }
          : p.id === "calendar" && cal
            ? { text: cal.text }
            : null;
    const alert =
      p.id === "mail" && mailDown.length
        ? `${mailDown.map((c) => c.label).join(", ")} ${mailDown.length === 1 ? "needs" : "need"} reconnecting`
        : null;
    return (
      <PlaceTile
        place={p}
        href={p.href}
        active={here === p.id}
        progress={p.id === "today" ? progress : null}
        urgent={urgent}
        badge={badge}
        alert={alert}
      />
    );
  };

  const fold = (id: SectionId) => void setPrefs((s) => foldSection(s, id));

  /* Right-click on what the rail owns (ctx.jsx: place, section, project, doc). */
  useEffect(() => {
    const offs = [
      registerCtx("place", ({ id }) => {
        const p = id ? placeById(id) : undefined;
        if (!p) return null;
        return [
          [{ label: "Open", run: () => router.push(p.href) }],
          [
            {
              label: "Hide from Sidebar",
              run: () => {
                void setPrefs((s) => setPlaceOn(s, p.id, false)).then(() =>
                  notify.success("Moved into More", {
                    action: {
                      label: "Undo",
                      onClick: () =>
                        void setPrefs((s) => setPlaceOn(s, p.id, true)),
                    },
                  })
                );
              },
            },
            { label: "Customize Sidebar…", run: shell.openCustomize },
          ],
        ];
      }),
      registerCtx("section", () => [
        [{ label: "Customize Sidebar…", run: shell.openCustomize }],
      ]),
      registerCtx("project", ({ id }) =>
        id
          ? [
              [
                {
                  label: "Open",
                  run: () => router.push(`/projects/${encodeURIComponent(id)}`),
                },
              ],
              [
                { label: "New Task", run: () => setComposerOpen(true) },
                {
                  label: "New Doc",
                  run: () => newDoc(id),
                },
              ],
            ]
          : null
      ),
      registerCtx("doc", ({ id }) => {
        const d = (docs.data ?? []).find((x) => x.id === id);
        if (!d) return null;
        return [
          [
            {
              label: "Open",
              run: () => router.push(`/pages/${encodeURIComponent(d.id)}`),
            },
          ],
          [
            {
              label: d.isFavorite ? "Unpin" : "Pin",
              run: () => {
                void updateDoc
                  .mutateAsync({
                    id: d.id,
                    patch: { isFavorite: !d.isFavorite },
                  })
                  .then(({ undo }) =>
                    notify.success(d.isFavorite ? "Unpinned" : "Pinned", {
                      action: { label: "Undo", onClick: () => void undo() },
                    })
                  )
                  .catch(() => undefined);
              },
            },
          ],
        ];
      }),
    ];
    return () => offs.forEach((off) => off());
  });

  function newDoc(projectId: string | null = null) {
    void createDoc
      .mutateAsync({ draft: { title: "", projectId } })
      .then(({ result }) => {
        if (result) router.push(`/pages/${encodeURIComponent(result.id)}`);
      })
      .catch(() => undefined);
  }

  const n = tiles.length;
  const moreActive = rest.some((p) => p.id === here);

  return (
    <aside className="shell-sidebar-stack" aria-label="Sidebar">
      <div className="shell-sidebar-row">
        <AccountMenu />
      </div>

      <div
        className="scroll-inner shell-sidebar-scroll-inner"
        onScroll={(e) => {
          if (e.currentTarget.scrollLeft) e.currentTarget.scrollLeft = 0;
        }}
      >
        <div className="shell-sidebar-grid">
          {tiles.map((p, i) => (
            <div
              key={p.id}
              className="sb-tile"
              style={{ animationDelay: `${i * 25}ms` }}
              data-ctx="place"
              data-ctx-id={p.id}
              data-ctx-child=""
            >
              {tile(p)}
            </div>
          ))}
          {/* More: every place that is not a tile, plus Customize. A full
              row of tiles puts More on a short full-width row of its own. */}
          <div
            className={`sb-tile${moreIsWide(n) ? " sb-tile-wide" : ""}`}
            style={{ animationDelay: `${n * 25}ms` }}
            data-ctx="section"
          >
            <RichMenu
              block
              align={moreAlign(n)}
              width={300}
              trigger={(open) => (
                <MoreTile active={open || moreActive} wide={moreIsWide(n)} />
              )}
              items={[
                ...(rest.length
                  ? rest.map((p) => ({
                      art: p.art,
                      title: p.label,
                      sub: p.sub,
                      onClick: () => router.push(p.href),
                    }))
                  : [
                      {
                        art: "page" as const,
                        title: "Everything is a tile",
                        sub: "Hide a place to keep it here",
                      },
                    ]),
                { sep: true as const },
                {
                  art: "tune" as const,
                  title: "Customize Sidebar",
                  sub: "Choose tiles and sections",
                  onClick: shell.openCustomize,
                },
              ]}
            />
          </div>
        </div>

        {/* Connections: one place for every account Needt reads; says
            "1 issue" in red while one is down. */}
        <div
          className="sb-tile shell-sidebar-sb-connections"
          data-sb-connections=""
        >
          <SbRow
            href="/connections"
            label="Connections"
            current={pathname.startsWith("/connections")}
            icon={<LuCloud size={16} />}
            trailing={
              down.length ? (
                <span
                  className="shell-sidebar-sb-conn-issue"
                  data-sb-conn-issue=""
                  title={`${down.map((c) => c.label).join(", ")} ${down.length === 1 ? "needs" : "need"} reconnecting`}
                >
                  <span className="shell-sidebar-bar" aria-hidden="true" />
                  {down.length} {down.length === 1 ? "issue" : "issues"}
                </span>
              ) : null
            }
          />
        </div>

        {sections.map((sec) =>
          sec.id === "starred" ? (
            <div
              key="starred"
              className="sb-tile base-stack"
              data-ctx="section"
            >
              <SectionHead
                id="starred"
                title="Pinned"
                shut={!!prefs.collapsed.starred}
                addLabel="Pin a doc"
                addOpen={pinOpen}
                addRef={pinRef}
                onAdd={() => setPinOpen((v) => !v)}
                onFold={() => fold("starred")}
              />
              <Fold shut={!!prefs.collapsed.starred}>
                {pinned.length ? (
                  pinned.map((d) => (
                    <div
                      key={d.id}
                      className="nx-swap"
                      data-ctx="doc"
                      data-ctx-id={d.id}
                      data-ctx-child=""
                    >
                      <SbRow
                        href={`/pages/${encodeURIComponent(d.id)}`}
                        label={d.title || "Untitled"}
                        current={pathname === `/pages/${d.id}`}
                        icon={<LuFileText size={16} />}
                      />
                    </div>
                  ))
                ) : (
                  <span className="nx-swap base-meta shell-sidebar-swap">
                    Pin docs to keep them close
                  </span>
                )}
              </Fold>
              {pinOpen ? (
                <PinPop
                  anchor={pinRef.current}
                  onClose={() => setPinOpen(false)}
                />
              ) : null}
            </div>
          ) : (
            <div
              key="projects"
              className="sb-tile base-stack"
              data-ctx="section"
            >
              <SectionHead
                id="projects"
                title="Projects"
                shut={!!prefs.collapsed.projects}
                addLabel="New project"
                onAdd={() => router.push(newHref("/projects", "project"))}
                onFold={() => fold("projects")}
              />
              <Fold shut={!!prefs.collapsed.projects}>
                {/* A task dragged onto a project row moves into it (the drag
                    layer reads data-drop="project"). */}
                {projectRows.map((p) => (
                  <div
                    key={p.id}
                    data-ctx="project"
                    data-ctx-id={p.id}
                    data-ctx-child=""
                    data-drop="project"
                    data-id={p.id}
                    data-label={p.name}
                  >
                    <SbRow
                      href={`/projects/${encodeURIComponent(p.id)}`}
                      label={p.name}
                      current={pathname === `/projects/${p.id}`}
                      icon={
                        <span
                          className="shell-sidebar-grid-2"
                          style={{ color: p.color ?? "var(--text-tertiary)" }}
                        >
                          <LuFolder size={16} />
                        </span>
                      }
                      trailing={p.open ? p.open : null}
                      hoverTrailing={
                        <button
                          type="button"
                          className="sb-hbtn sb-hbtn-sm"
                          aria-label={`Actions for ${p.name}`}
                          onClick={(e) => {
                            // "…" opens the same menu a right-click does.
                            e.preventDefault();
                            e.stopPropagation();
                            const r = e.currentTarget.getBoundingClientRect();
                            e.currentTarget.dispatchEvent(
                              new globalThis.MouseEvent("contextmenu", {
                                bubbles: true,
                                cancelable: true,
                                clientX: r.left,
                                clientY: r.bottom + 4,
                              })
                            );
                          }}
                        >
                          <LuEllipsis size={15} />
                        </button>
                      }
                    />
                  </div>
                ))}
              </Fold>
            </div>
          )
        )}
      </div>

      <div className="shell-sidebar-stack-2">
        {/* //todo: Needt Pro promo strip (S1 paywall PwPromoCard) above the foot. */}
        <div className="sb-foot shell-sidebar-foot">
          <span
            data-drop="focus"
            className="pop-up focus-icon shell-sidebar-drop"
          >
            <FocusControl />
          </span>
          {/* //todo: Import menu (Markdown, Notion, Google Docs, .ics, CSV)
              once import.jsx is ported; only a tasks CSV route exists today. */}
          <span className="shell-sidebar-row-2">
            {/* The one create button for everything. A page's own + only
                makes that page's thing. */}
            <RichMenu
              up
              align="right"
              width={300}
              trigger={(open) => (
                <button
                  type="button"
                  aria-label="Create"
                  aria-expanded={open}
                  className="nx-btn nx-btn-secondary sb-create"
                >
                  <LuPlus size={16} />
                  Create
                </button>
              )}
              items={[
                {
                  art: "task",
                  title: "New task",
                  sub: "Placed into a free hour",
                  kbd: "N",
                  onClick: () => setComposerOpen(true),
                },
                {
                  art: "doc",
                  title: "New doc",
                  sub: "A page for anything",
                  onClick: () => newDoc(),
                },
                {
                  art: "event",
                  title: "New event",
                  sub: "Blocks time on your calendar",
                  onClick: () => router.push(newHref("/calendar", "event")),
                },
                {
                  art: "work",
                  title: "New project",
                  sub: "A folder with its own colour",
                  onClick: () => router.push(newHref("/projects", "project")),
                },
                {
                  art: "habit",
                  title: "New habit",
                  sub: "Comes back daily, never piles up",
                  onClick: () => router.push(newHref("/habits", "habit")),
                },
                {
                  art: "stack",
                  title: "New moodboard",
                  sub: "References side by side",
                  onClick: () =>
                    router.push(newHref("/moodboards", "moodboard")),
                },
              ]}
            />
          </span>
        </div>
      </div>
    </aside>
  );
}
