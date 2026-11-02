/**
 * What Settings, Plan says about the student price, shared by the desktop
 * section and the phone page so both say the same words. Pure.
 */
import type { V3Plan } from "@/lib/needt3/hooks/plan";

export { showsStudentPrices } from "@/lib/needt3/student-prices";

type Billing = Pick<V3Plan, "kind" | "student" | "discountApplied">;

const SUPPORT = "students@needt.app";

export type StudentPanel = {
  /** The row's line under "University email". */
  line: string;
  /** Shown under the row; null when there is nothing to add. */
  note: string | null;
  /** Draw the "Add a university email" field. */
  canAdd: boolean;
  verified: boolean;
};

/**
 * `offer`: the person came from needt.app/students. Without a recognised
 * address they are told plainly why there is no discount yet, and where to
 * write instead.
 */
export function studentPanel(
  b: Billing | undefined,
  offer = false
): StudentPanel | null {
  const s = b?.student;
  if (!b || !s || b.kind === "lifetime") return null;
  const pct = `${s.percentOff}%`;
  const manualHelp = `No university email, or a school we don't recognise? Write to ${s.supportEmail || SUPPORT} with proof of enrolment and we'll send you a code.`;
  const running = b.kind === "monthly" || b.kind === "yearly";

  if (
    s.status === "verified" ||
    (s.status === "none" && s.accountEmailQualifies)
  ) {
    const who =
      s.status === "verified"
        ? s.email
          ? s.email
          : "Confirmed by support"
        : "Your sign-in email is from a university";
    const note =
      running && !b.discountApplied
        ? `Your plan started before the student price, and our payment provider can't add a discount to a running subscription. To switch, turn off renewal in Invoices and payment; when the plan ends, choose one here and ${pct} off applies.`
        : null;
    return {
      line: `${who} · ${pct} off Pro monthly and yearly`,
      note,
      canAdd: false,
      verified: true,
    };
  }

  if (s.status === "lapsed") {
    return {
      line: "We couldn't confirm your university email this year",
      note: `Add it again before your renewal to keep ${pct} off. ${manualHelp}`,
      canAdd: true,
      verified: false,
    };
  }

  return {
    line: offer
      ? `Your sign-in email isn't from a school we recognise, so checkout is the regular price. Add your university email to get ${pct} off.`
      : `${pct} off Pro monthly and yearly with a university email`,
    note: manualHelp,
    canAdd: true,
    verified: false,
  };
}
