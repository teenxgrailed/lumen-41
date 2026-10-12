import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("Import asset entity migration", () => {
  const sql = readFileSync(
    join(
      process.cwd(),
      "prisma/migrations/20261012120000_import_asset_entity/migration.sql"
    ),
    "utf8"
  );
  const schema = readFileSync(
    join(process.cwd(), "prisma/schema.prisma"),
    "utf8"
  );

  it("only adds one value to the entity type enum, on its own", () => {
    const statements = sql
      .split("\n")
      .filter((line) => line.trim() && !line.trim().startsWith("--"));
    expect(statements).toEqual([
      `ALTER TYPE "ImportEntityType" ADD VALUE 'asset';`,
    ]);
  });

  it("is expand only", () => {
    expect(sql).not.toMatch(/DROP|DELETE|UPDATE|ALTER\s+TABLE|RENAME/i);
  });

  it("matches the schema enum", () => {
    const body = /enum ImportEntityType \{([^}]*)\}/.exec(schema)?.[1] ?? "";
    expect(body.split(/\s+/).filter(Boolean)).toEqual(
      expect.arrayContaining(["page", "database", "record", "asset"])
    );
  });

  it("is newer than the imports migration it extends", () => {
    expect(
      "20261012120000_import_asset_entity" > "20261012090000_imports"
    ).toBe(true);
  });
});
