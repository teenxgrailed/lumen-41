import {
  authenticateMoodboardCollaboration,
  moodboardIdFromCollaborationDocument,
} from "@/services/moodboards/moodboard-collaboration-auth";
import {
  readMoodboardScene,
  writeMoodboardScene,
} from "@/services/moodboards/moodboard-document";
import {
  authenticatePageCollaboration,
  pageIdFromCollaborationDocument,
} from "@/services/pages/page-collaboration-auth";
import {
  closePageCollaborationSessions,
  openPageCollaborationSession,
  storePageCollaborationDocument,
  touchPageCollaborationSession,
} from "@/services/pages/page-write-path";
import { Redis as RedisExtension } from "@hocuspocus/extension-redis";
import { type Connection, Server } from "@hocuspocus/server";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";

import { Yjs as Y } from "@/lib/collaboration/yjs";
import { newDate } from "@/lib/date-utils";
import { isBuildShaAllowed, resolveBuildSha } from "@/lib/health/build-sha";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import {
  type CollaborationContext,
  isCollaborationReadOnly,
  reauthorizeCollaboration,
} from "./access-policy";

const LOG_SOURCE = "collaboration-server";
const MOODBOARD_SNAPSHOT_INTERVAL_MS = 5 * 60 * 1_000;
const DEFAULT_AUTHORIZATION_RECHECK_INTERVAL_MS = 15_000;
const PAGE_LEASE_HEARTBEAT_INTERVAL_MS = 15_000;
const ACCESS_REVOKED = {
  code: 4403,
  reason: "Collaboration access revoked",
} as const;

export type CollaborationServerOptions = {
  address?: string;
  port?: number;
  useRedis?: boolean;
  authorizationRecheckIntervalMs?: number;
  buildSha?: string;
};

class CollaborationAuthorizationError extends Error {
  readonly code = ACCESS_REVOKED.code;
  readonly reason = ACCESS_REVOKED.reason;

  constructor() {
    super(ACCESS_REVOKED.reason);
    this.name = "CollaborationAuthorizationError";
  }
}

function redisExtensions(enabled: boolean) {
  if (!enabled || !process.env.REDIS_URL) return [];
  const redisUrl = new URL(process.env.REDIS_URL);
  return [
    new RedisExtension({
      host: redisUrl.hostname,
      port: Number(redisUrl.port || 6379),
      options: {
        db: Number(redisUrl.pathname.slice(1) || 0),
        password: redisUrl.password
          ? decodeURIComponent(redisUrl.password)
          : undefined,
        username: redisUrl.username
          ? decodeURIComponent(redisUrl.username)
          : undefined,
        tls: redisUrl.protocol === "rediss:" ? {} : undefined,
      },
    }),
  ];
}

function authenticateCollaboration(token: string, documentName: string) {
  return documentName.startsWith("moodboard:")
    ? authenticateMoodboardCollaboration(token, documentName)
    : authenticatePageCollaboration(token, documentName);
}

function isTransientDatabaseError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError ||
    error instanceof Prisma.PrismaClientInitializationError ||
    error instanceof Prisma.PrismaClientUnknownRequestError ||
    error instanceof Prisma.PrismaClientRustPanicError
  );
}

async function refreshConnectionAuthorization(
  connection: Connection<CollaborationContext>,
  documentName: string
) {
  try {
    const context = await reauthorizeCollaboration(
      connection.context,
      documentName
    );
    connection.context = context;
    connection.readOnly = isCollaborationReadOnly(context);
    return context;
  } catch (error) {
    // A database blip says nothing about access: keep the last known
    // context and let the next check decide. Only a real denial closes.
    if (isTransientDatabaseError(error)) {
      logger.warn(
        "Collaboration re-authorization skipped on a database error",
        { error: error instanceof Error ? error.message : String(error) },
        LOG_SOURCE
      );
      return connection.context;
    }
    throw new CollaborationAuthorizationError();
  }
}

export function createCollaborationServer(
  options: CollaborationServerOptions = {}
) {
  let collaborationServer: Server<CollaborationContext> | null = null;
  const recheckInterval =
    options.authorizationRecheckIntervalMs ??
    DEFAULT_AUTHORIZATION_RECHECK_INTERVAL_MS;
  const buildSha = options.buildSha ?? resolveBuildSha();
  const recheckTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const pageLeaseTimers = new Map<
    string,
    { sessionId: string; timer: ReturnType<typeof setTimeout> }
  >();
  const pageSessions = new Map<string, string>();
  const unloadingPageSessions = new Map<string, string>();
  let destroyed = false;

  function recheckKey(socketId: string, documentName: string) {
    return `${socketId}\0${documentName}`;
  }

  async function releasePageSession(documentName: string, sessionId: string) {
    const pageId = pageIdFromCollaborationDocument(documentName);
    if (pageId) await closePageCollaborationSessions(pageId, [sessionId]);
  }

  function resetPageDocument(documentName: string) {
    const hocuspocus = collaborationServer?.hocuspocus;
    if (!hocuspocus) return;
    const document = hocuspocus.documents.get(documentName);
    hocuspocus.closeConnections(documentName);
    hocuspocus.documents.delete(documentName);
    document?.destroy();
  }

  function cancelPageLeaseHeartbeat(documentName: string, sessionId?: string) {
    const heartbeat = pageLeaseTimers.get(documentName);
    if (!heartbeat || (sessionId && heartbeat.sessionId !== sessionId)) return;
    clearTimeout(heartbeat.timer);
    pageLeaseTimers.delete(documentName);
  }

  function schedulePageLeaseHeartbeat(
    documentName: string,
    pageId: string,
    sessionId: string
  ) {
    cancelPageLeaseHeartbeat(documentName);
    const timer = setTimeout(() => {
      pageLeaseTimers.delete(documentName);
      if (pageSessions.get(documentName) !== sessionId) return;
      void touchPageCollaborationSession(pageId, sessionId)
        .then((touched) => {
          if (pageSessions.get(documentName) !== sessionId) return;
          if (!touched) {
            pageSessions.delete(documentName);
            resetPageDocument(documentName);
            return;
          }
          schedulePageLeaseHeartbeat(documentName, pageId, sessionId);
        })
        .catch(() => {
          if (pageSessions.get(documentName) === sessionId) {
            schedulePageLeaseHeartbeat(documentName, pageId, sessionId);
          }
        });
    }, PAGE_LEASE_HEARTBEAT_INTERVAL_MS);
    timer.unref();
    pageLeaseTimers.set(documentName, { sessionId, timer });
  }

  function cancelRecheck(socketId: string, documentName: string) {
    const key = recheckKey(socketId, documentName);
    const timer = recheckTimers.get(key);
    if (timer) clearTimeout(timer);
    recheckTimers.delete(key);
  }

  function scheduleRecheck(
    socketId: string,
    documentName: string,
    connection: Connection<CollaborationContext>
  ) {
    if (recheckInterval <= 0) return;
    const key = recheckKey(socketId, documentName);
    cancelRecheck(socketId, documentName);
    const timer = setTimeout(() => {
      recheckTimers.delete(key);
      void refreshConnectionAuthorization(connection, documentName)
        .then(() => {
          if (connection.document.hasConnection(connection)) {
            scheduleRecheck(socketId, documentName, connection);
          }
        })
        .catch(() => connection.close(ACCESS_REVOKED));
    }, recheckInterval);
    timer.unref();
    recheckTimers.set(key, timer);
  }

  collaborationServer = new Server<CollaborationContext>({
    address: options.address ?? process.env.COLLABORATION_HOST ?? "0.0.0.0",
    port: options.port ?? Number(process.env.COLLABORATION_PORT ?? 1234),
    quiet: true,
    stopOnSignals: false,
    debounce: 1_500,
    maxDebounce: 10_000,
    timeout: 15_000,
    websocketOptions: { maxPayload: 2 * 1024 * 1024 },
    extensions: redisExtensions(options.useRedis ?? true),
    async onRequest({ request, response }) {
      if (request.url?.split("?", 1)[0] !== "/health") return;
      const ok = isBuildShaAllowed(buildSha);
      response.writeHead(ok ? 200 : 503, {
        "Content-Type": "application/json",
      });
      response.end(
        JSON.stringify({
          ok,
          service: "collaboration",
          buildSha,
        })
      );
      return Promise.reject();
    },
    async onAuthenticate({ token, documentName, connectionConfig }) {
      const context = await authenticateCollaboration(token, documentName);
      connectionConfig.readOnly = isCollaborationReadOnly(context);
      return context;
    },
    async onTokenSync({ token, documentName, connection }) {
      try {
        const context = await authenticateCollaboration(token, documentName);
        connection.context = context;
        connection.readOnly = isCollaborationReadOnly(context);
        return context;
      } catch {
        throw new CollaborationAuthorizationError();
      }
    },
    async connected({ socketId, documentName, connection }) {
      scheduleRecheck(socketId, documentName, connection);
    },
    async beforeHandleMessage({ connection, documentName }) {
      await refreshConnectionAuthorization(connection, documentName);
    },
    async onDisconnect({ socketId, documentName }) {
      cancelRecheck(socketId, documentName);
    },
    async onDestroy() {
      destroyed = true;
      for (const timer of recheckTimers.values()) clearTimeout(timer);
      recheckTimers.clear();
      for (const heartbeat of pageLeaseTimers.values()) {
        clearTimeout(heartbeat.timer);
      }
      pageLeaseTimers.clear();
      const sessions = [
        ...pageSessions.entries(),
        ...unloadingPageSessions.entries(),
      ];
      pageSessions.clear();
      unloadingPageSessions.clear();
      await Promise.all(
        sessions.map(([documentName, sessionId]) =>
          releasePageSession(documentName, sessionId)
        )
      );
    },
    async beforeUnloadDocument({ documentName, document, instance }) {
      if (instance.documents.get(documentName) !== document) {
        throw new Error("Ignoring stale collaboration document unload");
      }
      const sessionId = pageSessions.get(documentName);
      if (sessionId) unloadingPageSessions.set(documentName, sessionId);
    },
    async afterUnloadDocument({ documentName }) {
      const sessionId = unloadingPageSessions.get(documentName);
      unloadingPageSessions.delete(documentName);
      if (!sessionId) return;
      if (pageSessions.get(documentName) === sessionId) {
        pageSessions.delete(documentName);
        cancelPageLeaseHeartbeat(documentName, sessionId);
      }
      await releasePageSession(documentName, sessionId);
    },
    async onLoadDocument({ document, documentName }) {
      const moodboardId = moodboardIdFromCollaborationDocument(documentName);
      if (moodboardId) {
        const stored = await prisma.moodboardCollaborationState.findUnique({
          where: { moodboardId },
          select: { state: true },
        });
        if (!stored) {
          throw new Error("Moodboard collaboration state is unavailable");
        }
        Y.applyUpdate(document, new Uint8Array(stored.state));
        writeMoodboardScene(document, readMoodboardScene(document));
        return document;
      }
      const pageId = pageIdFromCollaborationDocument(documentName);
      if (!pageId) throw new Error("Invalid Page document name");
      const sessionId = randomUUID();
      const opened = await openPageCollaborationSession(pageId, sessionId);
      if (!opened) throw new Error("Page collaboration state is unavailable");
      if (destroyed) {
        await releasePageSession(documentName, sessionId);
        throw new Error("Collaboration server is shutting down");
      }
      pageSessions.set(documentName, sessionId);
      schedulePageLeaseHeartbeat(documentName, pageId, sessionId);
      try {
        const stored = await prisma.pageCollaborationState.findUnique({
          where: { pageId },
          select: { state: true },
        });
        if (!stored) {
          throw new Error("Page collaboration state is unavailable");
        }
        Y.applyUpdate(document, new Uint8Array(stored.state));
        return document;
      } catch (error) {
        if (pageSessions.get(documentName) === sessionId) {
          pageSessions.delete(documentName);
          cancelPageLeaseHeartbeat(documentName, sessionId);
        }
        await releasePageSession(documentName, sessionId);
        throw error;
      }
    },
    async onStoreDocument({ document, documentName, lastContext }) {
      const moodboardId = moodboardIdFromCollaborationDocument(documentName);
      if (moodboardId) {
        const state = Y.encodeStateAsUpdate(document);
        const now = newDate();
        const existing = await prisma.moodboardCollaborationState.findUnique({
          where: { moodboardId },
          select: { lastSnapshotAt: true },
        });
        const shouldSnapshot =
          !existing?.lastSnapshotAt ||
          now.getTime() - existing.lastSnapshotAt.getTime() >=
            MOODBOARD_SNAPSHOT_INTERVAL_MS;
        const scene = shouldSnapshot ? readMoodboardScene(document) : null;
        await prisma.$transaction(async (transaction) => {
          await transaction.moodboardCollaborationState.upsert({
            where: { moodboardId },
            create: {
              moodboardId,
              state: Buffer.from(state),
              ...(shouldSnapshot && { lastSnapshotAt: now }),
            },
            update: {
              state: Buffer.from(state),
              ...(shouldSnapshot && { lastSnapshotAt: now }),
            },
          });
          if (scene) {
            await transaction.moodboardSnapshot.create({
              data: {
                moodboardId,
                scene: scene as Prisma.InputJsonValue,
              },
            });
          }
        });
        return;
      }
      const pageId = pageIdFromCollaborationDocument(documentName);
      if (!pageId) throw new Error("Invalid Page document name");
      const page = await prisma.page.findUnique({
        where: { id: pageId },
        select: { userId: true, documentFormatVersion: true },
      });
      if (!page) return;
      const sessionId = pageSessions.get(documentName);
      if (!sessionId) {
        throw new Error("Page collaboration lease is unavailable");
      }
      const actor =
        lastContext?.resource === "page" ? lastContext.actor : page.userId;
      // A page whose owner is being deleted has no actor to attribute the
      // write to; dropping it is correct, the document is on its way out.
      if (!actor) return;
      const stored = await storePageCollaborationDocument(
        actor,
        pageId,
        sessionId,
        document,
        page.documentFormatVersion === 2 ? 2 : 1
      );
      if (!stored) {
        throw new Error("Page collaboration write access was revoked");
      }
    },
  });
  return collaborationServer;
}
