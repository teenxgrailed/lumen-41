import { PROJECT_SWATCHES } from "@/components/needt3/work/model";

import { colourName } from "../colour-names";

describe("colour names", () => {
  it("gives every project swatch a human name, never its token", () => {
    const names = PROJECT_SWATCHES.map(([token]) => colourName(token));
    expect(names).toEqual(["Blue", "Amber", "Green", "Red", "Grey"]);
    for (const [token] of PROJECT_SWATCHES)
      expect(colourName(token)).not.toBe(token);
  });

  it("names the accent swatch after the accent the person picked", () => {
    expect(colourName("accent", "pink")).toBe("Pink");
    expect(colourName("accent", "graphite")).toBe("Graphite");
  });

  it("passes an unknown name through", () => {
    expect(colourName("Current")).toBe("Current");
  });
});
