import { build } from "esbuild";

await build({
  entryPoints: [
    "src/index.ts",
    "src/worker.ts",
    "src/migrate.ts",
    // Admin scripts, runnable in the deployed image: railway ssh -- node dist/scripts/<name>.js
    "src/scripts/staff-grant.ts",
    "src/scripts/staff-revoke.ts",
    "src/scripts/org-grant.ts",
  ],
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  outdir: "dist",
  external: [
    // Native addons — must be present in the runtime image
    "pg-native",
  ],
  banner: {
    // pino uses dynamic require() for transports; this shim makes it available in ESM bundles
    js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
  },
});
