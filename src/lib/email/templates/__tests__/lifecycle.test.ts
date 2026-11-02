import { RULES } from "@/services/email-lifecycle/rules";

import { CATALOG_FOOTER } from "../catalog";
import { containsPlaceholder, renderEmail } from "../layout";
import { getTrialEnding0dTemplate, recapObservation } from "../lifecycle";
import { lifecycleSamples } from "../lifecycle-catalog";

const samples = lifecycleSamples();
const optionalSamples = samples.filter((sample) => sample.kind === "optional");

/** Words in the body: the text above the footer rule, without heading or button. */
function bodyWords(text: string): number {
  const above = text.split("\n--\n")[0] ?? "";
  const lines = above.split("\n").slice(1); // drop the heading
  const body = lines.filter((line) => {
    const trimmed = line.trim();
    return trimmed !== "" && !/^[^:]+: https?:\/\/\S+$/.test(trimmed);
  });
  return body.join(" ").split(/\s+/).filter(Boolean).length;
}

describe("lifecycle templates", () => {
  it("covers every rule of the programme", () => {
    const keys = new Set(samples.map((sample) => sample.key));
    for (const key of [...Object.keys(RULES), "gift", "broadcast"]) {
      expect(keys.has(key)).toBe(true);
    }
  });

  it.each(samples.map((sample) => [sample.key, sample] as const))(
    "%s: no placeholder reaches the reader",
    (_key, sample) => {
      for (const part of [
        sample.email.subject,
        sample.email.html,
        sample.email.text,
      ]) {
        expect(containsPlaceholder(part)).toBe(false);
        expect(part).not.toMatch(/\bundefined\b|\bnull\b|NaN/);
      }
    }
  );

  it.each(samples.map((sample) => [sample.key, sample] as const))(
    "%s: has a plain-text part and at most one button",
    (_key, sample) => {
      expect(sample.email.text.trim().length).toBeGreaterThan(20);
      expect(sample.email.subject.length).toBeGreaterThan(0);
      const buttons = sample.email.html.match(/class="btn-a"/g) ?? [];
      expect(buttons.length).toBeLessThanOrEqual(1);
    }
  );

  it.each(optionalSamples.map((sample) => [sample.key, sample] as const))(
    "%s: carries the unsubscribe link and the operator footer",
    (_key, sample) => {
      expect(sample.email.text).toContain("Unsubscribe: https://");
      expect(sample.email.html).toContain("/api/email/unsubscribe?t=");
      expect(sample.email.text).toContain(CATALOG_FOOTER.name);
      expect(sample.email.text).toContain(CATALOG_FOOTER.address);
    }
  );

  it.each(
    optionalSamples
      .filter((sample) => sample.key !== "broadcast")
      .map((sample) => [sample.key, sample] as const)
  )("%s: the body is 90 words or fewer", (_key, sample) => {
    expect(bodyWords(sample.email.text)).toBeLessThanOrEqual(90);
  });

  it("the gift notice is transactional: no unsubscribe link", () => {
    const gift = samples.find((sample) => sample.key === "gift");
    expect(gift?.kind).toBe("transactional");
    expect(gift?.email.text).not.toContain("Unsubscribe");
  });

  it("names no price in the gift notice", () => {
    const gift = samples.find((sample) => sample.key === "gift");
    expect(gift?.email.text).not.toMatch(/\$\d/);
  });
});

describe("trial ending today", () => {
  const base = {
    name: "Alex",
    appUrl: "https://use.needt.app",
    unsubscribeUrl: "https://use.needt.app/api/email/unsubscribe?t=X",
    footer: CATALOG_FOOTER,
  };

  it("shows the code and the 20% line when a code is set", () => {
    const mail = getTrialEnding0dTemplate({ ...base, promoCode: "SAVE20" });
    expect(mail.text).toContain("SAVE20");
    expect(mail.text).toContain("20% off your first year");
  });

  it.each([null, "", "   "])(
    "falls back to the early-price line for %j",
    (promoCode) => {
      const mail = getTrialEnding0dTemplate({ ...base, promoCode });
      expect(mail.text).toContain("early $7 price");
      expect(mail.text).not.toContain("20%");
      expect(mail.text).not.toMatch(/null|undefined/);
    }
  );
});

describe("recapObservation", () => {
  it("compares only with real numbers", () => {
    expect(
      recapObservation({ tasksCompleted: 24, previousTasksCompleted: 18 })
    ).toBe("That is 6 more than the month before.");
    expect(
      recapObservation({ tasksCompleted: 10, previousTasksCompleted: 18 })
    ).toBe("The month before it was 18.");
    expect(
      recapObservation({ tasksCompleted: 5, previousTasksCompleted: 5 })
    ).toBe("The same as the month before.");
  });

  it.each([
    [null, 5],
    [5, null],
    [5, 0],
  ])("says nothing for %s vs %s", (now, before) => {
    expect(
      recapObservation({ tasksCompleted: now, previousTasksCompleted: before })
    ).toBeNull();
  });
});

describe("renderEmail for optional mail", () => {
  const content = {
    subject: "Hello",
    preheader: "Hi",
    heading: "Hello",
    paragraphs: ["Body."],
    kind: "commercial" as const,
    unsubscribeUrl: "https://use.needt.app/api/email/unsubscribe?t=X",
  };

  it("refuses a placeholder footer", () => {
    expect(() =>
      renderEmail({
        ...content,
        footer: { name: "[OWNER NAME]", address: "[OWNER ADDRESS]" },
      })
    ).toThrow(/operator/);
    expect(() =>
      renderEmail({ ...content, footer: { name: "{{name}}", address: "x" } })
    ).toThrow(/operator/);
  });

  it("refuses to render without an unsubscribe link", () => {
    expect(() =>
      renderEmail({
        ...content,
        unsubscribeUrl: undefined,
        footer: CATALOG_FOOTER,
      })
    ).toThrow(/unsubscribe/);
  });

  it("renders with a real footer", () => {
    const mail = renderEmail({ ...content, footer: CATALOG_FOOTER });
    expect(mail.text).toContain(CATALOG_FOOTER.address);
  });
});
