import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/__tests__/**/*.test.ts"],
    coverage: {
      provider: "v8",
      // Count every source file, not just the ones a test happened to import.
      include: ["src/**"],
      exclude: ["src/__tests__/**", "src/test-helpers/**"],
      // Floors just below current coverage: CI fails if it drops. Raise them as tests improve.
      thresholds: { statements: 90, branches: 75, functions: 85, lines: 90 },
    },
  },
});
