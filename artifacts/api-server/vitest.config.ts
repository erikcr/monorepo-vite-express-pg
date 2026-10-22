import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/__tests__/**/*.test.ts"],
    // Each test file boots its own PGlite (in-process Postgres, WASM) and runs the migrations.
    // Under full parallel load (pnpm test across the workspace, CI) that cold start can pass
    // vitest's 5s default, failing whichever test triggers it first.
    testTimeout: 20_000,
    hookTimeout: 20_000,
    coverage: {
      provider: "v8",
      // Count every source file, not just the ones a test happened to import.
      include: ["src/**"],
      exclude: [
        "src/__tests__/**",
        "src/test-helpers/**",
        "src/index.ts",
        "src/worker.ts",
        "src/migrate.ts",
        "src/validate-env.ts",
        "src/e2e-server.ts",
        "src/scripts/**",
      ],
      // Floors just below current coverage: CI fails if it drops. `pnpm coverage:ratchet` raises
      // them to the current (rounded-down) coverage; commit the result with the tests.
      thresholds: {
        statements: 96,
        branches: 94,
        functions: 97,
        lines: 98,
        autoUpdate: process.env.COVERAGE_RATCHET === "1" ? (n: number) => Math.floor(n) : false,
      },
    },
  },
});
