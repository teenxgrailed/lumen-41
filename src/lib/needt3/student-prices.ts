import type { V3Plan } from "./hooks/plan";

type Facts = Partial<Pick<V3Plan, "kind" | "student" | "discountApplied">>;

/**
 * The Pro prices on screen are the student ones: checkout will apply them
 * (Free and trial), or the running subscription already carries them.
 * Lifetime is never discounted, whatever this says.
 */
export function showsStudentPrices(b: Facts | null | undefined): boolean {
  if (!b?.student?.priceApplies) return false;
  if (b.kind === "free" || b.kind === "trial") return true;
  return (b.kind === "monthly" || b.kind === "yearly") && !!b.discountApplied;
}
