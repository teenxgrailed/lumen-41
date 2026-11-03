import { z } from "zod";

type JsonSchema = Record<string, unknown>;

/**
 * Describes an op's input for GET /api/connect/ops. Covers the zod subset the
 * ops use; anything else is reported as an open schema rather than guessed.
 */
export function zodToJsonSchema(schema: z.ZodType): JsonSchema {
  const out = convert(schema);
  return schema.description && !("description" in out)
    ? { ...out, description: schema.description }
    : out;
}

/** The slice of a zod 4 check definition this converter reads. */
type CheckDef = {
  check: string;
  format?: string;
  minimum?: number | bigint;
  maximum?: number | bigint;
  value?: number | bigint;
  pattern?: RegExp;
};

function checkDefs(schema: z.ZodType): CheckDef[] {
  const checks = (schema.def as { checks?: Array<{ _zod: { def: CheckDef } }> })
    .checks;
  return (checks ?? []).map((check) => check._zod.def);
}

function convert(schema: z.ZodType): JsonSchema {
  const def = schema.def as { type: string };
  switch (def.type) {
    case "object": {
      const object = schema as z.ZodObject<z.ZodRawShape>;
      const properties: Record<string, JsonSchema> = {};
      const required: string[] = [];
      for (const [key, value] of Object.entries(object.shape)) {
        const field = value as z.ZodType;
        properties[key] = zodToJsonSchema(field);
        if (!field.isOptional()) required.push(key);
      }
      const catchall = (object.def as { catchall?: { def: { type: string } } })
        .catchall;
      return {
        type: "object",
        properties,
        ...(required.length ? { required } : {}),
        // zod 4 spells `.strict()` as a `never` catchall.
        additionalProperties: catchall?.def.type === "never" ? false : true,
      };
    }
    case "string": {
      const out: JsonSchema = { type: "string" };
      for (const check of checkDefs(schema)) {
        if (check.check === "min_length") out.minLength = check.minimum;
        if (check.check === "max_length") out.maxLength = check.maximum;
        if (check.check === "string_format" && check.format === "regex")
          out.pattern = check.pattern?.source;
        if (check.check === "string_format" && check.format === "datetime")
          out.format = "date-time";
      }
      return out;
    }
    case "number": {
      const out: JsonSchema = { type: "number" };
      for (const check of checkDefs(schema)) {
        if (check.check === "number_format" && check.format === "safeint")
          out.type = "integer";
        if (check.check === "greater_than") out.minimum = check.value;
        if (check.check === "less_than") out.maximum = check.value;
      }
      return out;
    }
    case "boolean":
      return { type: "boolean" };
    case "enum":
      return {
        type: "string",
        enum: [...((schema as z.ZodEnum).options as string[])],
      };
    case "array": {
      const array = schema as z.ZodArray<z.ZodType>;
      const max = checkDefs(schema).find((c) => c.check === "max_length");
      return {
        type: "array",
        items: zodToJsonSchema(array.element),
        ...(max ? { maxItems: max.maximum } : {}),
      };
    }
    case "optional":
      return zodToJsonSchema((schema as z.ZodOptional).unwrap() as z.ZodType);
    case "nullable": {
      const inner = zodToJsonSchema(
        (schema as z.ZodNullable).unwrap() as z.ZodType
      );
      return { anyOf: [inner, { type: "null" }] };
    }
    case "default": {
      const wrapped = schema as z.ZodDefault;
      return {
        ...zodToJsonSchema(wrapped.def.innerType as z.ZodType),
        default: wrapped.def.defaultValue,
      };
    }
    case "pipe": {
      // `.transform()` is pipe(inner, transform); `z.preprocess()` is
      // pipe(transform, inner). Both describe the inner schema, as before.
      const pipe = schema as z.ZodPipe;
      const from = pipe.def.in as z.ZodType;
      return zodToJsonSchema(
        from.def.type === "transform" ? (pipe.def.out as z.ZodType) : from
      );
    }
    case "record":
      return {
        type: "object",
        additionalProperties: zodToJsonSchema(
          (schema as z.ZodRecord).valueType as z.ZodType
        ),
      };
    default:
      return {};
  }
}
