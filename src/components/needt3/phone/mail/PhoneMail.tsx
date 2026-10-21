"use client";

import { useRef, useState } from "react";

import Link from "next/link";

import { LuArchive, LuCircleCheck, LuRefreshCw } from "react-icons/lu";

import { StError } from "@/components/needt3/states/StScreen";
import { StSkeleton } from "@/components/needt3/states/StSkeleton";
import { errorText, screenState } from "@/components/needt3/states/status";

import { formatInTimeZone } from "@/lib/date-utils";
import type { V3MailThread } from "@/lib/needt3/map";

import { MAIL_TABS, type MailTab, providerLabel } from "../../mail/derive";
import type { Mailbox } from "../../mail/useMailbox";
import {
  PkActions,
  type PkActs,
  PkButton,
  PkChips,
  PkEmpty,
  PkGlass,
  PkHold,
  PkNumber,
  PkRow,
  PkScreen,
  PkSection,
  pkCx,
  usePkExit,
} from "../kit";
import { PhoneThread } from "./PhoneThread";
import { PmlAvatar } from "./PmlAvatar";
import { holdActions } from "./actions";
import {
  emptyFor,
  foldsAsRead,
  reconnectHref,
  swipeRules,
  unreadLine,
  whenLabel,
} from "./model";

const TAB_LABEL: Record<MailTab, string> = {
  needs: "Needs you",
  all: "All",
  done: "Made into tasks",
};

function Row({
  m,
  box,
  X,
  onHold,
}: {
  m: V3MailThread;
  box: Mailbox;
  X: ReturnType<typeof usePkExit<V3MailThread>>;
  onHold: (m: V3MailThread) => void;
}) {
  const unread = !m.isRead;
  const when = whenLabel(m.receivedAt, box.today);
  const rules = swipeRules(m, box.made);
  const meta = (
    <>
      {box.made.has(m.id) ? (
        <span className="pml-tag">
          <LuCircleCheck size={12} aria-hidden />
          Task
        </span>
      ) : null}
      <span className="pml-subject">{m.subject || "No subject"}</span>
    </>
  );
  return (
    <PkHold
      onHold={() => onHold(m)}
      data={{ "data-pml-row": m.id, "data-pml-unread": unread ? "1" : "0" }}
    >
      <PkRow
        id={m.id}
        title={m.from}
        meta={meta}
        time={when}
        label={`${unread ? "Unread. " : ""}${m.from}: ${m.subject || "No subject"}, ${when}`}
        lead={<PmlAvatar name={m.from} />}
        check={false}
        phase={X.phase[m.id]}
        out={!!X.out[m.id]}
        canDone={rules.canArchive}
        canLater={rules.canMakeTask}
        doneLabel="Archive"
        doneIcon={<LuArchive size={18} />}
        laterLabel="Make task"
        laterIcon={<LuCircleCheck size={18} />}
        onOpen={() => box.open(m)}
        onSwipe={(side) => X.exit(m, side)}
      />
    </PkHold>
  );
}

/** One quiet raised line per account that stopped syncing, and the way back. */
function Banner({ box }: { box: Mailbox }) {
  return (
    <>
      {box.down.map((a) => {
        const name =
          a.provider === "IMAP" ? a.address : providerLabel(a.provider);
        return (
          <div
            key={a.id}
            className="pml-banner"
            role="status"
            data-pml-banner={a.address}
          >
            <span className="pk-alert-dot" aria-hidden="true" />
            <span className="pml-banner-text">
              <span className="pml-banner-title">{name} disconnected</span>
              <span className="pml-banner-line">
                {a.lastSyncAt
                  ? `Nothing new since ${formatInTimeZone(a.lastSyncAt, box.tz, "HH:mm")}`
                  : "Nothing new has arrived"}
              </span>
            </span>
            <a
              className="pk-btn is-chip"
              href={reconnectHref(a.provider)}
              data-pml-reconnect=""
            >
              <span className="pk-btn-cut">Reconnect</span>
            </a>
          </div>
        );
      })}
    </>
  );
}

/**
 * The phone Mailbox (phone-mail.jsx on the phone kit): the same messages as
 * the desktop, read-only at the provider. Swipe right archives (the PATCH
 * route supports `archive`), swipe left makes a task whose origin is the
 * message; hold a row for its actions; pull down to search. All state is
 * `box`, owned above the face switch.
 */
export function PhoneMail({ box }: { box: Mailbox }) {
  const [acts, setActs] = useState<PkActs | null>(null);
  const X = usePkExit<V3MailThread>((m, kind) => {
    if (kind === "later") void box.makeTask(m, "later");
    else void box.archive(m);
  });

  const thread = box.openId
    ? (box.live.find((m) => m.id === box.openId) ?? null)
    : null;
  // the sheet keeps the last message on screen while it slides away
  const last = useRef<V3MailThread | null>(null);
  if (thread) last.current = thread;
  const shown = thread ?? last.current;

  const hold = (m: V3MailThread) =>
    setActs({
      title: m.subject || "No subject",
      meta: `${m.from} · ${whenLabel(m.receivedAt, box.today)}`,
      actions: holdActions(m, box),
    });

  const state = screenState(box.mail);
  const empty = emptyFor({
    tab: box.tab,
    listLength: box.list.length,
    liveLength: box.live.length,
    accountsKnown: box.accounts.isSuccess,
    accountCount: box.accounts.data?.length ?? 0,
  });
  const rows = (l: readonly V3MailThread[]) =>
    l.map((m) => <Row key={m.id} m={m} box={box} X={X} onHold={hold} />);

  const sub = box.live.length ? (
    <span className="pml-sub" data-pml-unread={box.unread}>
      {box.unread ? (
        <>
          <PkNumber value={box.unread} label={unreadLine(box.unread)} />
          <span>unread</span>
        </>
      ) : (
        unreadLine(0)
      )}
    </span>
  ) : null;

  let body;
  if (state === "loading") {
    body = <StSkeleton kind="list" />;
  } else if (state !== "content") {
    body = (
      <div className="pml-state">
        <StError
          text={
            state === "offline"
              ? "You’re offline — reconnect to load this."
              : errorText("mail")
          }
          onRetry={box.mail.refetch}
        />
      </div>
    );
  } else {
    body = (
      <>
        <Banner box={box} />
        {box.live.length ? (
          <PkChips className="pml-views" label="Show">
            {MAIL_TABS.map((k) => (
              <PkGlass
                key={k}
                as="button"
                round
                className={pkCx("pml-view", box.tab === k && "is-on")}
                aria-pressed={box.tab === k}
                onClick={() => box.setTab(k)}
                data-pml-view={k}
              >
                {TAB_LABEL[k]}
                <span className="pml-view-n">{box.counts[k]}</span>
              </PkGlass>
            ))}
          </PkChips>
        ) : null}
        {empty ? (
          empty.kind === "no-account" ? (
            <PkEmpty
              title={empty.title}
              line={empty.line}
              action={
                <Link
                  className="pk-btn is-chip"
                  href="/connections"
                  data-pml-connect=""
                >
                  <span className="pk-btn-cut">{empty.cta}</span>
                </Link>
              }
            />
          ) : (
            <PkEmpty
              line={empty.line}
              action={
                empty.to && box.live.length ? (
                  <PkButton
                    kind="chip"
                    onClick={() => box.setTab(empty.to as MailTab)}
                  >
                    {empty.cta}
                  </PkButton>
                ) : null
              }
            />
          )
        ) : foldsAsRead(box.tab, box.list) ? (
          <PkSection
            title="Read"
            count={box.list.length}
            folded={!box.readOpen}
            onFold={box.toggleReadOpen}
            className="pml-sec"
          >
            {rows(box.list)}
          </PkSection>
        ) : (
          box.groups.map((g) => (
            <PkSection key={g.day} title={g.day} className="pml-sec">
              {rows(g.rows)}
            </PkSection>
          ))
        )}
      </>
    );
  }

  return (
    <>
      <PkScreen
        screen="mail"
        title="Mailbox"
        glyph="mail"
        sub={sub}
        right={
          <PkButton
            kind="chip"
            icon={<LuRefreshCw size={14} aria-hidden />}
            onClick={() => void box.syncNow()}
            disabled={box.syncing}
            aria-label="Sync mail"
            data-pml-sync=""
          >
            Sync
          </PkButton>
        }
      >
        {body}
      </PkScreen>
      <PhoneThread
        box={box}
        m={shown}
        open={!!thread}
        onClose={box.close}
        onActs={setActs}
      />
      <PkActions acts={acts} onClose={() => setActs(null)} />
    </>
  );
}
