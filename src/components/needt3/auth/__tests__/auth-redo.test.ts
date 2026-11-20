import type { IconType } from "react-icons";

import type { AuthProvider } from "../AuthScreen";
import {
  authRedoFromSearch,
  planChoice,
  planFromSearch,
  redoProviders,
} from "../auth-redo";

const icon = (() => null) as unknown as IconType;
const icons = { google: icon, apple: icon, "azure-ad": icon, openai: icon };
const p = (id: string): AuthProvider => ({ id, label: id, icon });

describe("plan choice", () => {
  it("prices come from the one pricing config", () => {
    expect(planChoice("pro-year").price).toBe("$59/year");
    expect(planChoice("pro-month").price).toBe("$7/month");
    expect(planChoice("lifetime").price).toBe("$149 once");
  });

  it("reads the plan from ?plan= or from the billing deep link", () => {
    expect(planFromSearch("?plan=lifetime")?.id).toBe("lifetime");
    expect(
      planFromSearch(
        "?callbackUrl=%2Fsettings%3Fsection%3Dbilling%26checkout%3Dpro-month"
      )?.id
    ).toBe("pro-month");
    expect(planFromSearch("?plan=nope")).toBeNull();
    expect(planFromSearch("")).toBeNull();
  });
});

describe("variant", () => {
  it("is plain B with no plan and no param", () => {
    expect(authRedoFromSearch("")).toMatchObject({
      variant: "b",
      plan: null,
      preview: false,
    });
  });
  it("is A when a plan rode along, and keeps it", () => {
    const s = authRedoFromSearch("?plan=pro-year");
    expect(s.variant).toBe("a");
    expect(s.plan?.id).toBe("pro-year");
    expect(s.preview).toBe(false);
  });
  it("?v=a without a plan shows the yearly plan; ?v=b drops it", () => {
    expect(authRedoFromSearch("?v=a").plan?.id).toBe("pro-year");
    expect(authRedoFromSearch("?v=b&plan=lifetime").plan).toBeNull();
    expect(authRedoFromSearch("?v=b").preview).toBe(true);
  });
});

describe("provider order", () => {
  const opts = { preview: false, chatgpt: "hidden" as const };
  it("is Google, Apple, Microsoft, whatever order they were configured in", () => {
    const { main } = redoProviders(
      [p("azure-ad"), p("github"), p("google")],
      icons,
      opts
    );
    expect(main.map((x) => x.id)).toEqual(["google", "azure-ad"]);
  });
  it("sends the rest behind 'more ways'", () => {
    const { more } = redoProviders([p("google"), p("github")], icons, opts);
    expect(more.map((x) => x.id)).toEqual(["github"]);
  });
  it("review mode draws the unwired three, flagged visual-only", () => {
    const { main } = redoProviders([p("google")], icons, {
      ...opts,
      preview: true,
    });
    expect(main.map((x) => [x.id, !!x.visualOnly])).toEqual([
      ["google", false],
      ["apple", true],
      ["azure-ad", true],
    ]);
  });
  it("the ChatGPT slot is hidden unless asked, then disabled", () => {
    expect(
      redoProviders([p("google")], icons, opts).main.some(
        (x) => x.id === "openai"
      )
    ).toBe(false);
    const soon = redoProviders([p("google")], icons, {
      ...opts,
      chatgpt: "soon",
    }).main.find((x) => x.id === "openai");
    expect(soon).toMatchObject({ soon: true, visualOnly: true });
  });
  it("with none of the three, the rest show directly", () => {
    const { main, more } = redoProviders([p("github")], icons, opts);
    expect(main.map((x) => x.id)).toEqual(["github"]);
    expect(more).toEqual([]);
  });
});
