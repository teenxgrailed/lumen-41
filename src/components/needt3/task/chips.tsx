import Link from "next/link";

import { FiFileText, FiMail, FiMessageSquare } from "react-icons/fi";

import { PartRing } from "./PartRing";
import type { TaskView } from "./view";

export function SourceChip({
  view,
  desk = false,
}: {
  view: TaskView;
  desk?: boolean;
}) {
  const source = view.source;
  if (!source) return null;
  const names = { mail: "Mailbox", doc: "Document", chat: "Chat" };
  const Icon =
    source.kind === "mail"
      ? FiMail
      : source.kind === "doc"
        ? FiFileText
        : FiMessageSquare;
  const title = `From ${names[source.kind]}`;
  const className = desk ? "hd-srci" : "tk-src";
  const style = desk
    ? {
        display: "grid",
        placeItems: "center",
        width: 16,
        height: 16,
        padding: 0,
        border: 0,
        borderRadius: 4,
        background: "transparent",
        color: "inherit",
      }
    : undefined;
  return source.kind === "mail" && source.id ? (
    <Link
      href="/mail"
      className={className}
      style={style}
      title={title}
      aria-label={`${title} — open Mailbox`}
      onClick={(event) => event.stopPropagation()}
    >
      <Icon size={12} aria-hidden="true" />
    </Link>
  ) : (
    <span className={className} style={style} title={title} aria-label={title}>
      <Icon size={12} aria-hidden="true" />
    </span>
  );
}

export function PartCount({ view }: { view: TaskView }) {
  return view.parts ? (
    <span
      className="tk-count"
      title={`${view.parts.done} of ${view.parts.total} parts done`}
    >
      <PartRing {...view.parts} />
      {view.parts.done}/{view.parts.total}
    </span>
  ) : null;
}

export function TaskValue({ view }: { view: TaskView }) {
  return view.value ? (
    <span className="tk-value">CHF {view.value.toLocaleString("de-CH")}</span>
  ) : null;
}

export function DeskMeta({
  view: v,
  late,
  hot,
  hideProject,
}: {
  view: TaskView;
  late?: boolean;
  hot?: boolean;
  hideProject?: boolean;
}) {
  return (
    <span
      className={`hd-meta tk-dmeta${hot ? " is-hot" : ""}`}
      style={{
        color: hot ? "var(--text-secondary)" : "var(--text-tertiary)",
        transition: "color var(--transition-hover)",
      }}
    >
      <span className="tk-cell tk-cell-time">
        {late && v.due ? (
          <span
            className="hd-late"
            title={v.lateTitle}
            style={{ color: "var(--destructive)" }}
          >
            {v.due}
          </span>
        ) : (
          v.time
        )}
      </span>
      <span className="tk-cell tk-cell-dur">{v.minutes ? v.dur : null}</span>
      <span className="tk-cell tk-cell-src">
        <SourceChip view={v} desk />
      </span>
      {hideProject ? null : (
        <span
          className="tk-cell tk-cell-proj"
          title={v.projectName || undefined}
        >
          {v.projectName ? (
            <>
              <span
                aria-hidden="true"
                className="tk-dot"
                style={{ background: v.hue || "var(--text-muted)" }}
              />
              <span className="tk-ellip">{v.projectName}</span>
            </>
          ) : null}
        </span>
      )}
    </span>
  );
}

export function LineMeta({
  view: v,
  late,
  hideProject,
}: {
  view: TaskView;
  late?: boolean;
  hideProject?: boolean;
}) {
  if (
    !v.time &&
    !(late && v.due) &&
    !v.minutes &&
    !v.source &&
    (!v.projectName || hideProject)
  )
    return null;
  return (
    <span className="tk-lmeta">
      {late && v.due ? (
        <span title={v.lateTitle} className="tk-late">
          {v.due}
        </span>
      ) : v.time ? (
        <span>{v.time}</span>
      ) : null}
      {v.minutes ? <span>{v.dur}</span> : null}
      <SourceChip view={v} />
      {v.projectName && !hideProject ? (
        <span className="tk-lm-proj">
          <span
            aria-hidden="true"
            className="tk-dot"
            style={{ background: v.hue || "var(--text-muted)" }}
          />
          <span className="tk-lm-name">{v.projectName}</span>
        </span>
      ) : null}
    </span>
  );
}
