import { build } from "esbuild";
import { pino } from "esbuild-plugin-pino";

await build({
  entryPoints: ["src/index.ts", "src/worker.ts", "src/migrate.ts"],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  outdir: "dist",
  plugins: [pino({ transports: ["pino-pretty"] })],
  external: [
    // Native addons — must be present in the runtime image
    "pg-native",
  ],
});
