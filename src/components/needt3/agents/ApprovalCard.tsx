"use client";

import { useEffect, useRef, useState } from "react";

import { FiCheck, FiClock, FiCornerUpLeft, FiZap } from "react-icons/fi";

import { formatDateToLocal, newDate } from "@/lib/date-utils";

import { AgentIcon } from "./AgentIcon";
import type { HubItemRow } from "./TasksTab";

interface HubFile {
  id: string;
  name: string;
  mime: string;
}

/** How long Approve waits before it is sent, so Undo is real. */
export const UNDO_MS = 5000;

/** "18:00" today, "Tue 18:00" another day, "" for a date that is not one. */
export function hhmm(
  iso: string | null | undefined,
  now = newDate().getTime()
) {
  if (!iso) return "";
  const d = newDate(iso);
  if (isNaN(d.getTime())) return "";
  const time = formatDateToLocal(d).slice(11, 16);
  if (d.toDateString() === newDate(now).toDateString()) return time;
  return `${d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })} ${time}`;
}

/** "in 12 min", "in 2 h 14 min", "in 3 d", or null once it has passed. */
function until(iso: string, now: number) {
  const ms = newDate(iso).getTime() - now;
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const m = Math.round(ms / 60000);
  if (m < 60) return `in ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `in ${h} h ${m % 60} min`;
  return `in ${Math.round(h / 24)} d`;
}

/** A 9:16 preview of a media file: plays in place with its progress. */
function Preview({ file }: { file: HubFile }) {
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const src = `/api/agent-hub/attachments/${file.id}`;
  const isVideo = file.mime.startsWith("video/");
  const name = file.name.replace(/\.[^.]+$/, "");
  return (
    <button
      type="button"
      className={
        "ag-th" + (playing ? " is-playing" : "") + (isVideo ? " is-video" : "")
      }
      title={`Preview: ${file.name}`}
      aria-label={`${isVideo ? (playing ? "Pause" : "Play") : "Preview"} ${file.name}`}
      onClick={() => {
        const v = video.current;
        if (!isVideo || !v) {
          window.open(src, "_blank", "noopener");
          return;
        }
        if (v.paused)
          void v
            .play()
            .then(() => setPlaying(true))
            .catch(() => undefined);
        else {
          v.pause();
          setPlaying(false);
        }
      }}
    >
      {isVideo ? (
        <video
          ref={video}
          src={src}
          muted
          playsInline
          preload="none"
          onTimeUpdate={(e) => {
            const v = e.currentTarget;
            setProgress(v.duration ? v.currentTime / v.duration : 0);
          }}
          onEnded={() => setPlaying(false)}
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- an authenticated attachment, not a static asset
        <img src={src} alt="" loading="lazy" />
      )}
      <em>{name}</em>
      {isVideo ? (
        <i
          className="ag-th-bar"
          style={{ transform: `scaleX(${progress})` }}
          aria-hidden="true"
        />
      ) : null}
    </button>
  );
}

/**
 * What an agent asks you, in Chat (owner's final reference, card v3): a
 * dark card on a tray in its status colour. The top line says what it is
 * and when; the agent and its question; previews of the item's media
 * (vertical, they play in place); Approve and
 * Answer; the tray's foot says what waits, and after Approve offers Undo
 * for five seconds before anything is sent. Everything comes from the hub
 * item: what it does not have is not drawn.
 */
export function ApprovalCard({
  item,
  agent,
  now,
  done,
  onApprove,
  onLeavePage,
  onAnswer,
  onOpen,
}: {
  item: HubItemRow;
  agent: string;
  now: number;
  done: "approved" | "answered" | null;
  /** Sends the approval after the Undo window; false when it failed. */
  onApprove: () => Promise<boolean | void> | void;
  /**
   * The page is closing inside the Undo window: send the approval with a
   * request that outlives the page (fetch keepalive).
   */
  onLeavePage?: () => void;
  onAnswer: () => void;
  onOpen: () => void;
}) {
  const risky = item.risks.some((r) => !item.approvals[r]);
  const [pending, setPending] = useState(false);
  const timer = useRef<number | null>(null);
  const send = useRef(onApprove);
  send.current = onApprove;
  const leave = useRef(onLeavePage);
  leave.current = onLeavePage;
  const status = useRef(item.status);
  status.current = item.status;
  // Closing the tab inside the Undo window: the approval goes out with the
  // page, unless the item has moved on (no longer waiting on the owner).
  useEffect(() => {
    if (!pending) return undefined;
    const away = () => {
      if (!timer.current) return;
      window.clearTimeout(timer.current);
      timer.current = null;
      if (status.current === "needs_owner") leave.current?.();
    };
    window.addEventListener("pagehide", away);
    return () => window.removeEventListener("pagehide", away);
  }, [pending]);
  // Leaving the card inside the Undo window (another tab, a refetch) sends
  // the approval now: it was shown as approved, so it must not be lost.
  useEffect(
    () => () => {
      if (!timer.current) return;
      window.clearTimeout(timer.current);
      timer.current = null;
      void send.current();
    },
    []
  );
  // Stubs from the overview: no request per card; a file loads on a click.
  const media: HubFile[] = (item.media ?? []).slice(0, 3);
  const due = item.due ?? null;
  // A post or a message has a send time; anything else has a due time.
  const posts = item.risks.some((r) => r === "publish" || r === "send_message");
  const when = due ? `${posts ? "posts at" : "due"} ${hhmm(due)}` : null;
  const left = due ? until(due, now) : null;
  const ok = pending || done === "approved" || done === "answered";

  const approve = () => {
    setPending(true);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      void Promise.resolve(send.current()).then((ok) => {
        // A failed approval reopens the card.
        if (ok === false) setPending(false);
      });
    }, UNDO_MS);
  };
  const undo = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    setPending(false);
  };

  return (
    <div
      className={"ag-tray" + (ok ? " is-ok" : risky ? "" : " is-ask")}
      data-ag-ask={item.id}
      data-ag-ask-state={pending ? "pending" : (done ?? "open")}
    >
      <div className="ag-acard3">
        <div className="ag-acard3-top">
          <span className="ag-acard3-what">
            {risky
              ? `Approval · ${item.risks.filter((r) => !item.approvals[r]).join(", ")}`
              : "Question"}
          </span>
          {due ? (
            <span title={left ?? undefined}>
              <FiClock size={14} aria-hidden />
              {left ? `${hhmm(due)} · ${left}` : hhmm(due)}
            </span>
          ) : (
            <span>
              <FiClock size={14} aria-hidden />
              {hhmm(item.updatedAt)}
            </span>
          )}
        </div>
        <div className="ag-acard3-who">
          <span className="ag-acard3-av">
            <AgentIcon name={agent} size={30} />
          </span>
          <div className="ag-acard3-q">
            <b>{agent}</b>
            <small>
              <i aria-hidden="true" />
              {item.question ?? item.title}
            </small>
            <button type="button" className="ag-acard3-ctx" onClick={onOpen}>
              {item.title}
            </button>
          </div>
          {media.length ? (
            <div className="ag-acard3-thumbs">
              {media.map((f) => (
                <Preview key={f.id} file={f} />
              ))}
            </div>
          ) : null}
        </div>
        {ok ? null : (
          <div className="ag-acard3-btns">
            {risky ? (
              <button type="button" data-ag-approve="" onClick={approve}>
                <FiCheck size={17} aria-hidden />
                Approve
              </button>
            ) : null}
            <button type="button" onClick={onAnswer}>
              <FiCornerUpLeft size={17} aria-hidden />
              Answer
            </button>
            {risky ? null : (
              <button type="button" onClick={onOpen}>
                Open task
              </button>
            )}
          </div>
        )}
      </div>
      <div className="ag-tray-foot">
        {pending ? (
          <>
            <FiCheck size={16} aria-hidden />
            {`Approved${when ? ` · ${agent} ${when}` : ""}`}
            <button type="button" data-ag-undo="" onClick={undo}>
              Undo
            </button>
          </>
        ) : done ? (
          <>
            <FiCheck size={16} aria-hidden />
            {done === "approved"
              ? `Approved${when ? ` · ${agent} ${when}` : ""}`
              : "Answered"}
          </>
        ) : (
          <>
            <FiZap size={16} aria-hidden />
            {`Waiting for you${when ? ` · ${when}` : ""}`}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Something is broken or urgent (red): a revoked token, a failed task. The
 * same card on a red tray, with the reason and the one action that fixes
 * it.
 */
export function AlertCard({
  agent,
  what,
  reason,
  at,
  action,
  onAction,
}: {
  agent: string;
  what: string;
  reason: string;
  at: string | null;
  action: string;
  onAction: () => void;
}) {
  return (
    <div className="ag-tray is-alert" data-ag-alert={agent}>
      <div className="ag-acard3">
        <div className="ag-acard3-top">
          <span className="ag-acard3-what">{what}</span>
          {at ? (
            <span>
              <FiClock size={14} aria-hidden />
              {hhmm(at)}
            </span>
          ) : null}
        </div>
        <div className="ag-acard3-who">
          <span className="ag-acard3-av">
            <AgentIcon name={agent} size={30} />
          </span>
          <div className="ag-acard3-q">
            <b>{agent}</b>
            <small>
              <i aria-hidden="true" />
              {reason}
            </small>
          </div>
        </div>
        <div className="ag-acard3-btns">
          <button type="button" data-ag-alert-action="" onClick={onAction}>
            {action}
          </button>
        </div>
      </div>
      <div className="ag-tray-foot">
        <FiZap size={16} aria-hidden />
        Needs you now
      </div>
    </div>
  );
}
