"use client";

import { Component, type ReactNode } from "react";

import * as Sentry from "@sentry/nextjs";

import { logger } from "@/lib/logger";

const LOG_SOURCE = "TrashRowGuard";

/**
 * One Trash row that cannot be drawn (a field the server left out, an item
 * whose project or parent is gone) is skipped and logged instead of taking
 * the whole screen down: the rest stay listed, restorable and deletable.
 */
export class TrashRowGuard extends Component<
  { kind: string; id: string; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    Sentry.captureException(error, {
      tags: { route: "trash-row", kind: this.props.kind },
    });
    void logger.error(
      "A Trash row could not be drawn and was skipped",
      {
        kind: this.props.kind,
        id: this.props.id,
        name: error.name,
        error: error.message,
      },
      LOG_SOURCE
    );
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
