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
  vi.useRealTimers();
});

describe("verifySession: test tokens", () => {
  it("accepts test tokens under NODE_ENV=test", async () => {
    const identity = await verifySession(
      test({ sub: "user_1", fva: [3, 2], email: "a@x.test", name: "A" })
    );
    expect(identity?.clerkUserId).toBe("user_1");
    expect(identity?.secondFactorAgeMinutes).toBe(2);
    expect(await identity?.profile()).toEqual({ email: "a@x.test", name: "A" });
    // Without an email claim the account has no verified email.
    expect(await (await verifySession(test({ sub: "user_2" })))?.profile()).toBeNull();
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
      firstName: "Ann",
      lastName: null,
      primaryEmailAddressId: "e2",
      emailAddresses: [
        { id: "e1", emailAddress: "other@x.test", verification: { status: "verified" } },
        { id: "e2", emailAddress: "primary@x.test", verification: { status } },
      ],
    });
    const identity = await verifySession("jwt");
    getUser.mockResolvedValueOnce(account("verified"));
    expect(await identity?.profile()).toEqual({ email: "primary@x.test", name: "Ann" });
    getUser.mockResolvedValueOnce(account("unverified"));
    expect(await identity?.profile()).toBeNull();
  });

  // An account without a verified email is refused on every request, and each refusal would
  // otherwise be a Clerk API call: one account could spend the instance's rate limit.
  it("asks Clerk about an unverified account at most once per 30s", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_abc");
    verifyToken.mockResolvedValue({ sub: "user_unverified" });
    getUser.mockResolvedValue({
      primaryEmailAddressId: "e1",
      emailAddresses: [{ id: "e1", emailAddress: "u@x.test", verification: { status: "x" } }],
    });
    const ask = async () => (await (await verifySession("jwt"))?.profile())?.email ?? null;

    expect(await ask()).toBeNull();
    expect(await ask()).toBeNull();
    expect(getUser).toHaveBeenCalledOnce();

    vi.setSystemTime(Date.now() + 30_001);
    getUser.mockResolvedValue({
      primaryEmailAddressId: "e1",
      emailAddresses: [
        { id: "e1", emailAddress: "u@x.test", verification: { status: "verified" } },
      ],
    });
    expect(await ask()).toBe("u@x.test");
    expect(getUser).toHaveBeenCalledTimes(2);
  });

  it("remembers at most 10,000 unverified accounts, then starts over", async () => {
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_abc");
    getUser.mockResolvedValue({ primaryEmailAddressId: "e1", emailAddresses: [] });
    // A fresh copy of the module: the cache is module state, and earlier tests leave entries.
    vi.resetModules();
    const fresh = await import("../lib/identity.js");
    const ask = async (sub: string) => {
      verifyToken.mockResolvedValueOnce({ sub });
      return (await fresh.verifySession("jwt"))?.profile();
    };
    for (let i = 0; i < 10_000; i++) await ask(`user_many_${i}`);
    await ask("user_many_0"); // remembered
    expect(getUser).toHaveBeenCalledTimes(10_000);
    await ask("user_many_10000"); // full: forgets everyone, then remembers this one
    await ask("user_many_0"); // asked again
    expect(getUser).toHaveBeenCalledTimes(10_002);
  });
});
