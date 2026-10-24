import { RestMachine } from "../sky-rest";

describe("RestMachine with a longer idle time (onboarding: 2 min)", () => {
  it("stays awake until the asked-for time has passed without input", () => {
    let t = 0;
    const m = new RestMachine(() => t, 120_000);
    t = 12_000;
    expect(m.check()).not.toBeNull();
    expect(m.idle).toBe(false);
    t = 119_000;
    expect(m.check()).not.toBeNull();
    expect(m.idle).toBe(false);
    t = 121_000;
    expect(m.check()).toBeNull();
    expect(m.idle).toBe(true);
  });

  it("input wakes it again", () => {
    let t = 0;
    const m = new RestMachine(() => t, 120_000);
    t = 125_000;
    m.check();
    expect(m.idle).toBe(true);
    m.touch();
    expect(m.idle).toBe(false);
  });
});
