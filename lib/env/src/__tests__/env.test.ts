import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { env, loadEnvFiles, validateServerEnv } from "../index.js";

const valid = { DATABASE_URL: "postgres://localhost/app" };

describe("env getters", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("PORT defaults to 3000 and is a number", () => {
    vi.stubEnv("PORT", undefined);
    expect(env.PORT).toBe(3000);
    vi.stubEnv("PORT", "8080");
    expect(env.PORT).toBe(8080);
  });

  it("NODE_ENV defaults to development when not set", () => {
    vi.stubEnv("NODE_ENV", undefined);
    expect(env.NODE_ENV).toBe("development");
  });

  it("DATABASE_URL throws an actionable error when not set", () => {
    vi.stubEnv("DATABASE_URL", undefined);
    expect(() => env.DATABASE_URL).toThrow("Missing required env var: DATABASE_URL");
    expect(() => env.DATABASE_URL).toThrow("cp .env.example .env");
  });

  it("RUN_WORKER defaults to true and accepts only true/false", () => {
    vi.stubEnv("RUN_WORKER", undefined);
    expect(env.RUN_WORKER).toBe(true);
    vi.stubEnv("RUN_WORKER", "false");
    expect(env.RUN_WORKER).toBe(false);
    vi.stubEnv("RUN_WORKER", "no");
    expect(() => env.RUN_WORKER).toThrow("Invalid env var RUN_WORKER");
  });

  it("CORS_ORIGIN parses a comma-separated list", () => {
    vi.stubEnv("CORS_ORIGIN", "https://a.example, https://b.example,");
    expect(env.CORS_ORIGIN).toEqual(["https://a.example", "https://b.example"]);
  });

  it("CORS_ORIGIN defaults to the local dev servers, but to none in production", () => {
    vi.stubEnv("CORS_ORIGIN", undefined);
    vi.stubEnv("NODE_ENV", "development");
    expect(env.CORS_ORIGIN).toEqual(["http://localhost:5173", "http://localhost:3001"]);
    vi.stubEnv("NODE_ENV", "production");
    expect(env.CORS_ORIGIN).toEqual([]);
  });

  it("API_DOCS is on by default except in production, and can be set either way", () => {
    vi.stubEnv("API_DOCS", undefined);
    vi.stubEnv("NODE_ENV", "development");
    expect(env.API_DOCS).toBe(true);
    vi.stubEnv("NODE_ENV", "production");
    expect(env.API_DOCS).toBe(false);
    vi.stubEnv("API_DOCS", "true");
    expect(env.API_DOCS).toBe(true);
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("API_DOCS", "false");
    expect(env.API_DOCS).toBe(false);
  });

  it("RATE_LIMIT_MAX defaults to 300, or 0 under tests; the window to 60s", () => {
    vi.stubEnv("RATE_LIMIT_MAX", undefined);
    vi.stubEnv("RATE_LIMIT_WINDOW_MS", undefined);
    vi.stubEnv("NODE_ENV", "production");
    expect(env.RATE_LIMIT_MAX).toBe(300);
    vi.stubEnv("NODE_ENV", "test");
    expect(env.RATE_LIMIT_MAX).toBe(0);
    vi.stubEnv("RATE_LIMIT_MAX", "50");
    expect(env.RATE_LIMIT_MAX).toBe(50);
    expect(env.RATE_LIMIT_WINDOW_MS).toBe(60_000);
  });

  it("CLERK_SECRET_KEY is optional but must look like a Clerk secret", () => {
    vi.stubEnv("CLERK_SECRET_KEY", undefined);
    expect(env.CLERK_SECRET_KEY).toBeUndefined();
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_abc");
    expect(env.CLERK_SECRET_KEY).toBe("sk_test_abc");
    vi.stubEnv("CLERK_SECRET_KEY", "pk_test_abc");
    expect(() => env.CLERK_SECRET_KEY).toThrow("Invalid env var CLERK_SECRET_KEY");
  });

  it("STAFF_MFA_REQUIRED defaults to on in production only, and can be set", () => {
    vi.stubEnv("STAFF_MFA_REQUIRED", undefined);
    vi.stubEnv("NODE_ENV", "production");
    expect(env.STAFF_MFA_REQUIRED).toBe(true);
    vi.stubEnv("NODE_ENV", "development");
    expect(env.STAFF_MFA_REQUIRED).toBe(false);
    vi.stubEnv("STAFF_MFA_REQUIRED", "true");
    expect(env.STAFF_MFA_REQUIRED).toBe(true);
  });

  it("SENTRY_DSN is optional but must be a URL", () => {
    vi.stubEnv("SENTRY_DSN", undefined);
    expect(env.SENTRY_DSN).toBeUndefined();
    vi.stubEnv("SENTRY_DSN", "https://key@o1.ingest.sentry.io/2");
    expect(env.SENTRY_DSN).toBe("https://key@o1.ingest.sentry.io/2");
    vi.stubEnv("SENTRY_DSN", "key@o1");
    expect(() => env.SENTRY_DSN).toThrow("Invalid env var SENTRY_DSN");
  });

  it("DEPLOY_ENVIRONMENT is Railway's environment, or NODE_ENV off Railway", () => {
    vi.stubEnv("RAILWAY_ENVIRONMENT_NAME", undefined);
    vi.stubEnv("NODE_ENV", "development");
    expect(env.DEPLOY_ENVIRONMENT).toBe("development");
    vi.stubEnv("RAILWAY_ENVIRONMENT_NAME", "staging");
    expect(env.DEPLOY_ENVIRONMENT).toBe("staging");
  });

  it("COMMIT_SHA is Railway's commit, or null", () => {
    vi.stubEnv("RAILWAY_GIT_COMMIT_SHA", undefined);
    expect(env.COMMIT_SHA).toBeNull();
    vi.stubEnv("RAILWAY_GIT_COMMIT_SHA", "abc123");
    expect(env.COMMIT_SHA).toBe("abc123");
  });
});

describe("validateServerEnv", () => {
  it("returns typed values for a valid environment", () => {
    expect(validateServerEnv({ ...valid, PORT: "4000" })).toMatchObject({
      DATABASE_URL: "postgres://localhost/app",
      PORT: 4000,
      NODE_ENV: "development",
      RUN_WORKER: true,
    });
  });

  it("reports every problem at once", () => {
    let message = "";
    try {
      validateServerEnv({ PORT: "abc", NODE_ENV: "staging", RUN_WORKER: "yes" });
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain("DATABASE_URL: missing");
    expect(message).toContain("PORT:");
    expect(message).toContain("NODE_ENV:");
    expect(message).toContain("RUN_WORKER:");
    expect(message).toContain("cp .env.example .env");
  });
});

// Tested against temporary directories rather than the repo, so the result (and coverage) doesn't
// depend on whether the machine running the tests has a .env.
describe("loadEnvFiles", () => {
  const vars = ["ENV_TEST_ROOT", "ENV_TEST_PKG", "ENV_TEST_SHARED", "ENV_TEST_PRESET"];
  afterEach(() => {
    for (const v of vars) delete process.env[v];
  });

  it("loads the repo root's .env, then the package's; the first value set wins", () => {
    const root = mkdtempSync(join(tmpdir(), "env-"));
    const pkg = join(root, "lib", "pkg");
    mkdirSync(pkg, { recursive: true });
    writeFileSync(
      join(root, ".env"),
      "ENV_TEST_ROOT=root\nENV_TEST_SHARED=root\nENV_TEST_PRESET=file\n"
    );
    writeFileSync(join(pkg, ".env"), "ENV_TEST_PKG=pkg\nENV_TEST_SHARED=pkg\n");
    process.env.ENV_TEST_PRESET = "already set";
    try {
      loadEnvFiles(pkg);
    } finally {
      rmSync(root, { recursive: true });
    }
    expect(vars.map((v) => process.env[v])).toEqual(["root", "pkg", "root", "already set"]);
  });

  it("does nothing when there are no .env files", () => {
    const empty = mkdtempSync(join(tmpdir(), "env-"));
    try {
      expect(() => loadEnvFiles(join(empty, "lib", "pkg"))).not.toThrow();
    } finally {
      rmSync(empty, { recursive: true });
    }
    expect(process.env.ENV_TEST_ROOT).toBeUndefined();
  });
});
