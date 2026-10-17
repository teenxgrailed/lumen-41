"use client";

import { useEffect, useState } from "react";

import ImageExtension from "@tiptap/extension-image";
import LinkExtension from "@tiptap/extension-link";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { FileText } from "lucide-react";

import { BlockIdentity } from "@/components/documents/BlockIdentity";
import { PageBlockNode } from "@/components/pages/PageBlockNode";
import { pageContainerBlocks } from "@/components/pages/blocks";
import { documentFromPageBlocks } from "@/components/pages/page-document";
import type { PageBlock } from "@/components/pages/page-types";

type PublishedPage = {
  title: string;
  icon: string | null;
  coverUrl: string | null;
  updatedAt: string;
  blocks: PageBlock[];
};

type UnavailableReason = "missing" | "revoked" | "error";

class PublicPageLoadError extends Error {
  constructor(readonly reason: UnavailableReason) {
    super(reason);
  }
}

function unavailableReasonForStatus(status: number): UnavailableReason {
  if (status === 410) return "revoked";
  if (status === 404) return "missing";
  return "error";
}

function PublicPageUnavailable({ reason }: { reason: UnavailableReason }) {
  const copy =
    reason === "revoked"
      ? {
          title: "This Page is no longer available",
          description: "The owner unpublished it or replaced the public link.",
        }
      : reason === "missing"
        ? {
            title: "Page not found",
            description: "This public link is invalid or no longer exists.",
          }
        : {
            title: "We couldn't load this Page",
            description: "Check your connection and refresh to try again.",
          };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[var(--surface-canvas)] px-6 text-[var(--text-primary)]">
      <div className="max-w-md text-center">
        <FileText className="mx-auto mb-4 h-9 w-9 text-[var(--text-muted)]" />
        <h1 className="text-xl font-semibold">{copy.title}</h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          {copy.description}
        </p>
      </div>
    </main>
  );
}

export function PublicPageView({ token }: { token: string }) {
  const [page, setPage] = useState<PublishedPage | null>(null);
  const [unavailableReason, setUnavailableReason] =
    useState<UnavailableReason | null>(null);
  const editor = useEditor({
    immediatelyRender: false,
    editable: false,
    editorProps: {
      attributes: {
        class: "needt-page-editor min-h-48 outline-none",
        "aria-label": "Published Page document",
      },
    },
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: false,
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      ImageExtension.configure({ allowBase64: false }),
      LinkExtension.configure({
        autolink: true,
        defaultProtocol: "https",
        openOnClick: true,
      }),
      TableKit.configure({ table: { resizable: false } }),
      BlockIdentity,
      ...pageContainerBlocks,
      PageBlockNode,
    ],
  });

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/public/pages/${encodeURIComponent(token)}`, {
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new PublicPageLoadError(
            unavailableReasonForStatus(response.status)
          );
        }
        return response.json() as Promise<{ page: PublishedPage }>;
      })
      .then(({ page: published }) => {
        if (cancelled) return;
        setPage(published);
        editor?.commands.setContent(
          documentFromPageBlocks(published.blocks) ?? {
            type: "doc",
            content: [],
          },
          { emitUpdate: false }
        );
      })
      .catch((error) => {
        if (cancelled) return;
        setUnavailableReason(
          error instanceof PublicPageLoadError ? error.reason : "error"
        );
      });
    return () => {
      cancelled = true;
    };
  }, [editor, token]);

  useEffect(() => {
    if (unavailableReason) return;
    const source = new EventSource(
      `/api/public/pages/${encodeURIComponent(token)}/events`
    );
    source.addEventListener("revoked", () => {
      setUnavailableReason("revoked");
      setPage(null);
      source.close();
    });
    return () => source.close();
  }, [token, unavailableReason]);

  if (unavailableReason)
    return <PublicPageUnavailable reason={unavailableReason} />;

  if (!page) {
    return (
      <main className="min-h-dvh bg-[var(--surface-canvas)] px-6 py-16">
        <div className="mx-auto max-w-3xl animate-pulse">
          <div className="mb-8 h-10 w-2/3 rounded bg-[var(--surface-raised)]" />
          <div className="h-72 rounded bg-[var(--surface-raised)]" />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-[var(--surface-canvas)] text-[var(--text-primary)]">
      {/* //todo: a drawn cover ("art:<theme>") is not drawn on the public page. */}
      {page.coverUrl && !page.coverUrl.startsWith("art:") && (
        <div
          className="h-40 w-full bg-cover bg-center sm:h-56"
          style={{ backgroundImage: `url(${page.coverUrl})` }}
          role="img"
          aria-label="Page cover"
        />
      )}
      <article className="mx-auto max-w-3xl px-6 pb-24 pt-10 sm:px-10 sm:pt-14">
        <div className="mb-8">
          {page.icon && <div className="mb-3 text-4xl">{page.icon}</div>}
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            {page.title}
          </h1>
          <p className="mt-3 text-xs text-[var(--text-muted)]">
            Published with Needt · read only
          </p>
        </div>
        <EditorContent editor={editor} />
      </article>
    </main>
  );
}
