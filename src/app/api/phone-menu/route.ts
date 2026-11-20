import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import {
  DEFAULT_MENU_TILES,
  MENU_STYLES,
  MENU_TILE_IDS,
  MENU_TILE_MAX,
  MENU_TILE_SIZES,
  menuLayoutPatchSchema,
} from "@/lib/phone-menu/layout";

import {
  getMenuLayout,
  resetMenuLayout,
  updateMenuLayout,
} from "@/services/phone-menu/layout";

const LOG_SOURCE = "PhoneMenuAPI";

/** What a client needs to draw the editor without hard-coding the catalogue. */
const catalogue = {
  tiles: MENU_TILE_IDS,
  sizes: MENU_TILE_SIZES,
  styles: MENU_STYLES,
  max: MENU_TILE_MAX,
  default: DEFAULT_MENU_TILES,
};

function fail(message: string, error: unknown) {
  logger.error(
    message,
    { error: error instanceof Error ? error.message : String(error) },
    LOG_SOURCE
  );
  return NextResponse.json({ error: message }, { status: 500 });
}

/** GET /api/phone-menu: this account's menu (`style`, ordered `tiles`) and the catalogue. */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if (auth.response) return auth.response;
  try {
    return NextResponse.json({
      ...(await getMenuLayout(auth.userId)),
      catalogue,
    });
  } catch (error) {
    return fail("Failed to read the menu", error);
  }
}

/**
 * PUT /api/phone-menu: set `style`, `tiles`, or both. `tiles` replaces the
 * whole ordered list; a tile that is not in the catalogue, a repeat, or more
 * than the maximum is a 400 naming why, and nothing is stored.
 */
export async function PUT(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if (auth.response) return auth.response;
  const body = await request.json().catch(() => null);
  const parsed = menuLayoutPatchSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      {
        error: "invalid_input",
        message: parsed.error.issues.map((i) => i.message).join("; "),
      },
      { status: 400 }
    );
  try {
    return NextResponse.json(await updateMenuLayout(auth.userId, parsed.data));
  } catch (error) {
    return fail("Failed to save the menu", error);
  }
}

/** DELETE /api/phone-menu: back to the default tiles and style. */
export async function DELETE(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if (auth.response) return auth.response;
  try {
    return NextResponse.json(await resetMenuLayout(auth.userId));
  } catch (error) {
    return fail("Failed to reset the menu", error);
  }
}
