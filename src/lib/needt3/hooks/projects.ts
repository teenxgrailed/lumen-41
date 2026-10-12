"use client";

import { useQuery } from "@tanstack/react-query";

import {
  type ApiProject,
  type V3Project,
  projectFromApi,
  projectPatchToApi,
} from "@/lib/needt3/map";
import { qk } from "@/lib/needt3/query-keys";

import {
  dropListItem,
  fetchJson,
  findListItem,
  patchListItem,
  previousFields,
  sendJson,
  useUndoableMutation,
} from "./core";

const PROJECTS = qk.projects();

/** Live projects in manual order (`position`, then name). */
export function useProjects() {
  return useQuery({
    queryKey: PROJECTS,
    queryFn: async () => {
      const rows = await fetchJson<ApiProject[]>("/api/projects?status=active");
      return rows
        .map(projectFromApi)
        .sort(
          (a, b) => a.position - b.position || a.name.localeCompare(b.name)
        );
    },
  });
}

type ProjectPatch = Partial<Omit<V3Project, "id">>;

/** Patch a project (name, colour, icon, ground, position, archived). */
export function useUpdateProject() {
  return useUndoableMutation<{ id: string; patch: ProjectPatch }, V3Project>({
    scope: PROJECTS,
    label: "update the project",
    inverse: (qc, { id, patch }) => {
      const cur = findListItem<V3Project>(qc, PROJECTS, id);
      return cur ? { id, patch: previousFields(cur, patch) } : null;
    },
    optimistic: (qc, { id, patch }) =>
      patch.archived
        ? dropListItem<V3Project>(qc, PROJECTS, id)
        : patchListItem<V3Project>(qc, PROJECTS, id, (p) => ({
            ...p,
            ...patch,
          })),
    request: async ({ id, patch }) =>
      projectFromApi(
        await sendJson<ApiProject>(
          `/api/projects/${id}`,
          "PUT",
          projectPatchToApi(patch)
        )
      ),
  });
}

/** Remove a project from the list (archive); undo brings it back. */
export function useArchiveProject() {
  const update = useUpdateProject();
  return {
    ...update,
    archive: (id: string) =>
      update.mutateAsync({ id, patch: { archived: true } }),
  };
}

type ProjectDraft = Partial<Omit<V3Project, "id" | "archived">> & {
  name: string;
};

/** Create a project. Undo archives it (projects are never hard-deleted here). */
export function useCreateProject() {
  return useUndoableMutation<
    { draft: ProjectDraft } | { archiveId: string },
    V3Project
  >({
    scope: PROJECTS,
    label: "create the project",
    inverseFromResult: true,
    inverse: (_qc, vars, result) =>
      "draft" in vars && result ? { archiveId: result.id } : null,
    optimistic: (qc, vars) => {
      if ("archiveId" in vars)
        dropListItem<V3Project>(qc, PROJECTS, vars.archiveId);
    },
    request: async (vars) =>
      projectFromApi(
        "archiveId" in vars
          ? await sendJson<ApiProject>(
              `/api/projects/${vars.archiveId}`,
              "PUT",
              {
                status: "archived",
              }
            )
          : await sendJson<ApiProject>(
              "/api/projects",
              "POST",
              projectPatchToApi(vars.draft)
            )
      ),
  });
}
