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
      // Floors just below current coverage: CI fails if it drops. Raise them as tests improve.
      thresholds: { statements: 65, branches: 45, functions: 70, lines: 65 },
    },
  },
});
