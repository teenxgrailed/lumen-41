import { z } from "zod";

/**
 * A deliberately small zod (v3) → JSON Schema converter for MCP tool inputs.
 *
 * The project is on zod 3.24, which has no `z.toJSONSchema`, and
 * `zod-to-json-schema` is only a transitive dependency. Tool inputs use a
 * narrow subset of zod, so this covers exactly that subset and throws on
 * anything else, which keeps an unsupported schema from shipping silently.
 */
export type JsonSchema = Record<string, unknown>;

function withDescription(schema: z.ZodTypeAny, json: JsonSchema): JsonSchema {
  return schema.description
    ? { ...json, description: schema.description }
    : json;
}

function isOptional(schema: z.ZodTypeAny): boolean {
  return (
    schema instanceof z.ZodOptional ||
    schema instanceof z.ZodDefault ||
    (schema instanceof z.ZodNullable && isOptional(schema.unwrap()))
  );
}

export function zodToJsonSchema(schema: z.ZodTypeAny): JsonSchema {
  if (schema instanceof z.ZodOptional) {
    return withDescription(schema, zodToJsonSchema(schema.unwrap()));
  }
  if (schema instanceof z.ZodDefault) {
    return withDescription(schema, {
      ...zodToJsonSchema(schema.removeDefault()),
      default: schema._def.defaultValue(),
    });
  }
  if (schema instanceof z.ZodNullable) {
    const inner = zodToJsonSchema(schema.unwrap());
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
  if (schema instanceof z.ZodArray) {
    return withDescription(schema, {
      type: "array",
      items: zodToJsonSchema(schema.element),
    });
  }
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, z.ZodTypeAny>;
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
    });
  }
  throw new Error(
    `Unsupported zod type for MCP input schema: ${schema.constructor.name}`
  );
}
