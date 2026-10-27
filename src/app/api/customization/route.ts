import { NextRequest, NextResponse } from "next/server";

import { Prisma } from "@prisma/client";

import { authenticateRequest } from "@/lib/auth/api-auth";
import {
  DEFAULT_CUSTOMIZATION,
  ensureUserCustomization,
} from "@/lib/customization-db";
import { parseDesignTokens } from "@/lib/design-tokens";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "customization-api";

function cleanHex(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed : fallback;
}

function cleanChoice(value: unknown, allowed: string[], fallback: string) {
  return typeof value === "string" && allowed.includes(value)
    ? value
    : fallback;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) return auth.response;

    const customization = await ensureUserCustomization(auth.userId);

    return NextResponse.json(customization);
  } catch (error) {
    logger.error(
      "Failed to fetch customization settings",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to fetch customization settings" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) return auth.response;

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const data = {
      ...("accentColor" in body && {
        accentColor: cleanHex(
          body.accentColor,
          DEFAULT_CUSTOMIZATION.accentColor
        ),
      }),
      ...("backgroundTint" in body && {
        backgroundTint: cleanHex(
          body.backgroundTint,
          DEFAULT_CUSTOMIZATION.backgroundTint
        ),
      }),
      ...("density" in body && {
        density: cleanChoice(
          body.density,
          ["compact", "comfortable", "spacious"],
          "comfortable"
        ),
      }),
      ...("sidebarWidth" in body && {
        sidebarWidth:
          Number.isFinite(Number(body.sidebarWidth)) &&
          Number(body.sidebarWidth) >= 220 &&
          Number(body.sidebarWidth) <= 320
            ? Math.round(Number(body.sidebarWidth))
            : DEFAULT_CUSTOMIZATION.sidebarWidth,
      }),
      ...("radius" in body && {
        radius:
          Number.isFinite(Number(body.radius)) &&
          Number(body.radius) >= 4 &&
          Number(body.radius) <= 16
            ? Math.round(Number(body.radius))
            : DEFAULT_CUSTOMIZATION.radius,
      }),
      ...("fontFamily" in body && {
        fontFamily: cleanChoice(
          body.fontFamily,
          ["system", "rounded", "mono"],
          "system"
        ),
      }),
      ...("eventChipStyle" in body && {
        eventChipStyle: cleanChoice(
          body.eventChipStyle,
          ["flat", "outlined", "filled"],
          "flat"
        ),
      }),
      ...("animationsEnabled" in body && {
        animationsEnabled: body.animationsEnabled !== false,
      }),
    };

    if ("designTokens" in body) {
      if (body.designTokens === null) {
        Object.assign(data, { designTokens: Prisma.DbNull });
      } else {
        const designTokens = parseDesignTokens(body.designTokens);
        if (!designTokens) {
          return NextResponse.json(
            { error: "Invalid design token object" },
            { status: 400 }
          );
        }
        Object.assign(data, { designTokens });
      }
    }

    await ensureUserCustomization(auth.userId);
    const customization = await prisma.userCustomization.update({
      where: { userId: auth.userId },
      data,
    });

    return NextResponse.json(customization);
  } catch (error) {
    logger.error(
      "Failed to update customization settings",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to update customization settings" },
      { status: 500 }
    );
  }
}
