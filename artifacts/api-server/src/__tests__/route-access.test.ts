import type { Router } from "express";
import { describe, expect, it } from "vitest";
import { createRouters } from "../app.js";
import { accessRule } from "../middleware/access.js";
import { createTestDb } from "../test-helpers/create-test-db.js";
import { createFakeQueue } from "../test-helpers/fake-queue.js";

// Every route the API mounts, and the one access rule it declares. A new route without a rule
// fails here; so does a changed rule, which should be a deliberate edit to this table.
const EXPECTED: Record<string, string> = {
  "GET /health": "public",
  "GET /health/ready": "public",
  "POST /api/client-errors": "public",
  "GET /docs/openapi.yaml": "public",
  "GET /docs": "public",
  "GET /api/me": "signed-in",
  "POST /api/orgs": "signed-in",
  "GET /api/admin/orgs": "staff:platform.orgs.read",
  "GET /api/example": "example.read",
  "POST /api/example": "example.write",
  "GET /api/example/:id": "example.read",
  "PATCH /api/example/:id": "example.write",
  "DELETE /api/example/:id": "example.write",
};

interface RouteLayer {
  route?: { path: string; stack: { method?: string; handle: unknown }[] };
}

function routes(mount: string, router: Router) {
  return (router.stack as RouteLayer[]).flatMap(({ route }) => {
    if (!route) return [];
    const method = route.stack.find((s) => s.method)?.method?.toUpperCase() ?? "?";
    const path = `${mount}${route.path === "/" ? "" : route.path}`;
    // The rule must be the route's first handler: nothing runs before access is checked.
    return [{ key: `${method} ${path}`, rule: accessRule(route.stack[0]?.handle) }];
  });
}

describe("route access rules", () => {
  it("every mounted route declares one, first, and it matches the table", async () => {
    const mounted = Object.entries(createRouters(await createTestDb(), createFakeQueue())).flatMap(
      ([mount, router]) => routes(mount, router)
    );
    const missing = mounted.filter((r) => r.rule === undefined).map((r) => r.key);
    expect(missing, "routes without an access rule as their first handler").toEqual([]);
    expect(Object.fromEntries(mounted.map((r) => [r.key, r.rule]))).toEqual(EXPECTED);
  });
});
