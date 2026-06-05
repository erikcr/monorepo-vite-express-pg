import { afterEach, describe, expect, it } from "vitest";

describe("env loader", () => {
  afterEach(() => {
    Reflect.deleteProperty(process.env, "__VITEST_RESET__");
  });

  it("PORT defaults to '3000' when not set", async () => {
    const saved = process.env.PORT;
    Reflect.deleteProperty(process.env, "PORT");
    const { env } = await import("../index.js");
    expect(env.PORT).toBe("3000");
    if (saved !== undefined) process.env.PORT = saved;
  });

  it("NODE_ENV defaults to 'development' when not set", async () => {
    const saved = process.env.NODE_ENV;
    Reflect.deleteProperty(process.env, "NODE_ENV");
    const { env } = await import("../index.js");
    expect(env.NODE_ENV).toBe("development");
    if (saved !== undefined) process.env.NODE_ENV = saved;
  });

  it("DATABASE_URL throws when not set", async () => {
    const saved = process.env.DATABASE_URL;
    Reflect.deleteProperty(process.env, "DATABASE_URL");
    const { env } = await import("../index.js");
    expect(() => env.DATABASE_URL).toThrow("Missing required env var: DATABASE_URL");
    if (saved !== undefined) process.env.DATABASE_URL = saved;
  });
});
