/**
 * A project is made on Projects (and the sidebar), never from inside a task.
 * The task dialog (desktop) and the task sheet (phone) pick an existing
 * project; neither offers to make one, and neither can reach the create hook
 * or the new-project sheet.
 */
import { readFileSync } from "node:fs";

const FILES = [
  "src/components/needt3/dialogs/TaskDialog.tsx",
  "src/components/needt3/phone/overlays/TaskSheet.tsx",
  "src/components/needt3/composer/Composer.tsx",
  "src/components/needt3/phone/overlays/Composer.tsx",
];

describe("creating a task cannot create a project", () => {
  it.each(FILES)("%s has no project-creation path", (file) => {
    const src = readFileSync(file, "utf8");
    expect(src).not.toMatch(/useCreateProject/);
    expect(src).not.toMatch(/ProjectSheet/);
    expect(src).not.toMatch(/\/api\/projects/);
    expect(src).not.toMatch(/new project|create project|add project/i);
  });

  it("the dialog's project picker only chooses: No project, or one that exists", () => {
    const src = readFileSync(FILES[0], "utf8");
    const popover = src.slice(
      src.indexOf('if (pop.key === "project")'),
      src.indexOf('if (pop.key === "priority")')
    );
    expect(popover).toContain("projects.filter");
    expect(popover).toContain("emit({ projectId: null })");
    expect(popover).toContain("emit({ projectId: p.id })");
    expect(popover).not.toMatch(/LuPlus|onCreate|create/i);
  });
});
