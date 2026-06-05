import { build } from "esbuild";

await build({
  entryPoints: ["src/index.ts", "src/worker.ts", "src/migrate.ts"],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  outdir: "dist",
  external: [
    // Native addons — must be present in the runtime image
    "pg-native",
  ],
  banner: {
    js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
  },
});
