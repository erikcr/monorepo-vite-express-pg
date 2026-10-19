import { afterEach, describe, expect, it, vi } from "vitest";
import { env, validateServerEnv } from "../index.js";

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
