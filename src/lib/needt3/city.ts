/**
 * The city a person picked for the weather line (Settings, General). Stored in
 * `UserSettings.prefs.cityPlace` next to the readable `prefs.city`, so the
 * forecast uses the exact coordinates and never has to guess which
 * "Springfield" was meant. Shared by the client picker and the server routes.
 */

export interface CityPlace {
  name: string;
  /** Region / state / canton, when the geocoder knows it. */
  admin1: string | null;
  country: string | null;
  /** ISO 3166-1 alpha-2, upper case. */
  countryCode: string | null;
  latitude: number;
  longitude: number;
}

const text = (v: unknown, max: number) =>
  typeof v === "string" && v.trim()
    ? v.replace(/\s+/g, " ").trim().slice(0, max)
    : null;

const coord = (v: unknown, limit: number) =>
  typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= limit
    ? v
    : null;

/** A stored or received place, or null when it is not a usable one. */
export function parseCityPlace(raw: unknown): CityPlace | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const name = text(r.name, 80);
  const latitude = coord(r.latitude, 90);
  const longitude = coord(r.longitude, 180);
  if (!name || latitude == null || longitude == null) return null;
  const code = text(r.countryCode, 2);
  return {
    name,
    admin1: text(r.admin1, 80),
    country: text(r.country, 80),
    countryCode: code && /^[A-Za-z]{2}$/.test(code) ? code.toUpperCase() : null,
    latitude,
    longitude,
  };
}

/** "Zürich, Switzerland": what the field shows once a city is chosen. */
export function cityLabel(place: CityPlace): string {
  return place.country ? `${place.name}, ${place.country}` : place.name;
}

/** The second line of a suggestion: "Zurich, Switzerland". */
export function citySubline(place: CityPlace): string {
  return [place.admin1, place.country]
    .filter((p): p is string => !!p && p !== place.name)
    .join(", ");
}
