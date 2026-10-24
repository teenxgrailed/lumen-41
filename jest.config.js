const path = require("node:path");

// @tiptap/markdown depends on marked 17, which ships ESM only. Jest runs
// CommonJS, so tests that import the Notion importer get marked's UMD build
// (the same release, resolved from where @tiptap/markdown itself finds it).
// Production bundles do not use this mapping.
const markedUmd = path.join(
  path.dirname(
    require.resolve("marked/package.json", {
      paths: [require.resolve("@tiptap/markdown")],
    })
  ),
  "lib",
  "marked.umd.js"
);

/** @type {import('jest').Config} */
const config = {
  testEnvironment: "node",
  modulePathIgnorePatterns: ["<rootDir>/.next"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "^marked$": markedUmd,
  },
  setupFiles: ["<rootDir>/jest.setup.cjs"],
  testMatch: [
    "<rootDir>/src/**/__tests__/**/*.test.ts",
    "<rootDir>/scripts/**/__tests__/**/*.test.ts",
  ],
  transform: {
    // isolatedModules keeps jest memory bounded: type-checking is covered by
    // `tsc --noEmit`, so tests only need transpilation.
    "^.+\\.tsx?$": [
      "ts-jest",
      { isolatedModules: true, tsconfig: "<rootDir>/tsconfig.jest.json" },
    ],
  },
};

module.exports = config;
