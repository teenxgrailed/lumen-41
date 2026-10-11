"use client";

import {
  LuCircleCheck,
  LuEllipsis,
  LuListChecks,
  LuReply,
} from "react-icons/lu";
import { LuPaperclip } from "react-icons/lu";

import { StError } from "@/components/needt3/states/StScreen";

import { useThread } from "@/lib/needt3/hooks/mail";
import { useMailAccounts, useMailRef } from "@/lib/needt3/hooks/mail-accounts";
import type { V3MailThread } from "@/lib/needt3/map";

import { providerLabel, providerLink } from "../../mail/derive";
import type { Mailbox } from "../../mail/useMailbox";
import { type PkActs, PkButton, PkSheet } from "../kit";
import { PmlAvatar } from "./PmlAvatar";
import { makeActions, moreActions } from "./actions";
import { dayTime } from "./model";

/**
 * The reader: a sheet with the sender, the subject and the message, read-only.
 * Reply and Forward open the message at its provider (the link comes from
 * `useMailRef`, the same as the desktop's). The foot keeps Reply, Make task
 * and a "⋯" on screen at both detents.
 */
export function PhoneThread({
  box,
  m,
  open,
  onClose,
  onActs,
}: {
  box: Mailbox;
  m: V3MailThread | null;
  open: boolean;
  onClose: () => void;
  onActs: (a: PkActs) => void;
}) {
  const thread = useThread(m?.id);
  const ref = useMailRef(m?.id, thread.isSuccess);
  const accounts = useMailAccounts();
  if (!m)
    return (
      <PkSheet
        open={false}
        onClose={onClose}
        detents={[0.6, 0.92]}
        label="Thread"
      />
    );

  const link = providerLink(ref.data);
  const via = providerLabel(ref.data?.provider);
  const account = (accounts.data ?? []).find((a) => a.id === m.accountId);
  const madeId = box.madeServer.get(m.id);
  const made = box.made.has(m.id);
  const html = thread.data?.bodyHtml;

  const task = () => {
    if (made) {
      void box.takeBack(m);
      return;
    }
    onActs({
      title: "Turn this email into…",
      meta: m.subject,
      actions: makeActions(m, box),
    });
  };
  const more = () =>
    onActs({
      title: m.subject || "No subject",
      meta: m.from,
      actions: moreActions(m, box, link),
    });

  const head = (
    <div className="pml-head">
      <PmlAvatar name={m.from} big />
      <span className="pml-head-text">
        <span className="pml-head-from">{m.from}</span>
        <span className="pml-head-meta">
          {[
            m.fromEmail,
            dayTime(m.receivedAt, box.today),
            account ? providerLabel(account.provider) : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </span>
    </div>
  );

  const footer = (
    <>
      {link ? (
        <a
          className="pk-btn is-primary"
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Reply in ${via}`}
          data-pml-act="reply"
        >
          <LuReply size={18} aria-hidden />
          <span className="pk-btn-cut">Reply</span>
        </a>
      ) : (
        <PkButton
          kind="primary"
          icon={<LuReply size={18} aria-hidden />}
          disabled
          data-pml-act="reply"
        >
          Reply
        </PkButton>
      )}
      <PkButton
        icon={
          made ? (
            <LuCircleCheck size={18} aria-hidden />
          ) : (
            <LuListChecks size={18} aria-hidden />
          )
        }
        onClick={task}
        disabled={made && !madeId}
        data-pml-act="task"
        aria-label={made ? "Task made — take it back" : "Make a task"}
      >
        {made ? "Task made" : "Make task"}
      </PkButton>
      <PkButton
        icon={<LuEllipsis size={18} aria-hidden />}
        onClick={more}
        data-pml-act="more"
        aria-label="More"
        className="pml-act-archive"
      />
    </>
  );

  return (
    <PkSheet
      open={open}
      onClose={onClose}
      detents={[0.6, 0.92]}
      label={m.subject || "Thread"}
      className="pml-sheet"
      head={head}
      title={m.subject || "No subject"}
      footer={footer}
    >
      {html ? (
        <div
          className="pml-body pml-html"
          data-pml-thread={m.id}
          // Sanitized on the server (sanitizeMailHtml) before it is stored and again on read.
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <div className="pml-body" data-pml-thread={m.id}>
          <p className="pml-para">{m.preview}</p>
        </div>
      )}
      {thread.isError && !html ? (
        <div className="pml-state">
          <StError
            text="Couldn’t load the whole message."
            onRetry={thread.refetch}
          />
        </div>
      ) : null}
      {m.attachments.map((f, i) => (
        <span key={`${f.name}${i}`} className="pml-file">
          <LuPaperclip size={14} aria-hidden />
          {f.name}
        </span>
      ))}
      <p className="pml-as-task">
        {made ? (
          <>
            <LuCircleCheck size={14} aria-hidden />
            Task made — find it in Tasks
          </>
        ) : (
          <>As a task: “{m.suggestedTask || m.subject}”</>
        )}
      </p>
      <p className="pml-as-task" data-pml-readonly="">
        Reply and Forward open this message in {via}.
      </p>
    </PkSheet>
  );
}
