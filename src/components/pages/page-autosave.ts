import type { JSONContent } from "@tiptap/core";

export type PageSaveState = "saved" | "saving" | "failed" | "offline";
export type PageWriteAuthority =
  | "rest"
  | "collaboration"
  | "collaboration-offline";

export function selectLatestPageRevision(
  current: number | null | undefined,
  candidate: number
) {
  return current === null || current === undefined
    ? candidate
    : Math.max(current, candidate);
}

type PageAutosaveOptions = {
  delayMs?: number;
  /**
   * How long typing must pause before the recovery draft is written to
   * storage (default 250 ms). A draft is a whole-page JSON string written to
   * localStorage, synchronously: doing that on every keystroke is what made
   * long pages lag. It is also written at once when the page is handed to
   * collaboration, on `persistDraftNow()` (the page is going away) and on
   * `dispose()`.
   */
  draftDelayMs?: number;
  isOnline: () => boolean;
  onStateChange: (state: PageSaveState) => void;
  persistDraft: (document: JSONContent) => void;
  removeDraft: () => void;
  save: (document: JSONContent) => Promise<void>;
};

/**
 * A page draft, or a function that reads it. The editor passes a reader so
 * that serialising the whole page (`editor.getJSON()`, O(page)) happens once
 * when the draft is actually written or saved, not on every keystroke.
 */
export type PageDraftSource = JSONContent | (() => JSONContent);

type Pending = {
  read: () => JSONContent;
  revision: number;
  /** The reader's answer, kept so one revision is serialised once. */
  document?: JSONContent;
};

const DRAFT_MAX_WAIT_MS = 2_000;

/** Keeps the latest page draft durable while coalescing editor updates. */
export class PageAutosave {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private draftTimer: ReturnType<typeof setTimeout> | null = null;
  private draftSince: number | null = null;
  private revision = 0;
  private pending: Pending | null = null;
  private authority: PageWriteAuthority = "rest";

  constructor(private readonly options: PageAutosaveOptions) {}

  setWriteAuthority(authority: PageWriteAuthority) {
    this.authority = authority;
    if (authority === "rest") return false;
    const hadPendingWrite = this.pending !== null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (authority === "collaboration") {
      // The recovery draft stays until collaboration acknowledges; make sure
      // the latest edit is in it before the write is handed over.
      this.persistDraftNow();
      this.pending = null;
    }
    return hadPendingWrite;
  }

  schedule(source: PageDraftSource) {
    this.revision += 1;
    this.pending = {
      read: typeof source === "function" ? source : () => source,
      revision: this.revision,
    };
    this.scheduleDraft();
    if (this.authority === "collaboration") {
      this.options.onStateChange("saving");
      return;
    }
    if (this.authority === "collaboration-offline") {
      this.options.onStateChange("offline");
      return;
    }
    this.options.onStateChange("saving");
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(
      () => void this.flush(),
      this.options.delayMs ?? 650
    );
  }

  /** Write the latest unsaved edit to the recovery draft now. */
  persistDraftNow() {
    this.cancelDraft();
    const pending = this.pending;
    if (!pending) return;
    const document = this.documentOf(pending);
    if (document) this.options.persistDraft(document);
  }

  retryWhenOnline() {
    if (this.authority === "rest" && this.pending && this.options.isOnline()) {
      void this.flush();
    }
  }

  hasPendingWrite() {
    return this.pending !== null;
  }

  acknowledgeCollaborationSync(unsyncedChanges: number) {
    if (this.authority !== "collaboration" || unsyncedChanges !== 0) {
      return false;
    }
    this.pending = null;
    this.cancelDraft();
    this.options.removeDraft();
    this.options.onStateChange("saved");
    return true;
  }

  dispose() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    // The page is going away: the draft is what a reload recovers from.
    this.persistDraftNow();
  }

  /** A pause of `draftDelayMs`, but never later than `DRAFT_MAX_WAIT_MS`
   *  after the first unsaved edit, so a long run of typing is still durable. */
  private scheduleDraft() {
    const now = Date.now();
    if (this.draftSince === null) this.draftSince = now;
    if (this.draftTimer) clearTimeout(this.draftTimer);
    const wait = Math.max(
      0,
      Math.min(
        this.options.draftDelayMs ?? 250,
        DRAFT_MAX_WAIT_MS - (now - this.draftSince)
      )
    );
    this.draftTimer = setTimeout(() => this.persistDraftNow(), wait);
  }

  private cancelDraft() {
    if (this.draftTimer) clearTimeout(this.draftTimer);
    this.draftTimer = null;
    this.draftSince = null;
  }

  /**
   * The pending edit as a document. A reader that throws (the editor was
   * destroyed under it) means there is nothing left to read; the draft that
   * was already written stays.
   */
  private documentOf(pending: Pending) {
    if (pending.document) return pending.document;
    try {
      pending.document = pending.read();
    } catch {
      return null;
    }
    return pending.document;
  }

  private collaborationOwnsWrites() {
    return this.authority !== "rest";
  }

  private async flush() {
    if (this.collaborationOwnsWrites()) {
      return;
    }
    const pending = this.pending;
    this.timer = null;
    if (!pending) return;
    if (!this.options.isOnline()) {
      this.persistDraftNow();
      this.options.onStateChange("offline");
      return;
    }
    const document = this.documentOf(pending);
    if (!document) return;

    this.options.onStateChange("saving");
    try {
      await this.options.save(document);
      if (this.revision !== pending.revision) return;
      this.pending = null;
      this.cancelDraft();
      this.options.removeDraft();
      this.options.onStateChange("saved");
    } catch {
      if (this.collaborationOwnsWrites()) return;
      this.options.persistDraft(document);
      this.options.onStateChange(
        this.options.isOnline() ? "failed" : "offline"
      );
    }
  }
}
