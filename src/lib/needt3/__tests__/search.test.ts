import { searchResultFromApi } from "@/lib/needt3/hooks/search";

describe("v3 search results", () => {
  it("links a project to its v3 page, not the old /tasks", () => {
    expect(
      searchResultFromApi({
        id: "p 1",
        type: "Project",
        title: "Resale",
        href: "/tasks",
      })
    ).toEqual({
      id: "p 1",
      kind: "project",
      title: "Resale",
      href: "/projects/p%201",
    });
  });

  it("opens a task in the task list and keeps event links", () => {
    expect(
      searchResultFromApi({
        id: "t1",
        type: "Task",
        title: "Call",
        href: "/tasks",
      }).href
    ).toBe("/tasks?task=t1");
    expect(
      searchResultFromApi({
        id: "e1",
        type: "Event",
        title: "Sync",
        href: "/calendar",
      }).href
    ).toBe("/calendar");
  });
});
