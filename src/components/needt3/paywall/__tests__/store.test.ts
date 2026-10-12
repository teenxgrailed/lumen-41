import { closePaywall, openPaywall, usePaywallStore } from "../store";

beforeEach(() => closePaywall());

describe("paywall store", () => {
  it("opens plain on the yearly card", () => {
    openPaywall();
    const s = usePaywallStore.getState();
    expect(s.open).toBe(true);
    expect(s.cycle).toBe("annual");
    expect(s.feature).toBeNull();
  });

  it("opens from a locked feature by name", () => {
    openPaywall("Plan my day");
    expect(usePaywallStore.getState().feature).toBe("Plan my day");
  });

  it("preselects a card and tolerates a bad cycle", () => {
    openPaywall({ cycle: "lifetime" });
    expect(usePaywallStore.getState().cycle).toBe("lifetime");
    openPaywall({ cycle: "weekly" });
    expect(usePaywallStore.getState().cycle).toBe("annual");
  });

  it("closes", () => {
    openPaywall();
    closePaywall();
    expect(usePaywallStore.getState().open).toBe(false);
  });
});
