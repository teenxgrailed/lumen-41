import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("Mail snooze and reminder contract", () => {
  const database = readFileSync(
    join(process.cwd(), "src/lib/mail-db.ts"),
    "utf8"
  );
  const route = readFileSync(
    join(process.cwd(), "src/app/api/mail/messages/[id]/route.ts"),
    "utf8"
  );

  it("keeps snoozed messages out of the local inbox until their due time", () => {
    expect(database).toContain("snoozedUntil: null");
    expect(database).toContain("snoozedUntil: { lte: now }");
  });

  it("uses a workspace task reminder without forwarding snooze to providers", () => {
    expect(route).toContain("reminders: {");
    expect(route).toContain("TaskReminderKind.BEFORE_DEADLINE");
    expect(route).not.toContain("mutate");
  });
});
