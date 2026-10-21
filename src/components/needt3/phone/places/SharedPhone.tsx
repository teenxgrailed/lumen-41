"use client";

import { useRef, useState } from "react";

import { useRouter } from "next/navigation";

import {
  LuCheck,
  LuEye,
  LuInfo,
  LuPencil,
  LuShieldCheck,
} from "react-icons/lu";

import { useSharedDocs } from "@/lib/needt3/hooks/places";

import strings from "../../../../../docs/port/prototype/port/strings/en.json";
import { sharedMeta } from "../../places/derive";
import {
  PkButton,
  PkEmpty,
  PkGlyph,
  PkHold,
  PkHueTile,
  PkScreen,
  PkSheet,
  pkCx,
} from "../kit";
import { PhoneState, PplRow } from "./Parts";
import { ROLE_VIEWS, type RoleView, roleView } from "./logic";

const sh = strings["places.jsx"].SharedScreen;

const ICON = {
  eye: LuEye,
  pencil: LuPencil,
  shield: LuShieldCheck,
} as const;

function RoleChip({ role }: { role: RoleView }) {
  const Icon = ICON[role.icon];
  return (
    <span className="ppl-role" style={{ ["--hue" as string]: role.hue }}>
      <Icon size={12} aria-hidden />
      {role.label}
    </span>
  );
}

/**
 * Shared on the phone (phone-places.jsx `PplShared`): the pages other people
 * gave the person a grant on, each with the access it carries. A row opens the
 * page (the reader is the Docs phone face's); the info button or a hold opens
 * a sheet that spells the access out.
 *
 * The list route does not say who owns or shared a page, so there is no
 * avatar, no "from <name>", no people list and no "Ask to edit" (the
 * prototype's request is a mock with no route). Moodboards shared with the
 * person are not listed either.
 * //todo: owner, date shared, "shared with me" for moodboards, access request.
 */
export function SharedPhone() {
  const router = useRouter();
  const shared = useSharedDocs();
  const list = shared.data ?? [];
  const [infoId, setInfoId] = useState<string | null>(null);
  const info = infoId ? (list.find((x) => x.doc.id === infoId) ?? null) : null;
  const last = useRef<(typeof list)[number] | null>(null);
  if (info) last.current = info;
  const I = info ?? last.current;
  const mine = I ? roleView(I.role) : null;

  const open = (id: string) => router.push(`/pages/${id}`);

  return (
    <>
      <PkScreen
        screen="shared"
        title="Shared"
        glyph="shared"
        sub={sharedMeta(list.length)}
      >
        <PhoneState query={shared} screen="shared">
          {list.length ? (
            <div className="ppl-list">
              {list.map((x) => {
                const title = x.doc.title || "Untitled";
                return (
                  <PkHold key={x.doc.id} onHold={() => setInfoId(x.doc.id)}>
                    <PplRow
                      lead={<PkGlyph kind="doc" size={40} />}
                      title={title}
                      meta={<RoleChip role={roleView(x.role)} />}
                      onOpen={() => open(x.doc.id)}
                      openLabel={`Open ${title}`}
                      data={{ "data-ppl-shared": x.doc.id }}
                      action={
                        <button
                          type="button"
                          className="ppl-forget"
                          onClick={() => setInfoId(x.doc.id)}
                          aria-label={`Access to ${title}`}
                          data-ppl-access={x.doc.id}
                        >
                          <LuInfo size={18} aria-hidden />
                        </button>
                      }
                    />
                  </PkHold>
                );
              })}
            </div>
          ) : (
            <PkEmpty
              title={sh.nothing_shared_with_you_yet}
              line={sh.when_someone_shares_a_page_with_you_it_s}
              action={
                <PkButton
                  kind="chip"
                  onClick={() => router.push("/pages")}
                  data-ppl-go-docs=""
                >
                  {sh.go_to_documents}
                </PkButton>
              }
            />
          )}
        </PhoneState>
      </PkScreen>

      <PkSheet
        open={!!info}
        onClose={() => setInfoId(null)}
        title={I ? I.doc.title || "Untitled" : ""}
        meta={I ? "Shared with you" : null}
        label="Access"
        className="ppl-acct"
        footer={
          <>
            <PkButton onClick={() => setInfoId(null)}>Done</PkButton>
            <PkButton
              kind="primary"
              onClick={() => {
                if (I) open(I.doc.id);
                setInfoId(null);
              }}
              data-ppl-access-open=""
            >
              Open
            </PkButton>
          </>
        }
      >
        {I && mine ? (
          <div className="ppl-acct-body">
            <span className="pk-label ppl-label">Your access</span>
            <div className="ppl-glist">
              {ROLE_VIEWS.map((r) => {
                const Icon = ICON[r.icon];
                const on = r.key === mine.key;
                return (
                  <div
                    key={r.key}
                    className={pkCx("ppl-perm", on && "is-on")}
                    data-ppl-perm={r.label}
                    aria-current={on || undefined}
                  >
                    <PkHueTile
                      icon={<Icon size={16} aria-hidden />}
                      hue={r.hue}
                      size={36}
                    />
                    <span className="ppl-perm-text">
                      <span className="ppl-perm-title">{r.label}</span>
                      <span className="ppl-perm-desc">{r.desc}</span>
                    </span>
                    {on ? <LuCheck size={18} aria-hidden /> : null}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </PkSheet>
    </>
  );
}
