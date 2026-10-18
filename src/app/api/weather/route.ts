import { NextRequest, NextResponse } from "next/server";

import { cleanCity, weatherFor } from "@/services/weather/open-meteo";

import { routeErrorResponse } from "@/lib/api/route-error";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "WeatherAPI";
const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" } as const;

/**
 * GET /api/weather -> { weather } | { weather: null }
 *
 * Today's weather for the "City" saved in Settings (General), from Open-Meteo.
 * With no city saved, nothing is asked of anyone and `weather` is null. Only
 * the city name is sent onward; no device location is read or sent.
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  try {
    const row = await prisma.userSettings.findUnique({
      where: { userId: auth.userId },
      select: { prefs: true },
    });
    const prefs =
      row?.prefs && typeof row.prefs === "object" && !Array.isArray(row.prefs)
        ? (row.prefs as Record<string, unknown>)
        : {};
    const city = cleanCity(prefs.city);
    if (!city)
      return NextResponse.json({ weather: null }, { headers: NO_STORE });
    return NextResponse.json(
      { weather: await weatherFor(city) },
      { headers: NO_STORE }
    );
  } catch (error) {
    return routeErrorResponse(
      error,
      "Failed to load the weather",
      LOG_SOURCE,
      "Could not load the weather."
    );
  }
}
