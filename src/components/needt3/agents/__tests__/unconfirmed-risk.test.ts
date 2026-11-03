import { hasUnconfirmedRisk, mentionsRiskyWork } from "../unconfirmed-risk";

describe("no confirmation tag", () => {
  it("matches whole risky words and their usual endings", () => {
    for (const text of [
      "Send the invoice",
      "it was sent",
      "Publish the video",
      "Posted to Instagram",
      "delete old drafts",
      "Payment made",
      "PAID",
    ]) {
      expect(mentionsRiskyWork(text)).toBe(true);
    }
  });

  it("does not match look-alikes", () => {
    for (const text of [
      "postpone the call",
      "display the chart",
      "payload ready",
      "sender field",
      "Summarize the notes",
    ]) {
      expect(mentionsRiskyWork(text)).toBe(false);
    }
  });

  it("shows only when no risk was declared", () => {
    const base = { doneCriteria: "Post it on X", result: null };
    expect(hasUnconfirmedRisk({ ...base, risks: [] })).toBe(true);
    expect(hasUnconfirmedRisk({ ...base, risks: ["publish"] })).toBe(false);
  });

  it("reads the result and the checklist too", () => {
    expect(
      hasUnconfirmedRisk({
        risks: [],
        doneCriteria: "Tidy up",
        result: { summary: "Deleted 3 files" },
      })
    ).toBe(true);
    expect(
      hasUnconfirmedRisk({
        risks: [],
        doneCriteria: "",
        criteria: [{ text: "Email sent" }],
      })
    ).toBe(true);
    expect(hasUnconfirmedRisk({ risks: [], doneCriteria: "Read it" })).toBe(
      false
    );
  });
});
