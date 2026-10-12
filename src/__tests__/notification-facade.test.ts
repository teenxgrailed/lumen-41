import fs from "node:fs";
import path from "node:path";

function sourceFiles(root: string): string[] {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) return sourceFiles(absolute);
    return /\.(ts|tsx)$/.test(entry.name) ? [absolute] : [];
  });
}

const ROOTS = [
  "src/app",
  "src/components",
  "src/hooks",
  "src/lib",
  "src/store",
].map((rel) => path.join(process.cwd(), rel));

const read = (rel: string) =>
  fs.readFileSync(path.join(process.cwd(), rel), "utf8");

describe("notification facade", () => {
  it("keeps product surfaces decoupled from the renderer", () => {
    // Everything raises a message through the facade. That is what made it
    // possible to move where messages appear without touching the two
    // hundred-odd places that raise one, and it is worth keeping true.
    const offenders = ROOTS.flatMap(sourceFiles)
      .filter(
        (file) =>
          path.relative(process.cwd(), file) !==
          "src/components/needt/corner/NeedtNotices.tsx"
      )
      .filter((file) => {
        const source = fs.readFileSync(file, "utf8");
        return (
          source.includes('from "sonner"') ||
          source.includes("corner/NotificationStack")
        );
      })
      .map((file) => path.relative(process.cwd(), file));

    expect(offenders).toEqual([]);
  });

  it("still carries a message's own line and a recurring message's name", () => {
    const facade = read("src/lib/notifications.ts");
    expect(facade).toContain("dedupeKey");
    expect(facade).toContain("description");
  });

  it("announces itself to a screen reader", () => {
    // Sonner gave this for free. The design's stack does not, and an error
    // nobody is told about is the one that matters.
    const stack = read("src/components/needt/corner/NotificationStack.tsx");
    expect(stack).toContain('aria-label="Needt notifications"');
    expect(stack).toContain("aria-live=");
    expect(stack).toContain('"assertive"');
    expect(stack).toContain('label="Dismiss notification"');
  });
});
