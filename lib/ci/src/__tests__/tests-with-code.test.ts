import { describe, expect, it } from "vitest";
import { optOutReason, untestedPackages } from "../tests-with-code.ts";

describe("untestedPackages", () => {
  it("passes a source change that comes with the package's tests", () => {
    expect(
      untestedPackages([
        "artifacts/api-server/src/routes/orders.ts",
        "artifacts/api-server/src/__tests__/orders.test.ts",
      ])
    ).toEqual([]);
  });

  it("names each package whose source changed without its tests", () => {
    expect(
      untestedPackages([
        "artifacts/web/src/pages/OrdersPage.tsx",
        "lib/env/src/index.ts",
        "artifacts/api-server/src/routes/orders.ts",
        "artifacts/api-server/src/__tests__/orders.test.ts",
      ])
    ).toEqual(["artifacts/web", "lib/env"]);
  });

  it("doesn't accept another package's tests", () => {
    expect(
      untestedPackages([
        "artifacts/admin/src/pages/DashboardPage.tsx",
        "artifacts/web/src/__tests__/router.test.tsx",
      ])
    ).toEqual(["artifacts/admin"]);
  });

  it("accepts tests where a package's tests live: the apps for lib/db, E2E for a page", () => {
    expect(
      untestedPackages([
        "lib/db/src/schema.ts",
        "artifacts/api-server/src/__tests__/orders.test.ts",
        "artifacts/web/src/pages/OrdersPage.tsx",
        "e2e/tests/orders.spec.ts",
      ])
    ).toEqual([]);
  });

  it("ignores what isn't source: docs, config, generated code, test helpers", () => {
    expect(
      untestedPackages([
        "docs/TESTING.md",
        "artifacts/web/vercel.json",
        "artifacts/api-server/package.json",
        "lib/api-spec/openapi.yaml",
        "lib/api-zod/src/index.ts",
        "lib/api-client-react/src/index.ts",
        "artifacts/api-server/src/test-helpers/auth.ts",
        ".github/workflows/ci.yml",
      ])
    ).toEqual([]);
  });

  it("doesn't count a test helper as a test", () => {
    expect(
      untestedPackages([
        "artifacts/web/src/pages/OrdersPage.tsx",
        "artifacts/web/src/test-helpers/render.tsx",
      ])
    ).toEqual(["artifacts/web"]);
  });
});

describe("optOutReason", () => {
  it("reads the reason after an em dash, en dash or hyphens, case-insensitively", () => {
    expect(optOutReason("Tests: none needed — log wording only")).toBe("log wording only");
    expect(optOutReason("intro\r\ntests: None needed – rename\r\nmore")).toBe("rename");
    expect(optOutReason("  Tests: none needed -- comments")).toBe("comments");
  });

  it("ignores a line inside an HTML comment, and the bare placeholder", () => {
    expect(optOutReason("<!--\nTests: none needed — docs only\n-->\n- added a test")).toBeNull();
    expect(optOutReason("Tests: none needed — <reason>")).toBeNull();
  });

  it("needs a reason", () => {
    expect(optOutReason("Tests: none needed")).toBeNull();
    expect(optOutReason("Tests: none needed — ")).toBeNull();
    expect(optOutReason("")).toBeNull();
  });
});
