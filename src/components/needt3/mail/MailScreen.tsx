"use client";

import { useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import {
  FiAlertTriangle,
  FiArchive,
  FiCalendar,
  FiCheck,
  FiChevronDown,
  FiChevronLeft,
  FiCornerUpLeft,
  FiCornerUpRight,
  FiEdit3,
  FiInbox,
  FiList,
  FiMail,
  FiMoreHorizontal,
  FiPaperclip,
  FiTrash2,
} from "react-icons/fi";

import { Art } from "@/components/needt3/menu/Art";
import { StScreen } from "@/components/needt3/states/StScreen";
import { Task } from "@/components/needt3/task/Task";

import { formatInTimeZone } from "@/lib/date-utils";
import { mailDayLabel, mailTime } from "@/lib/needt3/derive";
import { useThread } from "@/lib/needt3/hooks/mail";
import { useMailRef } from "@/lib/needt3/hooks/mail-accounts";
import type { V3MailThread } from "@/lib/needt3/map";

import strings from "../../../../docs/port/prototype/port/strings/en.json";
import { BrandIcon, brandIdForConnection } from "../brand";
import { PopMenu } from "./PopMenu";
import {
  MAIL_TABS,
  type MailTab,
  composeLink,
  firstName,
  headerAccounts,
  initials,
  providerLabel,
  providerLink,
} from "./derive";
import { headerCopy } from "./strings";
import type { Mailbox } from "./useMailbox";

const copy = strings["MailScreen.jsx"];
const tabLabel: Record<MailTab, string> = {
  needs: copy.ML_TABS.needs_you,
  all: copy.ML_TABS.all,
  done: copy.ML_TABS.made_into_tasks,
};
const EMPTY: Record<MailTab, [string, string, string, MailTab | null]> = {
  needs: ["Inbox zero", "Nothing needs you right now.", "Show all mail", "all"],
  done: [
    "No tasks from mail yet",
    "Open a message and choose Make a task.",
    "Show what needs you",
    "needs",
  ],
  all: [
    "No mail",
    "Nothing has arrived from your connected accounts.",
    "Open Connections",
    null,
  ],
};
/**
 * Sent and Drafts are in the prototype's tab strip, but the sync stores no
 * Sent or Drafts view the Mailbox could list (the inbox query drops every
 * message that left the inbox, and Outlook and IMAP sync only the inbox), and
 * mail is read-only at the provider. They are drawn, disabled, with the reason.
 */
const HELD_TABS = [
  ["sent", copy.ML_TABS.sent, headerCopy.sentHeld],
  ["drafts", copy.ML_TABS.drafts, headerCopy.draftsHeld],
] as const;
const NARROW_QUERY = "(max-width: 899px)";

function useNarrow() {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(NARROW_QUERY);
    setNarrow(mq.matches);
    const on = (e: MediaQueryListEvent) => setNarrow(e.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return narrow;
}

function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  return (
    <span
      className="ml-avatar"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
    >
      {initials(name)}
    </span>
  );
}

function MailRow({
  m,
  active,
  made,
  today,
  onPick,
}: {
  m: V3MailThread;
  active: boolean;
  made: boolean;
  today: string;
  onPick: () => void;
}) {
  const [hot, setHot] = useState(false);
  return (
    <div
      role="button"
      tabIndex={0}
      data-ml-row={m.id}
      onClick={onPick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onPick();
        }
      }}
      onMouseEnter={() => setHot(true)}
      onMouseLeave={() => setHot(false)}
      aria-current={active || undefined}
      aria-label={`${m.from}: ${m.subject || copy.MailScreen.no_subject}, ${mailDayLabel(m.receivedAt, today)}`}
      className={`nx-focus ml-row${active ? " is-active" : hot ? " is-hot" : ""}${m.isRead ? "" : " is-unread"}`}
    >
      {!m.isRead ? <span className="ml-row-dot" /> : null}
      <Avatar name={m.from} />
      <div className="ml-row-body">
        <span className="ml-row-top">
          <span className="ml-row-from" title={m.from}>
            {m.from}
          </span>
          <span className="ml-row-time">{mailTime(m.receivedAt)}</span>
        </span>
        <span className="ml-row-subject" title={m.subject}>
          {m.subject}
        </span>
        <span className="ml-row-preview">
          {m.preview || m.attachments.map((f) => f.name).join(", ")}
        </span>
        {made || m.needsReply ? (
          <span className="ml-row-tags">
            {made ? (
              <span className="ml-tag">
                <FiCheck size={11} aria-hidden />
                {copy.MlRow.task}
              </span>
            ) : (
              <span className="ml-tag">{copy.MlRow.needs_you}</span>
            )}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** One account that stopped syncing: say since when, fix it in place. */
function ConnBanner({
  provider,
  address,
  since,
}: {
  provider: string;
  address: string;
  since: string | null;
}) {
  const name = providerLabel(provider);
  const reconnect =
    provider === "GMAIL"
      ? "/api/mail/oauth/google/auth"
      : provider === "OUTLOOK"
        ? "/api/mail/oauth/outlook/auth"
        : "/settings#integrations";
  return (
    <div data-conn-banner={address} className="ml-banner nx-swap" role="status">
      <span className="ml-banner-ico">
        <FiAlertTriangle size={15} aria-hidden />
      </span>
      <span className="ml-col">
        <span className="ml-banner-title">
          {provider === "IMAP" ? address : name} disconnected
        </span>
        <span className="ml-banner-line">
          {since
            ? `Nothing new has arrived since ${since} — messages may be waiting there.`
            : "Nothing new has arrived — messages may be waiting there."}
        </span>
      </span>
      <a
        href={reconnect}
        className="nx-btn nx-btn-secondary nx-btn-sm nx-press ml-banner-btn"
      >
        {copy.MlConnBanner.reconnect}
      </a>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  href,
  children,
  disabled,
}: {
  label: string;
  onClick?: () => void;
  href?: string | null;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  if (href) {
    return (
      <a
        className="btn-icon btn-ghost"
        aria-label={label}
        title={label}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
      >
        {children}
      </a>
    );
  }
  return (
    <button
      type="button"
      className="btn-icon btn-ghost"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export function MailScreen({ box }: { box: Mailbox }) {
  const { tz, today, mail, tasks, accounts, live, list, counts, groups } = box;
  const made = box.made;
  const { tab, setTab, openId, reading, setReading, down } = box;
  const narrow = useNarrow();
  const router = useRouter();

  const open =
    live.find((m) => m.id === openId) ?? (narrow ? null : (list[0] ?? null));
  const thread = useThread(open?.id);
  const ref = useMailRef(open?.id, thread.isSuccess);
  const link = providerLink(ref.data);
  const via = providerLabel(ref.data?.provider);

  const showList = !narrow || !reading || !open;
  const showMsg = !narrow || reading;

  const pick = (m: V3MailThread) => box.open(m);

  const makeTask = (m: V3MailThread, when: "today" | "later") =>
    box.makeTask(m, when);
  const toCalendar = (m: V3MailThread) => box.toCalendar(m);
  const takeBack = (m: V3MailThread) => box.takeBack(m);
  const archive = (m: V3MailThread) => box.archive(m);
  const trash = (m: V3MailThread) => box.trash(m);
  const markUnread = (m: V3MailThread) => box.setRead(m, false);

  const madeId = open ? box.madeServer.get(open.id) : undefined;
  const madeTask = madeId
    ? (tasks.data ?? []).find((t) => t.id === madeId)
    : undefined;
  const account = open
    ? (accounts.data ?? []).find((a) => a.id === open.accountId)
    : undefined;

  const chips = headerAccounts(accounts.data);
  const accountList = accounts.data ?? [];
  const acctSince = new Map(
    accountList.map((a) => [
      a.id,
      a.lastSyncAt ? formatInTimeZone(a.lastSyncAt, tz, "HH:mm") : null,
    ])
  );
  // Nothing is connected: the empty list says so, whatever tab is showing
  // ("Inbox zero" would be a lie).
  const noAccount = accounts.isSuccess && accountList.length === 0;
  const newInner = (
    <>
      <FiEdit3 size={14} aria-hidden />
      <span className="ml-new-label">{headerCopy.newMessage}</span>
    </>
  );
  const newButton = (
    <button
      type="button"
      className="nx-btn nx-btn-primary ml-new"
      data-ml-new=""
      aria-label={headerCopy.newMessage}
    >
      {newInner}
    </button>
  );

  return (
    <div className="ml-screen" data-v3-screen="mail">
      <header className="ml-head">
        <h1 className="ml-title">{copy.MailScreen.mailbox}</h1>
        <span className="ml-accts">
          {chips.map((c) => {
            const mark = brandIdForConnection({
              kind: "mail",
              provider: c.provider,
            });
            const since = acctSince.get(c.key) ?? null;
            const body = (
              <>
                {mark ? (
                  <BrandIcon id={mark} size={16} />
                ) : (
                  <span
                    className="ml-acct-dot"
                    style={{ background: "var(--text-quaternary)" }}
                  />
                )}
                {c.label}
                {c.down ? <span className="ml-acct-down" aria-hidden /> : null}
              </>
            );
            if (c.missing)
              return (
                <a
                  key={c.key}
                  href="/connections"
                  className="ml-acct is-link"
                  data-ml-acct={c.provider}
                  data-ml-acct-state="missing"
                  title={headerCopy.notConnected(c.label)}
                >
                  {body}
                </a>
              );
            return (
              <span
                key={c.key}
                className="ml-acct"
                data-ml-acct={c.provider}
                data-ml-acct-state={c.down ? "down" : "ok"}
                title={c.down ? headerCopy.down(since) : c.address}
              >
                {body}
              </span>
            );
          })}
        </span>
        <span className="ml-tabs">
          {MAIL_TABS.map((id) => (
            <button
              key={id}
              type="button"
              className={`ml-tab${tab === id ? " is-on" : ""}`}
              aria-pressed={tab === id}
              data-ml-tab={id}
              onClick={() => setTab(id)}
            >
              {tabLabel[id]}
              <span className="ml-tab-n">{counts[id]}</span>
            </button>
          ))}
          <span className="ml-tabs-sep" aria-hidden="true" />
          {HELD_TABS.map(([id, label, why]) => (
            <button
              key={id}
              type="button"
              className="ml-tab is-held"
              aria-disabled="true"
              title={why}
              data-ml-tab={id}
            >
              {label}
            </button>
          ))}
        </span>
        {accountList.length > 1 ? (
          <PopMenu
            label={headerCopy.newMessage}
            prompt={headerCopy.writeIn}
            align="right"
            width={280}
            trigger={() => newButton}
            items={accountList.map((a) => ({
              key: a.id,
              title: providerLabel(a.provider),
              sub: a.address,
              onSelect: () =>
                window.open(composeLink(a), "_blank", "noopener,noreferrer"),
            }))}
          />
        ) : accountList.length === 1 ? (
          <a
            className="nx-btn nx-btn-primary ml-new"
            data-ml-new=""
            aria-label={headerCopy.newMessage}
            title={headerCopy.newMessageOpens(
              providerLabel(accountList[0].provider)
            )}
            href={composeLink(accountList[0])}
            target="_blank"
            rel="noopener noreferrer"
          >
            {newInner}
          </a>
        ) : (
          <button
            type="button"
            className="nx-btn nx-btn-primary ml-new"
            data-ml-new=""
            aria-label={headerCopy.newMessage}
            aria-disabled="true"
            title={
              accounts.isError
                ? headerCopy.accountsFailed
                : accounts.isSuccess
                  ? headerCopy.noAccountToWrite
                  : headerCopy.accountsLoading
            }
          >
            {newInner}
          </button>
        )}
      </header>

      <StScreen query={mail} screen="mail">
        <div
          className="ml-layout"
          data-ml-layout={narrow ? (showList ? "list" : "reading") : "split"}
        >
          {showList ? (
            <div
              key={tab}
              className={`scroll-inner nx-swap ml-list${narrow ? " is-narrow" : ""}`}
              data-ml-list={tab}
              data-ml-empty={
                !list.length ? (noAccount ? "no-account" : tab) : undefined
              }
            >
              {down.map((a) => (
                <ConnBanner
                  key={a.id}
                  provider={a.provider}
                  address={a.address}
                  since={
                    a.lastSyncAt
                      ? formatInTimeZone(a.lastSyncAt, tz, "HH:mm")
                      : null
                  }
                />
              ))}
              {!list.length ? (
                <div className="nx-swap ml-empty">
                  <Art name="mail" size={56} />
                  {noAccount ? (
                    <>
                      <span className="ml-empty-title">
                        {headerCopy.noAccountTitle}
                      </span>
                      <span className="ml-empty-line">
                        {headerCopy.noAccountLine}
                      </span>
                      <a
                        href="/connections"
                        className="nx-btn nx-btn-secondary nx-btn-sm ml-empty-cta"
                      >
                        {headerCopy.openConnections}
                      </a>
                    </>
                  ) : (
                    <>
                      <span className="ml-empty-title">{EMPTY[tab][0]}</span>
                      <span className="ml-empty-line">{EMPTY[tab][1]}</span>
                      {EMPTY[tab][3] ? (
                        <button
                          type="button"
                          className="nx-btn nx-btn-secondary nx-btn-sm ml-empty-cta"
                          onClick={() => setTab(EMPTY[tab][3] as MailTab)}
                        >
                          {EMPTY[tab][2]}
                        </button>
                      ) : (
                        <a
                          href="/connections"
                          className="nx-btn nx-btn-secondary nx-btn-sm ml-empty-cta"
                        >
                          {EMPTY[tab][2]}
                        </a>
                      )}
                    </>
                  )}
                </div>
              ) : null}
              {groups.map((g) => (
                <div key={g.day} className="contents">
                  <span className="ml-day">{g.day}</span>
                  {g.rows.map((m) => (
                    <MailRow
                      key={m.id}
                      m={m}
                      today={today}
                      made={made.has(m.id)}
                      active={m.id === open?.id}
                      onPick={() => pick(m)}
                    />
                  ))}
                </div>
              ))}
            </div>
          ) : null}

          {showMsg && open ? (
            <article
              key={open.id}
              className="scroll-inner nx-swap ml-msg"
              data-ml-msg={open.id}
            >
              <div className="ml-msg-bar">
                {narrow ? (
                  <button
                    type="button"
                    className="nx-btn nx-btn-text ml-back"
                    data-ml-back=""
                    aria-label={copy.MailScreen.back_to_the_list}
                    onClick={() => setReading(false)}
                  >
                    <FiChevronLeft size={16} aria-hidden />
                    {copy.MailScreen.mailbox}
                  </button>
                ) : null}
                {madeId ? (
                  <button
                    type="button"
                    className="nx-btn nx-btn-secondary"
                    title={copy.MailScreen.task_made_click_to_take_it_back}
                    onClick={() => void takeBack(open)}
                  >
                    <FiCheck size={14} aria-hidden />
                    {copy.MailScreen.task_made}
                  </button>
                ) : (
                  <PopMenu
                    label={copy.MailScreen.make_a_task}
                    prompt="Turn this email into…"
                    trigger={() => (
                      <button
                        type="button"
                        className="nx-btn nx-btn-secondary ml-make"
                      >
                        <FiList size={14} aria-hidden />
                        {copy.MailScreen.make_a_task}
                        <FiChevronDown size={12} aria-hidden />
                      </button>
                    )}
                    items={[
                      {
                        key: "today",
                        title: copy.MailScreen.task_for_today,
                        icon: <FiCheck size={16} />,
                        onSelect: () => void makeTask(open, "today"),
                      },
                      {
                        key: "later",
                        title: copy.MailScreen.task_for_later,
                        icon: <FiInbox size={16} />,
                        onSelect: () => void makeTask(open, "later"),
                      },
                      {
                        key: "event",
                        title: copy.MailScreen.calendar_event,
                        sub: copy.MailScreen.tomorrow_10_00_30_min,
                        icon: <FiCalendar size={16} />,
                        onSelect: () => void toCalendar(open),
                      },
                    ]}
                  />
                )}
                <IconButton
                  label={copy.MailScreen.add_to_calendar}
                  onClick={() => void toCalendar(open)}
                >
                  <FiCalendar size={16} aria-hidden />
                </IconButton>
                <IconButton
                  label={`${copy.MailScreen.reply} in ${via}`}
                  href={link}
                  disabled={!link}
                >
                  <FiCornerUpLeft size={16} aria-hidden />
                </IconButton>
                <IconButton
                  label={`${copy.MailScreen.forward} in ${via}`}
                  href={link}
                  disabled={!link}
                >
                  <FiCornerUpRight size={16} aria-hidden />
                </IconButton>
                <IconButton
                  label={copy.MailScreen.archive}
                  onClick={() => void archive(open)}
                >
                  <FiArchive size={16} aria-hidden />
                </IconButton>
                <PopMenu
                  label="More"
                  align="right"
                  width={200}
                  trigger={() => (
                    <button
                      type="button"
                      className="btn-icon btn-ghost"
                      aria-label="More"
                      title="More"
                    >
                      <FiMoreHorizontal size={16} aria-hidden />
                    </button>
                  )}
                  items={[
                    {
                      key: "unread",
                      title: "Mark as unread",
                      icon: <FiMail size={16} />,
                      onSelect: () => void markUnread(open),
                    },
                    {
                      key: "trash",
                      title: copy.MailScreen.move_to_trash,
                      icon: <FiTrash2 size={16} />,
                      onSelect: () => void trash(open),
                    },
                  ]}
                />
              </div>
              <h2 className="ml-subject">
                {open.subject || copy.MailScreen.no_subject}
              </h2>
              <div className="ml-from">
                <Avatar name={open.from} size={36} />
                <span className="ml-from-col">
                  <span className="ml-from-name">{open.from}</span>
                  <span className="ml-meta">
                    {[open.fromEmail, account ? account.address : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span className="ml-meta ml-push">
                  {mailDayLabel(open.receivedAt, today)},{" "}
                  {mailTime(open.receivedAt)}
                </span>
              </div>
              {madeTask ? (
                /* The task this mail became, drawn by <Task> (card · preview). */
                <Task
                  task={madeTask}
                  layout="card"
                  density="preview"
                  onOpen={(id) => router.push(`/tasks?task=${id}`)}
                />
              ) : null}
              {thread.data?.bodyHtml ? (
                <div
                  className="ml-body ml-p"
                  // Sanitized on the server (sanitizeMailHtml) before it is stored and again on read.
                  dangerouslySetInnerHTML={{ __html: thread.data.bodyHtml }}
                />
              ) : (
                <div className="ml-body">
                  <p className="ml-p">{open.preview}</p>
                </div>
              )}
              {open.attachments.map((f, i) => (
                <span key={`${f.name}${i}`} className="ml-attach">
                  <span className="ml-attach-ico is-file">
                    <FiPaperclip size={12} aria-hidden />
                  </span>
                  {f.name}
                </span>
              ))}
              {link ? (
                <a
                  className="ml-reply"
                  data-ml-reply-box=""
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <FiCornerUpLeft size={14} aria-hidden />
                  {`${copy.MailScreen.reply_to} ${firstName(open.from)} in ${via}…`}
                </a>
              ) : null}
            </article>
          ) : null}
          {showMsg && !open && !narrow && list.length ? (
            <div className="nx-swap ml-msg is-quiet" data-ml-msg-empty="">
              <span className="ml-meta">
                {copy.MailScreen.pick_a_message_to_read_it}
              </span>
            </div>
          ) : null}
        </div>
      </StScreen>
    </div>
  );
}
