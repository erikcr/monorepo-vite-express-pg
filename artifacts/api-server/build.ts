import { execFileSync } from "node:child_process";
import { build } from "esbuild";

const result = await build({
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
  metafile: true,
  external: [
    // Native addons — must be present in the runtime image
    "pg-native",
  ],
  banner: {
    // pino uses dynamic require() for transports; this shim makes it available in ESM bundles.
    // Aliased, because bundled code (Sentry) imports createRequire under its own name.
    js: "import { createRequire as __createRequire } from 'module'; const require = __createRequire(import.meta.url);",
  },
});

// Parse every bundle, so one that can't load (e.g. a name the banner and a bundled package both
// declare) fails the build instead of the deploy's health check.
for (const file of Object.keys(result.metafile.outputs).filter((f) => f.endsWith(".js"))) {
  execFileSync(process.execPath, ["--check", file], { stdio: "inherit" });
}
