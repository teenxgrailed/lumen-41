/**
 * The desktop MailScreen draws what the shared controller gives it and writes
 * nothing itself: a mutation hook imported here would be a second writer that
 * the phone face and the once-guard in useMailbox know nothing about.
 */
import { readFileSync } from "fs";
import { join } from "path";

const source = readFileSync(join(__dirname, "..", "MailScreen.tsx"), "utf8");
const identifiers = new Set(source.match(/[A-Za-z_$][\w$]*/g) ?? []);

describe("MailScreen.tsx", () => {
  it.each([
    "useMarkRead",
    "useArchiveMail",
    "useTrashMail",
    "useCreateTask",
    "useTrashTask",
    "useEventLifecycle",
  ])("does not import %s", (hook) => {
    expect(identifiers.has(hook)).toBe(false);
  });

  it("takes the controller as a prop", () => {
    expect(source).toMatch(/export function MailScreen\(\{ box \}/);
  });

  it("falls back to the list when nothing is open in the narrow layout", () => {
    expect(source).toContain("const showList = !narrow || !reading || !open;");
  });
});
