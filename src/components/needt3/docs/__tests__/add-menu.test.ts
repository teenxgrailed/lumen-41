/**
 * The Docs "+" menu draws only what works: New Folder has no v3 flow behind
 * it, so it is not drawn (a disabled row with no way to enable it is clutter).
 */
import { readFileSync } from "fs";
import { join } from "path";

const src = readFileSync(join(__dirname, "..", "DocsScreen.tsx"), "utf8");

describe("DocsScreen add menu", () => {
  it("has no disabled row", () => {
    expect(src).not.toMatch(/disabled:\s*true/);
    expect(src).not.toMatch(/^\s*art: "folder"/m);
  });

  it("keeps New Doc and From template", () => {
    expect(src).toContain("onClick: onNewDoc");
    expect(src).toContain('router.push("/templates")');
  });
});
