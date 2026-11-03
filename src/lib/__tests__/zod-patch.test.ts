import { z } from "zod";

import { partialWithoutDefaults } from "@/lib/zod-patch";

describe("partialWithoutDefaults", () => {
  const schema = z.object({
    title: z.string().min(1),
    active: z.boolean().default(true),
    tags: z.array(z.string()).default([]),
  });

  it("does not apply defaults to omitted keys", () => {
    expect(partialWithoutDefaults(schema).parse({})).toEqual({});
  });

  it("keeps validation on supplied keys", () => {
    const patch = partialWithoutDefaults(schema);
    expect(patch.parse({ active: false })).toEqual({ active: false });
    expect(patch.safeParse({ title: "" }).success).toBe(false);
  });
});
