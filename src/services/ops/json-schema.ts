import { z } from "zod";

type JsonSchema = Record<string, unknown>;

/**
 * Describes an op's input for GET /api/connect/ops. Covers the zod subset the
 * ops use; anything else is reported as an open schema rather than guessed.
 */
export function zodToJsonSchema(schema: z.ZodTypeAny): JsonSchema {
  const out = convert(schema);
  return schema.description && !("description" in out)
    ? { ...out, description: schema.description }
    : out;
}

function convert(schema: z.ZodTypeAny): JsonSchema {
  const def = schema._def as { typeName: z.ZodFirstPartyTypeKind };
  switch (def.typeName) {
    case z.ZodFirstPartyTypeKind.ZodObject: {
      const object = schema as z.ZodObject<z.ZodRawShape>;
      const properties: Record<string, JsonSchema> = {};
      const required: string[] = [];
      for (const [key, value] of Object.entries(object.shape)) {
        const field = value as z.ZodTypeAny;
        properties[key] = zodToJsonSchema(field);
        if (!field.isOptional()) required.push(key);
      }
      return {
        type: "object",
        properties,
        ...(required.length ? { required } : {}),
        additionalProperties:
          object._def.unknownKeys === "strict" ? false : true,
      };
    }
    case z.ZodFirstPartyTypeKind.ZodString: {
      const checks = (schema as z.ZodString)._def.checks;
      const out: JsonSchema = { type: "string" };
      for (const check of checks) {
        if (check.kind === "min") out.minLength = check.value;
        if (check.kind === "max") out.maxLength = check.value;
        if (check.kind === "regex") out.pattern = check.regex.source;
        if (check.kind === "datetime") out.format = "date-time";
      }
      return out;
    }
    case z.ZodFirstPartyTypeKind.ZodNumber: {
      const checks = (schema as z.ZodNumber)._def.checks;
      const out: JsonSchema = { type: "number" };
      for (const check of checks) {
        if (check.kind === "int") out.type = "integer";
        if (check.kind === "min") out.minimum = check.value;
        if (check.kind === "max") out.maximum = check.value;
      }
      return out;
    }
    case z.ZodFirstPartyTypeKind.ZodBoolean:
      return { type: "boolean" };
    case z.ZodFirstPartyTypeKind.ZodEnum:
      return {
        type: "string",
        enum: [...(schema as z.ZodEnum<[string, ...string[]]>).options],
      };
    case z.ZodFirstPartyTypeKind.ZodArray: {
      const array = schema as z.ZodArray<z.ZodTypeAny>;
      return {
        type: "array",
        items: zodToJsonSchema(array.element),
        ...(array._def.maxLength
          ? { maxItems: array._def.maxLength.value }
          : {}),
      };
    }
    case z.ZodFirstPartyTypeKind.ZodOptional:
      return zodToJsonSchema((schema as z.ZodOptional<z.ZodTypeAny>).unwrap());
    case z.ZodFirstPartyTypeKind.ZodNullable: {
      const inner = zodToJsonSchema(
        (schema as z.ZodNullable<z.ZodTypeAny>).unwrap()
      );
      return { anyOf: [inner, { type: "null" }] };
    }
    case z.ZodFirstPartyTypeKind.ZodDefault: {
      const wrapped = schema as z.ZodDefault<z.ZodTypeAny>;
      return {
        ...zodToJsonSchema(wrapped._def.innerType),
        default: wrapped._def.defaultValue(),
      };
    }
    case z.ZodFirstPartyTypeKind.ZodEffects:
      return zodToJsonSchema(
        (schema as z.ZodEffects<z.ZodTypeAny>).innerType()
      );
    default:
      return {};
  }
}
