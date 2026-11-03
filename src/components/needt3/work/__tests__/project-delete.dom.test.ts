/**
 * @jest-environment jsdom
 *
 * Delete project: a confirm first, then a soft delete (the project goes to
 * Trash) with an Undo in the notice. Cancel changes nothing.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { V3PortalScope } from "../../ctx/PortalScope";
import {
  ProjectDeleteHost,
  askDeleteProject,
  deleteProjectText,
  useProjectDeleteAsk,
} from "../ProjectDeleteHost";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const push = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const undo = jest.fn();
const trash = jest.fn((_id: string, _at: string) => Promise.resolve({ undo }));
jest.mock("@/lib/needt3/hooks/projects", () => ({
  useTrashProject: () => ({ trash }),
}));

const success = jest.fn();
jest.mock("@/lib/notifications", () => ({
  notify: { success: (...a: unknown[]) => success(...a) },
}));

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  for (const m of [push, undo, trash, success]) m.mockClear();
  host = document.createElement("div");
  host.className = "needt-v3";
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(h(V3PortalScope, null, h(ProjectDeleteHost))));
});
afterEach(() => {
  act(() => useProjectDeleteAsk.getState().close());
  act(() => root.unmount());
  host.remove();
});

const confirmButton = () =>
  document.body.querySelector<HTMLElement>("[data-project-delete-confirm]");

describe("Delete project", () => {
  it("asks first, naming the project and saying it goes to Trash", () => {
    expect(confirmButton()).toBeNull();
    act(() => askDeleteProject({ id: "p1", name: "Launch" }));
    expect(document.body.textContent).toContain("Delete “Launch”?");
    expect(document.body.textContent).toContain("moves to Trash");
    expect(trash).not.toHaveBeenCalled();
  });

  it("confirming trashes that project once and offers Undo", async () => {
    act(() => askDeleteProject({ id: "p1", name: "Launch" }));
    await act(async () => {
      confirmButton()?.click();
    });
    expect(trash).toHaveBeenCalledTimes(1);
    expect(trash.mock.calls[0][0]).toBe("p1");
    expect(trash.mock.calls[0][1]).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(success).toHaveBeenCalledTimes(1);
    expect(success.mock.calls[0][0]).toBe("Deleted “Launch”");
    const action = (success.mock.calls[0][1] as { action: { label: string } })
      .action;
    expect(action.label).toBe("Undo");
  });

  it("Cancel leaves the project alone", () => {
    act(() => askDeleteProject({ id: "p1", name: "Launch" }));
    const cancel = Array.from(document.body.querySelectorAll("button")).find(
      (b) => b.textContent === "Cancel"
    );
    act(() => cancel?.click());
    expect(trash).not.toHaveBeenCalled();
    expect(useProjectDeleteAsk.getState().project).toBeNull();
  });

  it("words the confirm in one place", () => {
    expect(deleteProjectText("X").confirm).toBe("Delete project");
  });
});
