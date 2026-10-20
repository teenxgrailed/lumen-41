import { NextRequest, NextResponse } from "next/server";

import { searchCities } from "@/services/weather/open-meteo";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";

const LOG_SOURCE = "WeatherCitiesAPI";
const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" } as const;

/**
 * GET /api/weather/cities?q=zur -> { cities: CityPlace[] }
 *
 * Type-ahead for Settings -> General -> City. Open-Meteo geocoding runs on
 * the server; the browser never talks to it, and only the typed query leaves.
 * Under two characters answers an empty list; a failing service does too (the
 * picker then says suggestions are unavailable).
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const q = request.nextUrl.searchParams.get("q") ?? "";
  try {
    return NextResponse.json(
      { cities: await searchCities(q) },
      { headers: NO_STORE }
    );
  } catch (error) {
    logger.warn(
      "City search failed",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "City search is unavailable.", cities: [] },
      { status: 502, headers: NO_STORE }
    );
  }
}
