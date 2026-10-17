"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  type MoodboardScene,
  readMoodboardScene,
  replaceMoodboardScene,
  writeMoodboardSceneChanges,
} from "@/services/moodboards/moodboard-document";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type {
  BinaryFiles,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";
import {
  HocuspocusProvider,
  HocuspocusProviderWebsocket,
} from "@hocuspocus/provider";
import {
  Download,
  FileJson,
  History,
  ImageDown,
  LoaderCircle,
  Share2,
} from "lucide-react";

import { Button } from "@/components/ui/button";

import { setProviderToken } from "@/lib/collaboration/provider-token";
import { Yjs as Y } from "@/lib/collaboration/yjs";
import { newDate } from "@/lib/date-utils";

import type { MoodboardDetail, MoodboardSnapshot } from "./moodboard-types";

const Excalidraw = dynamic(
  () => import("@excalidraw/excalidraw").then((module) => module.Excalidraw),
  {
    ssr: false,
    loading: () => <div className="h-full bg-[var(--surface-canvas)]" />,
  }
);

type CollaborationTokenResponse = {
  token: string;
  initialState: string;
  role: MoodboardDetail["accessRole"];
  url: string;
  user: { name: string; color: string };
};

const LOCAL_ORIGIN = Symbol("moodboard-local");

function decodeState(value: string) {
  const binary = window.atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function sceneFromUnknown(value: unknown): MoodboardScene | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  return Array.isArray(candidate.elements) &&
    candidate.appState &&
    typeof candidate.appState === "object" &&
    !Array.isArray(candidate.appState) &&
    candidate.files &&
    typeof candidate.files === "object" &&
    !Array.isArray(candidate.files)
    ? {
        elements: candidate.elements.filter(
          (element): element is Record<string, unknown> =>
            Boolean(element) &&
            typeof element === "object" &&
            !Array.isArray(element)
        ),
        appState: candidate.appState as Record<string, unknown>,
        files: candidate.files as Record<string, Record<string, unknown>>,
      }
    : null;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function MoodboardWorkspace({ moodboardId }: { moodboardId: string }) {
  const router = useRouter();
  const [moodboard, setMoodboard] = useState<MoodboardDetail | null>(null);
  const [status, setStatus] = useState<
    "connecting" | "connected" | "disconnected"
  >("connecting");
  const [collaborators, setCollaborators] = useState<
    Array<{ name: string; color: string }>
  >([]);
  const [snapshots, setSnapshots] = useState<MoodboardSnapshot[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const excalidrawApi = useRef<ExcalidrawImperativeAPI | null>(null);
  const applyingRemote = useRef(false);
  const initialized = useRef(false);
  const lastScene = useRef<MoodboardScene>({
    elements: [],
    appState: { viewBackgroundColor: "#ffffff" },
    files: {},
  });
  const document = useMemo(
    () => new Y.Doc({ guid: `moodboard:${moodboardId}` }),
    [moodboardId]
  );
  const socket = useMemo(
    () =>
      new HocuspocusProviderWebsocket({
        url: process.env.NEXT_PUBLIC_COLLABORATION_URL ?? "ws://localhost:1234",
        autoConnect: false,
      }),
    []
  );
  const provider = useMemo(
    () =>
      new HocuspocusProvider({
        name: `moodboard:${moodboardId}`,
        document,
        websocketProvider: socket,
        token: null,
        onStatus: ({ status: next }) =>
          setStatus(
            next === "connected"
              ? "connected"
              : next === "disconnected"
                ? "disconnected"
                : "connecting"
          ),
        onAwarenessChange: ({ states }) =>
          setCollaborators(
            states.flatMap((state) => {
              const user = state.user as
                | { name?: unknown; color?: unknown }
                | undefined;
              return typeof user?.name === "string" &&
                typeof user.color === "string"
                ? [{ name: user.name, color: user.color }]
                : [];
            })
          ),
      }),
    [document, moodboardId, socket]
  );

  const applyScene = useCallback((scene: MoodboardScene) => {
    const api = excalidrawApi.current;
    if (!api) return;
    lastScene.current = scene;
    applyingRemote.current = true;
    api.updateScene({
      elements: scene.elements as ExcalidrawElement[],
      appState: scene.appState as never,
    });
    api.addFiles(Object.values(scene.files) as BinaryFiles[string][]);
    requestAnimationFrame(() => {
      applyingRemote.current = false;
    });
  }, []);

  useEffect(() => {
    const update = (_update: Uint8Array, origin: unknown) => {
      if (origin !== LOCAL_ORIGIN) applyScene(readMoodboardScene(document));
    };
    document.on("update", update);
    return () => document.off("update", update);
  }, [applyScene, document]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const response = await fetch(`/api/moodboards/${moodboardId}`);
      if (!response.ok) {
        router.replace("/moodboards");
        return;
      }
      const { moodboard: loaded } = (await response.json()) as {
        moodboard: MoodboardDetail;
      };
      if (cancelled) return;
      setMoodboard(loaded);
      const tokenResponse = await fetch(
        `/api/moodboards/${moodboardId}/collaboration-token`,
        { method: "POST" }
      );
      if (!tokenResponse.ok) {
        setStatus("disconnected");
        setError("Live collaboration is unavailable.");
        return;
      }
      const collaboration =
        (await tokenResponse.json()) as CollaborationTokenResponse;
      if (cancelled) return;
      Y.applyUpdate(document, decodeState(collaboration.initialState));
      socket.setConfiguration({ url: collaboration.url });
      let nextToken: string | null = collaboration.token;
      setProviderToken(provider, socket, async () => {
        if (nextToken) {
          const token = nextToken;
          nextToken = null;
          return token;
        }
        const refreshed = await fetch(
          `/api/moodboards/${moodboardId}/collaboration-token`,
          { method: "POST" }
        );
        if (!refreshed.ok)
          throw new Error("Moodboard collaboration access denied");
        return ((await refreshed.json()) as CollaborationTokenResponse).token;
      });
      provider.setAwarenessField("user", collaboration.user);
      provider.attach();
      initialized.current = true;
      applyScene(readMoodboardScene(document));
      void socket.connect().catch(() => setStatus("disconnected"));
    })().catch(() => setError("Could not load this moodboard."));
    return () => {
      cancelled = true;
    };
  }, [applyScene, document, moodboardId, provider, router, socket]);

  useEffect(() => () => provider.destroy(), [provider]);
  useEffect(
    () => () => {
      socket.destroy();
      document.destroy();
    },
    [document, socket]
  );

  const loadSnapshots = useCallback(async () => {
    if (moodboard?.accessRole !== "FULL_ACCESS") return;
    const response = await fetch(`/api/moodboards/${moodboardId}/snapshots`);
    if (!response.ok) return;
    const data = (await response.json()) as { snapshots?: MoodboardSnapshot[] };
    setSnapshots(Array.isArray(data.snapshots) ? data.snapshots : []);
  }, [moodboard?.accessRole, moodboardId]);

  const restoreSnapshot = async (snapshotId: string) => {
    const response = await fetch(
      `/api/moodboards/${moodboardId}/snapshots/${snapshotId}/restore`,
      { method: "POST" }
    );
    if (!response.ok) return;
    const data = (await response.json()) as { snapshot?: { scene?: unknown } };
    const scene = sceneFromUnknown(data.snapshot?.scene);
    if (!scene) return;
    replaceMoodboardScene(document, scene, LOCAL_ORIGIN);
    applyScene(scene);
    setHistoryOpen(false);
  };

  const exportScene = async (format: "png" | "svg" | "json") => {
    const api = excalidrawApi.current;
    if (!api) return;
    const elements = api.getSceneElements();
    const appState = api.getAppState();
    const files = api.getFiles();
    const name =
      moodboard?.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase() ||
      "moodboard";
    const excalidraw = await import("@excalidraw/excalidraw");
    if (format === "json") {
      downloadBlob(
        new Blob(
          [excalidraw.serializeAsJSON(elements, appState, files, "local")],
          { type: "application/json" }
        ),
        `${name}.excalidraw`
      );
      return;
    }
    if (format === "png") {
      downloadBlob(
        await excalidraw.exportToBlob({
          elements,
          appState,
          files,
          mimeType: "image/png",
        }),
        `${name}.png`
      );
      return;
    }
    const svg = await excalidraw.exportToSvg({ elements, appState, files });
    downloadBlob(
      new Blob([svg.outerHTML], { type: "image/svg+xml" }),
      `${name}.svg`
    );
  };

  if (!moodboard) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[var(--surface-canvas)] text-sm text-[var(--text-muted)]">
        <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> Loading moodboard
      </div>
    );
  }

  const canManage = moodboard.accessRole === "FULL_ACCESS";
  return (
    <div className="flex h-[calc(100dvh-68px-env(safe-area-inset-bottom))] min-h-[420px] flex-col bg-[var(--surface-canvas)] lg:h-dvh">
      <header className="flex min-h-14 shrink-0 items-center gap-2 border-b border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3 sm:px-4">
        <Link
          className="flex min-h-11 items-center rounded-[var(--control-radius)] px-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--menu-item-hover)]"
          href="/moodboards"
        >
          Moodboards
        </Link>
        <div className="min-w-0 flex-1 truncate text-sm font-medium">
          {moodboard.title}
        </div>
        <div className="hidden items-center gap-1 sm:flex">
          {collaborators.slice(0, 4).map((collaborator, index) => (
            <span
              className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold text-white"
              key={`${collaborator.name}-${index}`}
              style={{ backgroundColor: collaborator.color }}
              title={collaborator.name}
            >
              {collaborator.name.slice(0, 1).toUpperCase()}
            </span>
          ))}
        </div>
        <span className="hidden text-xs text-[var(--text-muted)] sm:inline">
          {status === "connected"
            ? "Live"
            : status === "connecting"
              ? "Connecting"
              : "Offline"}
        </span>
        {canManage && (
          <Button
            aria-label="Open version history"
            className="h-11 w-11 min-h-[44px] min-w-[44px]"
            onClick={() => {
              setHistoryOpen((open) => !open);
              if (!historyOpen) void loadSnapshots();
            }}
            size="icon"
            title="Version history"
            variant="ghost"
          >
            <History />
          </Button>
        )}
        <Button
          aria-label="Export moodboard"
          className="h-11 w-11 min-h-[44px] min-w-[44px]"
          onClick={() => void exportScene("png")}
          size="icon"
          title="Export PNG"
          variant="ghost"
        >
          <ImageDown />
        </Button>
        <Button
          aria-label="Export SVG"
          className="h-11 w-11 min-h-[44px] min-w-[44px]"
          onClick={() => void exportScene("svg")}
          size="icon"
          title="Export SVG"
          variant="ghost"
        >
          <Download />
        </Button>
        <Button
          aria-label="Export Excalidraw file"
          className="h-11 w-11 min-h-[44px] min-w-[44px]"
          onClick={() => void exportScene("json")}
          size="icon"
          title="Export Excalidraw file"
          variant="ghost"
        >
          <FileJson />
        </Button>
        <Button className="hidden sm:inline-flex" size="sm" variant="secondary">
          <Share2 /> Collaborate
        </Button>
      </header>
      {error && (
        <div className="border-b border-[var(--border-subtle)] bg-[var(--surface-raised)] px-4 py-2 text-xs text-[var(--color-danger)]">
          {error}
        </div>
      )}
      {historyOpen && (
        <aside className="absolute right-3 top-16 z-20 w-72 rounded-[var(--panel-radius)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-3 shadow-[var(--shadow-popover)]">
          <div className="mb-2 text-sm font-medium">Version history</div>
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {snapshots.map((snapshot) => (
              <button
                className="flex w-full items-center justify-between rounded-[var(--control-radius)] px-2 py-2 text-left text-xs hover:bg-[var(--menu-item-hover)]"
                key={snapshot.id}
                onClick={() => void restoreSnapshot(snapshot.id)}
                type="button"
              >
                <span>{newDate(snapshot.createdAt).toLocaleString()}</span>
                <span className="text-[var(--color-accent)]">Restore</span>
              </button>
            ))}
            {snapshots.length === 0 && (
              <p className="px-2 py-3 text-xs text-[var(--text-muted)]">
                Snapshots are created while people work.
              </p>
            )}
          </div>
        </aside>
      )}
      <div className="min-h-0 flex-1 [&_.excalidraw]:h-full [&_.excalidraw]:w-full">
        <Excalidraw
          excalidrawAPI={(api) => {
            excalidrawApi.current = api;
            if (initialized.current) applyScene(readMoodboardScene(document));
          }}
          initialData={{ elements: [] }}
          isCollaborating={status === "connected"}
          onChange={(elements, appState, files) => {
            if (
              !initialized.current ||
              applyingRemote.current ||
              moodboard.accessRole === "VIEWER"
            )
              return;
            const nextScene = {
              elements: [...elements] as Record<string, unknown>[],
              appState: appState as unknown as Record<string, unknown>,
              files: files as Record<string, Record<string, unknown>>,
            };
            writeMoodboardSceneChanges(
              document,
              lastScene.current,
              nextScene,
              LOCAL_ORIGIN
            );
            lastScene.current = nextScene;
          }}
          viewModeEnabled={moodboard.accessRole === "VIEWER"}
        />
      </div>
    </div>
  );
}
