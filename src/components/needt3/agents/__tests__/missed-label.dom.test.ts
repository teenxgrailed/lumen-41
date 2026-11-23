/**
 * @jest-environment jsdom
 *
 * A repeating item the hub closed because its lease ended unfinished reads
 * "Missed" on the Agents screen; an owner cancel keeps reading "Cancelled".
 */
import { isMissed, statusLabel } from "../TasksTab";

const event = (type: string) => ({
  at: "2026-11-09T14:05:00.000Z",
  type,
  message: null,
  actor: { kind: "system" },
});

describe("Missed label", () => {
  it("labels a cancelled occurrence whose lease ended and whose latest event is the expiry", () => {
    const row = {
      status: "cancelled",
      occurrenceExpiresAt: "2026-11-09T14:00:00.000Z",
      latestEvent: event("occurrence_expired"),
    };
    expect(isMissed(row)).toBe(true);
    expect(statusLabel(row)).toBe("Missed");
  });

  it("keeps Cancelled for an owner cancel, with or without a lease", () => {
    expect(
      statusLabel({
        status: "cancelled",
        occurrenceExpiresAt: "2026-11-09T14:00:00.000Z",
        latestEvent: event("cancelled"),
      })
    ).toBe("Cancelled");
    expect(
      statusLabel({
        status: "cancelled",
        occurrenceExpiresAt: null,
        latestEvent: event("occurrence_expired"),
      })
    ).toBe("Cancelled");
  });

  it("leaves every other status alone", () => {
    for (const [status, label] of [
      ["open", "Open"],
      ["needs_owner", "Needs you"],
      ["blocked", "Blocked"],
      ["done", "Done"],
    ] as const) {
      expect(
        statusLabel({
          status,
          occurrenceExpiresAt: "2026-11-09T14:00:00.000Z",
          latestEvent: event("occurrence_expired"),
        })
      ).toBe(label);
    }
  });
});
