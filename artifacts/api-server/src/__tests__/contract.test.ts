import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { mountedRoutes } from "../test-helpers/mounted-routes.js";

// The spec is the contract the generated clients are built from, so the server must implement
// exactly what it declares: an operation without a route is a client call that 404s, and a route
// without an operation is an endpoint no client is generated for and no response is validated by.
const SPEC = resolve(import.meta.dirname, "../../../../lib/api-spec/openapi.yaml");
const METHODS = ["get", "post", "put", "patch", "delete"];
// Routes that serve the spec itself, and webhooks: their providers define the payloads and no
// client of ours calls them.
const NOT_IN_SPEC = new Set([
  "GET /docs",
  "GET /docs/openapi.yaml",
  "POST /api/webhooks/resend",
  "POST /api/webhooks/clerk",
]);

function specOperations(): string[] {
  const spec = parse(readFileSync(SPEC, "utf8")) as { paths: Record<string, object> };
  return Object.entries(spec.paths).flatMap(([path, item]) =>
    METHODS.filter((m) => m in item).map(
      (m) => `${m.toUpperCase()} ${path.replace(/\{(\w+)\}/g, ":$1")}`
    )
  );
}

describe("API contract", () => {
  it("mounts a route for every spec operation, and nothing the spec doesn't declare", async () => {
    const mounted = (await mountedRoutes()).map((r) => r.key).filter((k) => !NOT_IN_SPEC.has(k));
    expect(mounted.sort()).toEqual(specOperations().sort());
  });
});
