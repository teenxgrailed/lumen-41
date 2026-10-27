import {
  isBogusActionId,
  isStaleDeploymentMessage,
  staleDeploymentReason,
} from "../stale-deployment";

describe("stale deployment detection", () => {
  it("recognises the errors a pre-deploy tab produces", () => {
    expect(
      isStaleDeploymentMessage(
        "Failed to find Server Action. This request might be from an older or newer deployment."
      )
    ).toBe(true);
    expect(
      staleDeploymentReason(
        new Error("An unexpected response was received from the server.")
      )
    ).toBe(true);
    expect(isStaleDeploymentMessage("Network down")).toBe(false);
    expect(staleDeploymentReason(undefined)).toBe(false);
  });

  it("refuses a build SHA sent as an action id but not a real id", () => {
    const sha = "871855e0123456789abcdef0123456789abcdef0";
    expect(isBogusActionId(sha)).toBe(true);
    expect(isBogusActionId(`7f${sha}`)).toBe(false);
    expect(isBogusActionId(null)).toBe(false);
  });
});
