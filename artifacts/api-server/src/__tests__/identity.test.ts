import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const verifyToken = vi.fn();
const getUser = vi.fn();
vi.mock("@clerk/backend", () => ({
  verifyToken: (...args: unknown[]) => verifyToken(...args),
  createClerkClient: () => ({ users: { getUser: (id: string) => getUser(id) } }),
}));

const { verifySession } = await import("../lib/identity.js");

const test = (claims: object) => `test:${JSON.stringify(claims)}`;

beforeEach(() => {
  verifyToken.mockReset();
  getUser.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("verifySession: test tokens", () => {
  it("accepts test tokens under NODE_ENV=test", async () => {
    const identity = await verifySession(test({ sub: "user_1", fva: [3, 2], email: "a@x.test" }));
    expect(identity?.clerkUserId).toBe("user_1");
    expect(identity?.secondFactorAgeMinutes).toBe(2);
    expect(await identity?.primaryVerifiedEmail()).toBe("a@x.test");
  });

  it("refuses them in every other environment", async () => {
    for (const env of ["production", "development"]) {
      vi.stubEnv("NODE_ENV", env);
      expect(await verifySession(test({ sub: "user_1" }))).toBeNull();
    }
  });

  it("reports no second factor when the session never completed one", async () => {
    expect(
      (await verifySession(test({ sub: "u", fva: [3, -1] })))?.secondFactorAgeMinutes
    ).toBeNull();
    expect((await verifySession(test({ sub: "u" })))?.secondFactorAgeMinutes).toBeNull();
  });

  it("refuses a pending session", async () => {
    expect(await verifySession(test({ sub: "user_1", sts: "pending" }))).toBeNull();
  });
});

describe("verifySession: Clerk tokens", () => {
  it("verifies with the secret key, accepting only our own origins", async () => {
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_abc");
    vi.stubEnv("CORS_ORIGIN", "https://app.example,https://admin.example");
    verifyToken.mockResolvedValue({ sub: "user_9", fva: [1, 0] });
    const identity = await verifySession("jwt-from-clerk");
    expect(verifyToken).toHaveBeenCalledWith("jwt-from-clerk", {
      secretKey: "sk_test_abc",
      authorizedParties: ["https://app.example", "https://admin.example"],
    });
    expect(identity?.clerkUserId).toBe("user_9");
  });

  it("treats a token Clerk rejects as signed out", async () => {
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_abc");
    verifyToken.mockRejectedValue(new Error("expired"));
    expect(await verifySession("jwt")).toBeNull();
  });

  it("treats every session as signed out without a secret key", async () => {
    vi.stubEnv("CLERK_SECRET_KEY", undefined);
    expect(await verifySession("jwt")).toBeNull();
    expect(verifyToken).not.toHaveBeenCalled();
  });

  it("returns the primary email only once it's verified, never another address", async () => {
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_abc");
    verifyToken.mockResolvedValue({ sub: "user_9" });
    const account = (status: string) => ({
      primaryEmailAddressId: "e2",
      emailAddresses: [
        { id: "e1", emailAddress: "other@x.test", verification: { status: "verified" } },
        { id: "e2", emailAddress: "primary@x.test", verification: { status } },
      ],
    });
    const identity = await verifySession("jwt");
    getUser.mockResolvedValueOnce(account("verified"));
    expect(await identity?.primaryVerifiedEmail()).toBe("primary@x.test");
    getUser.mockResolvedValueOnce(account("unverified"));
    expect(await identity?.primaryVerifiedEmail()).toBeNull();
  });
});
