/**
 * The right-click / ⋯ menus sat under the sidebar rail: Radix copies the
 * content's computed z-index onto its fixed wrapper, and a static element has
 * none, so the wrapper stacked at "auto" below the rail (shell.css, 700-1100).
 * The menu was invisible and the row under the pointer took the clicks. The
 * content has to be positioned and carry a z-index above the rail.
 */
import { readFileSync } from "fs";
import { join } from "path";

import { CTX_MENU_Z } from "../CtxLayer";

const ctxLayer = readFileSync(
  join(process.cwd(), "src/components/needt3/ctx/CtxLayer.tsx"),
  "utf8"
);
const projectPage = readFileSync(
  join(process.cwd(), "src/components/needt3/work/ProjectPage.tsx"),
  "utf8"
);

describe("menu stacking", () => {
  it("clears the highest layer the shell draws under it", () => {
    expect(CTX_MENU_Z).toBeGreaterThan(1100);
  });

  it("the context menu is positioned and stacked, not static", () => {
    const src = ctxLayer;
    expect(src).not.toMatch(/position:\s*"static"/);
    expect(src).toMatch(/position:\s*"relative"/);
    expect(src).toMatch(/zIndex:\s*CTX_MENU_Z/);
  });

  it("the project page's ⋯ menu is stacked the same way", () => {
    const src = projectPage;
    expect(src).toMatch(/zIndex:\s*MENU_Z/);
    expect(src).toMatch(/MENU_Z\s*=\s*1200/);
  });
});
