import { describe, expect, it } from "vitest";
import { accessRule } from "../middleware/access.js";
import { mountedRoutes } from "../test-helpers/mounted-routes.js";

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

describe("route access rules", () => {
  it("every mounted route declares one, first, and it matches the table", async () => {
    // The rule must be the route's first handler: nothing runs before access is checked.
    const mounted = (await mountedRoutes()).map((r) => ({
      key: r.key,
      rule: accessRule(r.firstHandler),
    }));
    const missing = mounted.filter((r) => r.rule === undefined).map((r) => r.key);
    expect(missing, "routes without an access rule as their first handler").toEqual([]);
    expect(Object.fromEntries(mounted.map((r) => [r.key, r.rule]))).toEqual(EXPECTED);
  });
});
