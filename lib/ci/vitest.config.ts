import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/__tests__/**/*.test.ts"],
    coverage: {
      provider: "v8",
      // Count every source file, not just the ones a test happened to import.
      include: ["src/**"],
      // bin/ only reads the environment and calls the tested functions.
      exclude: ["src/__tests__/**", "src/bin/**"],
      // Floors just below current coverage: CI fails if it drops. `pnpm coverage:ratchet` raises
      // them to the current (rounded-down) coverage; commit the result with the tests.
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
        autoUpdate: process.env.COVERAGE_RATCHET === "1" ? (n: number) => Math.floor(n) : false,
      },
    },
  },
});
