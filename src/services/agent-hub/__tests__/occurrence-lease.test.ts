/**
 * The lease column an occurrence gets when its status changes: parking it or
 * escalating it starts the 7 day cap, leaving that state starts a fresh 24
 * hours (H1/M1), and an item that is not an occurrence is left alone.
 */
import { leaseOnTransition, waitingLeaseEnd } from "../occurrence-lease";
import { occurrenceLeaseEnd } from "../recurrences";

const NOW = new Date("2026-11-09T14:05:00Z");
const DAY = 24 * 60 * 60 * 1000;
const occurrence = { recurrenceId: "rec1" };

describe("leaseOnTransition", () => {
  it("starts the 7 day cap when an occurrence starts waiting", () => {
    for (const [from, to] of [
      ["open", "needs_owner"],
      ["claimed", "needs_owner"],
      ["in_progress", "needs_owner"],
      ["in_progress", "blocked"],
      ["claimed", "blocked"],
    ]) {
      expect(leaseOnTransition(occurrence, from, to, NOW)).toEqual({
        occurrenceExpiresAt: new Date(NOW.getTime() + 7 * DAY),
      });
    }
    expect(waitingLeaseEnd(NOW).getTime()).toBe(NOW.getTime() + 7 * DAY);
  });

  it("starts a fresh 24 hours when it leaves needs_owner or blocked", () => {
    for (const [from, to] of [
      ["needs_owner", "open"],
      ["blocked", "in_progress"],
      ["blocked", "claimed"],
    ]) {
      expect(leaseOnTransition(occurrence, from, to, NOW)).toEqual({
        occurrenceExpiresAt: occurrenceLeaseEnd(NOW, null),
      });
    }
    expect(
      leaseOnTransition(
        occurrence,
        "needs_owner",
        "open",
        NOW
      ).occurrenceExpiresAt!.getTime()
    ).toBe(NOW.getTime() + DAY);
  });

  it("leaves the lease alone for every other move", () => {
    for (const [from, to] of [
      ["open", "claimed"],
      ["claimed", "in_progress"],
      ["in_progress", "in_progress"],
      ["blocked", "blocked"],
      ["needs_owner", "needs_owner"],
    ]) {
      expect(leaseOnTransition(occurrence, from, to, NOW)).toEqual({});
    }
  });

  it("does nothing for an item that is not an occurrence", () => {
    expect(
      leaseOnTransition({ recurrenceId: null }, "needs_owner", "open", NOW)
    ).toEqual({});
    expect(
      leaseOnTransition({ recurrenceId: null }, "open", "needs_owner", NOW)
    ).toEqual({});
  });
});
