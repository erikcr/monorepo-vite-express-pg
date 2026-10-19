import supertest from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import { createTestDb } from "../test-helpers/create-test-db.js";
import { createFakeQueue } from "../test-helpers/fake-queue.js";

const app = async () => supertest(createApp(await createTestDb(), createFakeQueue()));

describe("/docs (API reference)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("serves the reference page with a pinned Scalar bundle", async () => {
    const res = await (await app()).get("/docs");
    expect(res.status).toBe(200);
    expect(res.text).toContain("https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.75.0");
    expect(res.text).toContain("/docs/openapi.yaml");
    // The page needs its inline bootstrap script, so only it drops helmet's CSP.
    expect(res.headers["content-security-policy"]).toBeUndefined();
  });

  it("serves the spec it documents", async () => {
    const res = await (await app()).get("/docs/openapi.yaml");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/yaml");
    expect(res.text).toContain("operationId: listExamples");
  });

  it("keeps the CSP on every other route", async () => {
    const res = await (await app()).get("/health");
    expect(res.headers["content-security-policy"]).toBeDefined();
  });

  it("is off when API_DOCS=false (the production default)", async () => {
    vi.stubEnv("API_DOCS", "false");
    expect((await (await app()).get("/docs")).status).toBe(404);
    vi.stubEnv("API_DOCS", undefined);
    vi.stubEnv("NODE_ENV", "production");
    expect((await (await app()).get("/docs")).status).toBe(404);
  });
});
