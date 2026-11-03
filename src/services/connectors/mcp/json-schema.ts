import { z } from "zod";

/**
 * A deliberately small zod (v4) → JSON Schema converter for MCP tool inputs.
 *
 * Tool inputs use a narrow subset of zod, so this covers exactly that subset
 * and throws on anything else, which keeps an unsupported schema from
 * shipping silently. (`z.toJSONSchema` is not used: its output differs from
 * what MCP clients already receive.)
 */
export type JsonSchema = Record<string, unknown>;

function withDescription(schema: z.ZodType, json: JsonSchema): JsonSchema {
  return schema.description
    ? { ...json, description: schema.description }
    : json;
}

function isOptional(schema: z.ZodType): boolean {
  return (
    schema instanceof z.ZodOptional ||
    schema instanceof z.ZodDefault ||
    (schema instanceof z.ZodNullable &&
      isOptional(schema.unwrap() as z.ZodType))
  );
}

export function zodToJsonSchema(schema: z.ZodType): JsonSchema {
  if (schema instanceof z.ZodOptional) {
    return withDescription(
      schema,
      zodToJsonSchema(schema.unwrap() as z.ZodType)
    );
  }
  if (schema instanceof z.ZodDefault) {
    return withDescription(schema, {
      ...zodToJsonSchema(schema.removeDefault() as z.ZodType),
      default: schema.def.defaultValue,
    });
  }
  if (schema instanceof z.ZodNullable) {
    const inner = zodToJsonSchema(schema.unwrap() as z.ZodType);
    const type = inner.type;
    return withDescription(schema, {
      ...inner,
      type: Array.isArray(type) ? [...type, "null"] : [type, "null"],
    });
  }
  if (schema instanceof z.ZodString) {
    return withDescription(schema, { type: "string" });
  }
  if (schema instanceof z.ZodNumber) {
    const json: JsonSchema = { type: schema.isInt ? "integer" : "number" };
    if (schema.minValue !== null) json.minimum = schema.minValue;
    if (schema.maxValue !== null) json.maximum = schema.maxValue;
    return withDescription(schema, json);
  }
  if (schema instanceof z.ZodBoolean) {
    return withDescription(schema, { type: "boolean" });
  }
  if (schema instanceof z.ZodEnum) {
    return withDescription(schema, {
      type: "string",
      enum: [...(schema.options as string[])],
    });
  }
  if (schema instanceof z.ZodUnion) {
    return withDescription(schema, {
      anyOf: (schema.options as z.ZodType[]).map((option) =>
        zodToJsonSchema(option)
      ),
    });
  }
  if (schema instanceof z.ZodArray) {
    const json: JsonSchema = {
      type: "array",
      items: zodToJsonSchema(schema.element as z.ZodType),
    };
    for (const check of schema.def.checks ?? []) {
      const checkDef = check._zod.def as {
        check: string;
        minimum?: number;
        maximum?: number;
      };
      if (checkDef.check === "min_length") json.minItems = checkDef.minimum;
      if (checkDef.check === "max_length") json.maxItems = checkDef.maximum;
    }
    return withDescription(schema, json);
  }
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, z.ZodType>;
    const properties: Record<string, JsonSchema> = {};
    const required: string[] = [];
    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodToJsonSchema(value);
      if (!isOptional(value)) required.push(key);
    }
    return withDescription(schema, {
      type: "object",
      properties,
      ...(required.length ? { required } : {}),
      // zod 4 spells `.strict()` as a `never` catchall.
      ...((schema.def.catchall as z.ZodType | undefined)?.def.type === "never"
        ? { additionalProperties: false }
        : {}),
    });
  }
  if (schema instanceof z.ZodUnknown || schema instanceof z.ZodAny) {
    return withDescription(schema, {});
  }
  if (schema instanceof z.ZodRecord) {
    return withDescription(schema, {
      type: "object",
      additionalProperties: zodToJsonSchema(schema.valueType as z.ZodType),
    });
  }
  throw new Error(
    `Unsupported zod type for MCP input schema: ${schema.constructor.name}`
  );
}
