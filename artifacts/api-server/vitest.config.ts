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
  },
});
