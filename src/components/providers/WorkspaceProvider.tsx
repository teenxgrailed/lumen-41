"use client";

import {
  PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useQueryClient } from "@tanstack/react-query";

import { useAppSession } from "@/components/providers/app-session-context";

import { scopeWorkspaceRequest } from "@/lib/workspaces/client-request-scope";

import { useCalendarStore } from "@/store/calendar";
import { useProjectStore } from "@/store/project";
import { useTaskStore } from "@/store/task";

import {
  loadWorkspaceStores,
  reportWorkspaceBootstrapFailure,
} from "./workspace-bootstrap";

const ACTIVE_WORKSPACE_STORAGE_KEY = "needt-active-workspace-id";

export type WorkspaceRole = "OWNER" | "EDITOR" | "VIEWER";
export type WorkspaceKind = "PERSONAL" | "SHARED";

export interface WorkspaceMembership {
  role: WorkspaceRole;
  workspace: {
    id: string;
    name: string;
    kind: WorkspaceKind;
    createdAt: string;
  };
}

interface WorkspaceContextValue {
  activeWorkspace: WorkspaceMembership | null;
  isLoading: boolean;
  selectWorkspace: (workspaceId: string) => Promise<void>;
  workspaces: WorkspaceMembership[];
  refreshWorkspaces: () => Promise<WorkspaceMembership[]>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

function resetWorkspaceStores() {
  useTaskStore.setState({
    tasks: [],
    tags: [],
    loading: false,
    error: null,
  });
  useCalendarStore.setState({
    feeds: [],
    events: [],
    isLoading: false,
    error: undefined,
  });
  useProjectStore.setState({
    projects: [],
    activeProject: null,
    loading: false,
    error: null,
  });
}

export function WorkspaceProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const { status } = useAppSession();
  const [workspaces, setWorkspaces] = useState<WorkspaceMembership[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(true);
  const activeWorkspaceIdRef = useRef<string | null>(null);
  const previousWorkspaceIdRef = useRef<string | null>(null);

  const refreshWorkspaces = useCallback(async (): Promise<
    WorkspaceMembership[]
  > => {
    if (status === "loading") return [];
    if (status !== "authenticated") {
      setWorkspaces([]);
      setActiveWorkspaceId(null);
      setIsLoading(false);
      return [];
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/workspaces", { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load workspaces.");
      const data = (await response.json()) as {
        workspaces?: WorkspaceMembership[];
      };
      const memberships = data.workspaces ?? [];
      const storedWorkspaceId = localStorage.getItem(
        ACTIVE_WORKSPACE_STORAGE_KEY
      );
      const active =
        memberships.find(
          (membership) => membership.workspace.id === storedWorkspaceId
        ) ??
        memberships.find(
          (membership) => membership.workspace.kind === "PERSONAL"
        ) ??
        memberships[0];

      setWorkspaces(memberships);
      setActiveWorkspaceId(active?.workspace.id ?? null);
      return memberships;
    } finally {
      setIsLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void refreshWorkspaces().catch(reportWorkspaceBootstrapFailure);
  }, [refreshWorkspaces]);

  useLayoutEffect(() => {
    activeWorkspaceIdRef.current = activeWorkspaceId;
    if (!activeWorkspaceId) return;
    localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, activeWorkspaceId);
  }, [activeWorkspaceId]);

  useEffect(() => {
    if (!activeWorkspaceId) return;
    if (previousWorkspaceIdRef.current === activeWorkspaceId) return;

    const isFirstResolve = previousWorkspaceIdRef.current === null;
    previousWorkspaceIdRef.current = activeWorkspaceId;
    if (isFirstResolve) {
      // First resolve after a hard load: queries that mounted before the
      // workspace was known must refetch in its scope. clear() would orphan
      // their observers (they stay pending forever — v3 screens sat on the
      // skeleton); resetQueries() drops the data and refetches what is mounted.
      void queryClient.resetQueries();
    } else {
      queryClient.clear();
    }
    resetWorkspaceStores();
    useTaskStore.setState({ loading: true });
    useProjectStore.setState({ loading: true });
    const workspaceId = activeWorkspaceId;
    void loadWorkspaceStores()
      .then(({ projects, tags, tasks }) => {
        if (activeWorkspaceIdRef.current !== workspaceId) return;
        useTaskStore.setState({ tasks, tags, loading: false, error: null });
        useProjectStore.setState({
          projects,
          activeProject: null,
          loading: false,
          error: null,
        });
      })
      .catch((error) => {
        if (activeWorkspaceIdRef.current !== workspaceId) return;
        useTaskStore.setState({ loading: false, error: error as Error });
        useProjectStore.setState({ loading: false, error: error as Error });
        void reportWorkspaceBootstrapFailure(error);
      });
  }, [activeWorkspaceId, queryClient]);

  useLayoutEffect(() => {
    const originalFetch = window.fetch;
    window.fetch = (input, init) => {
      const workspaceId = activeWorkspaceIdRef.current;
      if (!workspaceId) return originalFetch(input, init);
      const [scopedInput, scopedInit] = scopeWorkspaceRequest(
        input,
        init,
        workspaceId
      );
      return originalFetch(scopedInput, scopedInit);
    };
    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  const selectWorkspace = useCallback(
    async (workspaceId: string) => {
      if (workspaceId === activeWorkspaceId) return;
      const memberships = workspaces.some(
        (membership) => membership.workspace.id === workspaceId
      )
        ? workspaces
        : await refreshWorkspaces();
      if (
        !memberships.some(
          (membership) => membership.workspace.id === workspaceId
        )
      ) {
        throw new Error("This workspace is no longer available.");
      }

      await queryClient.cancelQueries();
      queryClient.clear();
      resetWorkspaceStores();
      setActiveWorkspaceId(workspaceId);
    },
    [activeWorkspaceId, queryClient, refreshWorkspaces, workspaces]
  );

  const activeWorkspace =
    workspaces.find(
      (membership) => membership.workspace.id === activeWorkspaceId
    ) ?? null;
  const value = useMemo(
    () => ({
      activeWorkspace,
      isLoading,
      selectWorkspace,
      workspaces,
      refreshWorkspaces,
    }),
    [activeWorkspace, isLoading, refreshWorkspaces, selectWorkspace, workspaces]
  );

  return (
    <WorkspaceContext.Provider value={value}>
      {isLoading ? null : children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspace must be used within WorkspaceProvider.");
  }
  return context;
}
