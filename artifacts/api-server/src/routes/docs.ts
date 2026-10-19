import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { apiReference } from "@scalar/express-api-reference";
import { Router } from "express";
import { publicRoute } from "../middleware/access.js";

// The spec ships next to the bundle in the Docker image; in dev and tests it's read from lib/.
const SPEC_PATHS = [
  resolve(process.cwd(), "openapi.yaml"),
  resolve(process.cwd(), "../../lib/api-spec/openapi.yaml"),
];

/** Interactive API reference (Scalar) at /docs, from lib/api-spec/openapi.yaml. */
export function createDocsRouter(): Router {
  const specPath = SPEC_PATHS.find((p) => existsSync(p));
  if (!specPath) throw new Error(`openapi.yaml not found (looked in ${SPEC_PATHS.join(", ")})`);
  const spec = readFileSync(specPath, "utf8");

  const router = Router();
  router.get("/openapi.yaml", publicRoute, (_req, res) => {
    res.type("application/yaml").send(spec);
  });
  router.get(
    "/",
    publicRoute,
    (_req, res, next) => {
      // The reference page runs an inline bootstrap script and Scalar's CDN bundle, which the
      // app-wide CSP (helmet) blocks. Docs are off in production by default (API_DOCS).
      res.removeHeader("Content-Security-Policy");
      next();
    },
    apiReference({
      url: "/docs/openapi.yaml",
      pageTitle: "API reference",
      // Pinned: the default CDN URL always serves Scalar's latest release.
      cdn: "https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.75.0",
    })
  );
  return router;
}
