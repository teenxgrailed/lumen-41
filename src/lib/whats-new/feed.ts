import { readFile } from "node:fs/promises";
import path from "node:path";

import { logger } from "@/lib/logger";

import { EMPTY_FEED, type WhatsNewFeed, parseFeed } from "./compile";

const LOG_SOURCE = "WhatsNewFeed";

let cached: Promise<WhatsNewFeed> | null = null;

/**
 * The compiled feed (`scripts/whats-new.ts` writes it before every build and
 * dev start). Read once per server process; a missing file is an empty feed.
 */
export function loadWhatsNewFeed(): Promise<WhatsNewFeed> {
  if (!cached) {
    cached = readFile(
      path.join(process.cwd(), "public", "whats-new.json"),
      "utf8"
    )
      .then((text) => parseFeed(JSON.parse(text)))
      .catch((error: unknown) => {
        logger.warn(
          "What's new feed is missing or unreadable",
          { error: error instanceof Error ? error.message : String(error) },
          LOG_SOURCE
        );
        return EMPTY_FEED;
      });
  }
  return cached;
}

/** Tests only. */
export function resetWhatsNewFeedCache() {
  cached = null;
}
