/** The words of Docs as folders (merged into `docsCopy`). */
export const folderCopy = {
  unsorted: "Unsorted",
  /** A page's project that is not in the loaded list (archived, a teammate's). */
  project: "Project",
  open: (label: string, count: number) =>
    `Open ${label}, ${count} ${count === 1 ? "page" : "pages"}`,
  folders: (folders: number, docs: number) =>
    `${folders} ${folders === 1 ? "folder" : "folders"} · ${docs} ${docs === 1 ? "document" : "documents"}`,
} as const;
