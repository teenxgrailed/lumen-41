import { getIntegrationCatalog } from "@/services/integrations/catalog";

import { CALS } from "../../auth/onboarding-data";
import { MAIL_ENTRIES } from "../../connections/derive";
import { BRAND_ART } from "../data";
import {
  BRAND_IDS,
  brandIdFor,
  brandIdForConnection,
  hasBrandIcon,
} from "../ids";

describe("brand ids", () => {
  it("knows every drawn mark and the two drawn in code", () => {
    for (const id of Object.keys(BRAND_ART))
      expect(hasBrandIcon(id)).toBe(true);
    expect(hasBrandIcon("ical")).toBe(true);
    expect(hasBrandIcon("needt")).toBe(true);
    expect(BRAND_IDS).toHaveLength(Object.keys(BRAND_ART).length + 2);
  });

  it("does not take inherited object keys or empty values for a mark", () => {
    for (const bad of ["", null, undefined, "constructor", "toString", "nope"])
      expect(hasBrandIcon(bad)).toBe(false);
    expect(brandIdFor("constructor")).toBeNull();
    expect(brandIdFor("__proto__")).toBeNull();
  });

  it("maps our provider and toolkit ids to one mark each", () => {
    expect(brandIdFor("google-calendar")).toBe("gcal");
    expect(brandIdFor("outlook-calendar")).toBe("ocal");
    expect(brandIdFor("icloud-calendar")).toBe("ical");
    expect(brandIdFor("needt-api")).toBe("needt");
    expect(brandIdFor("outlook-mail")).toBe("outlook");
    expect(brandIdFor("googlesheets")).toBe("gsheets");
    expect(brandIdFor("googledrive")).toBe("gdrive");
    expect(brandIdFor("microsoftteams")).toBe("teams");
    expect(brandIdFor("azure-ad")).toBe("microsoft");
    expect(brandIdFor("caldav")).toBe("ical");
    expect(brandIdFor("Notion")).toBe("notion");
    expect(brandIdFor(null)).toBeNull();
    expect(brandIdFor("a-toolkit-we-have-not-drawn")).toBeNull();
  });

  it("picks the app by kind: Google calendar is not Gmail", () => {
    const at = (kind: "calendar" | "mail" | "integration", provider: string) =>
      brandIdForConnection({ kind, provider });
    expect(at("calendar", "google")).toBe("gcal");
    expect(at("mail", "google")).toBe("gmail");
    expect(at("mail", "GMAIL")).toBe("gmail");
    expect(at("calendar", "outlook")).toBe("ocal");
    expect(at("mail", "OUTLOOK")).toBe("outlook");
    expect(at("calendar", "caldav")).toBe("ical");
    expect(at("integration", "notion")).toBe("notion");
    expect(at("mail", "IMAP")).toBeNull();
  });

  it("gives every provider the Connections screen can list a real mark", async () => {
    const catalog = await getIntegrationCatalog();
    expect(catalog.length).toBeGreaterThan(10);
    const missing = [...catalog, ...MAIL_ENTRIES]
      .map((e) => e.slug)
      .filter((slug) => brandIdFor(slug) === null);
    expect(missing).toEqual([]);
  });

  it("gives every onboarding calendar its own calendar mark", () => {
    const ids = CALS.map((c) =>
      brandIdForConnection({ kind: "calendar", provider: c.provider })
    );
    expect(ids).toEqual(["gcal", "ical", "ocal"]);
  });
});
