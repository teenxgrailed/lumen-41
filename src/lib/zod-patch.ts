import { z } from "zod";

/**
 * `schema.partial()` for PATCH bodies. Zod 4 applies a field's `.default()`
 * when a partial schema omits the key, so a plain `.partial()` would reset
 * defaulted fields on every update. This keeps the zod 3 behaviour: an omitted
 * key stays omitted.
 */
export function partialWithoutDefaults<T extends z.ZodObject>(schema: T) {
  const shape: Record<string, z.ZodType> = {};
  for (const [key, field] of Object.entries(schema.shape)) {
    const bare =
      field instanceof z.ZodDefault
        ? (field.removeDefault() as z.ZodType)
        : field;
    shape[key] = (bare as z.ZodType).optional();
  }
  return schema.extend(shape) as unknown as z.ZodObject<{
    [K in keyof T["shape"]]: z.ZodOptional<
      T["shape"][K] extends z.ZodDefault<infer I> ? I : T["shape"][K]
    >;
  }>;
}
