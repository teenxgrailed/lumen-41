import { energyDay } from "@/components/needt3/home/energy-day";

import {
  DEFAULT_HIGH_ENERGY,
  energyFromKey,
  energyKey,
  energyOptions,
  energyOrder,
  highEnergyHours,
  inHighEnergy,
} from "../energy";
import { taskFromApi, taskPatchToApi } from "../map";

const t = (id: string, energy?: "high" | "medium" | "low") =>
  ({ id, energy }) as { id: string; energy?: "high" | "medium" | "low" };
const ids = (l: { id: string }[]) => l.map((x) => x.id);

describe("highEnergyHours", () => {
  it("is the morning until the person says otherwise", () => {
    expect(highEnergyHours(null)).toEqual(DEFAULT_HIGH_ENERGY);
    expect(
      highEnergyHours({ highEnergyStart: null, highEnergyEnd: null })
    ).toEqual({ start: 9, end: 12 });
  });
  it("uses saved hours, and ignores an unusable pair", () => {
    expect(highEnergyHours({ highEnergyStart: 14, highEnergyEnd: 17 })).toEqual(
      {
        start: 14,
        end: 17,
      }
    );
    expect(highEnergyHours({ highEnergyStart: 17, highEnergyEnd: 14 })).toEqual(
      DEFAULT_HIGH_ENERGY
    );
  });
  it("end is exclusive", () => {
    expect(inHighEnergy(11.99, { start: 9, end: 12 })).toBe(true);
    expect(inHighEnergy(12, { start: 9, end: 12 })).toBe(false);
  });
});

describe("energyOrder", () => {
  const list = [t("l", "low"), t("m"), t("h", "high"), t("l2", "low")];
  const hours = { start: 9, end: 12 };

  it("puts heavy first in the high-energy hours and before them", () => {
    expect(ids(energyOrder(list, 10, hours))).toEqual(["h", "m", "l", "l2"]);
    expect(ids(energyOrder(list, 7, hours))).toEqual(["h", "m", "l", "l2"]);
  });
  it("puts light first after them, so heavy work waits", () => {
    expect(ids(energyOrder(list, 15, hours))).toEqual(["l", "l2", "m", "h"]);
  });
  it("is stable and leaves the list alone", () => {
    const same = [t("a"), t("b"), t("c")];
    expect(ids(energyOrder(same, 15, hours))).toEqual(["a", "b", "c"]);
    expect(ids(list)).toEqual(["l", "m", "h", "l2"]);
  });
});

describe("energyDay", () => {
  it("keeps timed tasks where they are and orders the rest", () => {
    const timed = {
      id: "t",
      scheduledStart: "2026-09-01T10:00",
      energy: "low",
    };
    const day = [
      { id: "a", scheduledStart: null, energy: "low" },
      timed,
      { id: "b", scheduledStart: null, energy: "high" },
    ] as never[];
    expect(
      ids(energyDay(day, "2026-09-01", 9.5, { start: 9, end: 12 }))
    ).toEqual(["t", "b", "a"]);
  });
});

describe("the Your day choice", () => {
  it("round-trips a preset and shows a saved custom pair", () => {
    expect(energyFromKey("13-16")).toEqual({
      highEnergyStart: 13,
      highEnergyEnd: 16,
    });
    expect(energyFromKey("16-13")).toBeNull();
    expect(energyFromKey("x")).toBeNull();
    const custom = { start: 8, end: 11 };
    expect(energyOptions(custom).some(([k]) => k === energyKey(custom))).toBe(
      true
    );
    expect(energyOptions(DEFAULT_HIGH_ENERGY)).toHaveLength(5);
  });
});

describe("a task's energy over the API", () => {
  const row = { id: "x", title: "T", status: "todo" };
  it("reads energyRequired", () => {
    expect(taskFromApi({ ...row, energyRequired: "HIGH" }, "UTC").energy).toBe(
      "high"
    );
    expect(taskFromApi({ ...row, energyRequired: "LOW" }, "UTC").energy).toBe(
      "low"
    );
    expect(taskFromApi(row, "UTC").energy).toBe("medium");
  });
  it("writes it back in the server's words", () => {
    expect(taskPatchToApi({ energy: "high" }, "UTC")).toEqual({
      energyRequired: "HIGH",
    });
  });
});
