"use client";

import { useEffect, useRef, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { FiCheck, FiClock, FiCornerUpLeft, FiZap } from "react-icons/fi";

import { formatDateToLocal, newDate } from "@/lib/date-utils";
import { fetchJson } from "@/lib/needt3/hooks/core";

import { AgentIcon } from "./AgentIcon";
import type { HubItemRow } from "./TasksTab";

interface HubFile {
  id: string;
  name: string;
  mime: string;
  size: number;
}

/** How long Approve waits before it is sent, so Undo is real. */
export const UNDO_MS = 5000;

const hhmm = (iso: string) => formatDateToLocal(newDate(iso)).slice(11, 16);

/** "in 2 h 14 min", "in 12 min", or null once it has passed. */
function until(iso: string, now: number) {
  const ms = newDate(iso).getTime() - now;
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const m = Math.round(ms / 60000);
  if (m < 60) return `in ${m} min`;
  const h = Math.floor(m / 60);
  return `in ${h} h ${m % 60} min`;
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
          preload="metadata"
          onTimeUpdate={(e) => {
            const v = e.currentTarget;
            setProgress(v.duration ? v.currentTime / v.duration : 0);
          }}
          onEnded={() => setPlaying(false)}
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- an authenticated attachment, not a static asset
        <img src={src} alt="" />
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
 * and when; the agent, its question and the checks from the done-when list;
 * previews of the item's media (vertical, they play in place); Approve and
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
  onAnswer,
  onOpen,
}: {
  item: HubItemRow;
  agent: string;
  now: number;
  done: "approved" | "answered" | null;
  /** Sends the approval; called after the Undo window. */
  onApprove: () => Promise<unknown> | void;
  onAnswer: () => void;
  onOpen: () => void;
}) {
  const risky = item.risks.some((r) => !item.approvals[r]);
  const [pending, setPending] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    []
  );
  const files = useQuery({
    queryKey: ["agent-hub", "item", item.id, "files"],
    queryFn: () =>
      fetchJson<{ attachments: HubFile[] }>(
        `/api/agent-hub/items/${item.id}/attachments`
      ),
    staleTime: 60_000,
  });
  const media = (files.data?.attachments ?? [])
    .filter((f) => f.mime.startsWith("video/") || f.mime.startsWith("image/"))
    .slice(0, 3);
  const checks = item.criteria ?? [];
  const due = item.due ?? null;
  const left = due ? until(due, now) : null;
  const ok = pending || done === "approved" || done === "answered";

  const approve = () => {
    setPending(true);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      void onApprove();
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
        {checks.length ? (
          <ul className="ag-checks" aria-label="Checks">
            {checks.map((c, i) => (
              <li key={i} className={c.met ? "is-met" : "is-open"}>
                <i aria-hidden="true" />
                {c.text}
              </li>
            ))}
          </ul>
        ) : null}
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
            Approved
            <button type="button" data-ag-undo="" onClick={undo}>
              Undo
            </button>
          </>
        ) : done ? (
          <>
            <FiCheck size={16} aria-hidden />
            {done === "approved" ? "Approved" : "Answered"}
          </>
        ) : (
          <>
            <FiZap size={16} aria-hidden />
            {`Waiting for you${due ? ` · due ${hhmm(due)}` : ""}`}
          </>
        )}
      </div>
    </div>
  );
}
