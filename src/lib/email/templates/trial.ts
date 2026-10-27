import { renderEmail } from "./layout";

export function getTrialEmailTemplate(input: {
  milestone: "day11" | "day14";
  payUrl: string;
}) {
  if (input.milestone === "day11") {
    return renderEmail({
      subject: "Your Pro trial ends in 3 days",
      preheader: "Choose Pro to keep Pro features after the trial.",
      heading: "Your Pro trial ends in 3 days",
      paragraphs: [
        "Your Needt Pro trial ends in 3 days. Choose Pro to keep Pro features after that.",
        "If you do nothing, your account moves to Free and everything you made stays where it is.",
      ],
      button: { label: "Choose Pro", url: input.payUrl },
      kind: "notification",
    });
  }
  return renderEmail({
    subject: "Your Pro trial has ended",
    preheader: "Your data is still here.",
    heading: "Your Pro trial has ended",
    paragraphs: [
      "Your Needt account is now on Free. Your data is still here.",
      "Choose Pro whenever you want the Pro features back.",
    ],
    button: { label: "Choose Pro", url: input.payUrl },
    kind: "notification",
  });
}
