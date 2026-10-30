"use client";

import { FiCheck } from "react-icons/fi";

import type { V3Plan } from "@/lib/needt3/hooks/plan";

import { SBtn, SGroup, SRow } from "./kit";
import { studentPanel } from "./student-derive";
import { useStudentEmail } from "./useStudentEmail";

/**
 * Settings, Plan, "Student price": the current student status and the
 * "Add a university email" field. The address is confirmed by a signed link
 * mailed to it (POST /api/students/email); checkout then applies the student
 * code to Pro monthly and yearly.
 */
export function StudentGroup({
  plan,
  refetch,
}: {
  plan: V3Plan | undefined;
  refetch: () => Promise<unknown>;
}) {
  const form = useStudentEmail(refetch);
  const panel = studentPanel(plan, form.offer);
  if (!panel) return null;

  return (
    <SGroup
      title="Student price"
      hint={[panel.note, "Lifetime is not discounted."]
        .filter(Boolean)
        .join(" ")}
    >
      <SRow title="University email" desc={panel.line}>
        {panel.verified ? (
          <span className="settings-pro-on">
            <FiCheck size={13} aria-hidden />
            On
          </span>
        ) : null}
      </SRow>
      {panel.canAdd ? (
        <SRow
          title="Add a university email"
          desc={
            form.error ? (
              <span role="alert" style={{ color: "var(--destructive)" }}>
                {form.error}
              </span>
            ) : form.sentTo ? (
              <span role="status" data-settings-student-sent="">
                Check {form.sentTo} for a link. It works for 24 hours.
              </span>
            ) : undefined
          }
        >
          <input
            className="pl-field"
            type="email"
            inputMode="email"
            autoComplete="email"
            aria-label="University email"
            placeholder="name@university.edu"
            maxLength={254}
            value={form.draft}
            disabled={form.busy}
            onChange={(e) => form.setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void form.send();
            }}
            data-settings-student-email=""
          />
          <SBtn
            disabled={form.busy || !form.draft.trim()}
            onClick={() => void form.send()}
          >
            {form.busy ? "Sending…" : "Send link"}
          </SBtn>
        </SRow>
      ) : null}
    </SGroup>
  );
}
