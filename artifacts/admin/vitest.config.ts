import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["src/__tests__/**/*.test.tsx", "src/__tests__/**/*.test.ts"],
    setupFiles: ["./src/__tests__/setup.ts"],
    coverage: {
      provider: "v8",
      // Count every source file, not just the ones a test happened to import.
      include: ["src/**"],
      exclude: ["src/__tests__/**", "src/test-helpers/**", "src/main.tsx", "src/vite-env.d.ts"],
      // Floors just below current coverage: CI fails if it drops. `pnpm coverage:ratchet` raises
      // them to the current (rounded-down) coverage; commit the result with the tests.
      thresholds: {
        statements: 83,
        branches: 59,
        functions: 78,
        lines: 83,
        autoUpdate: process.env.COVERAGE_RATCHET === "1" ? (n: number) => Math.floor(n) : false,
      },
    },
  },
});
