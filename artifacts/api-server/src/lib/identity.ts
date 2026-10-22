// The only server module that knows the identity provider (Clerk). It answers "who is this?";
// what they may do comes from our own tables (src/lib/authz). Swapping providers means
// reimplementing this file.
import { createClerkClient, verifyToken } from "@clerk/backend";
import { env } from "@repo/env";

export interface Identity {
  /** Clerk user id (`user_…`): the key for `users.clerk_user_id`. */
  clerkUserId: string;
  /** Minutes since the second factor was verified in this session; null if it never was. */
  secondFactorAgeMinutes: number | null;
  /** The account's email and name; null until Clerk has verified its primary email. */
  profile(): Promise<Profile | null>;
}

export interface Profile {
  /** The primary email, verified: never another or an unverified address. */
  email: string;
  /** First and last name ("" when the account has none). */
  name: string;
}

/** Claims we read from a Clerk session token (`fva`: minutes since first/second factor, -1 = never). */
interface SessionClaims {
  sub: string;
  fva?: readonly [number, number];
  sts?: string;
  /** Test tokens only: stand in for the email and name Clerk's API would return. */
  email?: string;
  name?: string;
}

const TEST_PREFIX = "test:";

/**
 * Verifies a session token and returns who it belongs to, or null if it isn't a valid, active
 * session for one of our own sites (`authorizedParties`: the CORS origins).
 *
 * Under NODE_ENV=test it also accepts `test:<json claims>`, e.g. `test:{"sub":"user_1","fva":[1,1]}`,
 * so tests run without Clerk. Never accepted in any other environment.
 */
export async function verifySession(token: string): Promise<Identity | null> {
  let claims: SessionClaims;
  if (token.startsWith(TEST_PREFIX)) {
    if (env.NODE_ENV !== "test") return null;
    claims = JSON.parse(token.slice(TEST_PREFIX.length)) as SessionClaims;
  } else {
    const secretKey = env.CLERK_SECRET_KEY;
    if (!secretKey) return null;
    try {
      claims = (await verifyToken(token, {
        secretKey,
        authorizedParties: env.CORS_ORIGIN,
      })) as unknown as SessionClaims;
    } catch {
      return null;
    }
  }
  // A pending session (e.g. sign-in tasks not finished) isn't signed in yet.
  if (!claims.sub || claims.sts === "pending") return null;

  const second = claims.fva?.[1];
  return {
    clerkUserId: claims.sub,
    secondFactorAgeMinutes: second === undefined || second < 0 ? null : second,
    profile: () =>
      token.startsWith(TEST_PREFIX)
        ? Promise.resolve(claims.email ? { email: claims.email, name: claims.name ?? "" } : null)
        : fetchProfile(claims.sub),
  };
}

// Accounts Clerk last said have no verified email, until when to believe it. Such an account is
// refused on every request, and without this each refusal would be a Clerk API call. Someone who
// has just verified waits at most UNVERIFIED_RECHECK_MS.
const UNVERIFIED_RECHECK_MS = 30_000;
const UNVERIFIED_MAX_ENTRIES = 10_000;
const unverifiedUntil = new Map<string, number>();

async function fetchProfile(clerkUserId: string): Promise<Profile | null> {
  const secretKey = env.CLERK_SECRET_KEY;
  if (!secretKey) return null;
  if ((unverifiedUntil.get(clerkUserId) ?? 0) > Date.now()) return null;
  const user = await createClerkClient({ secretKey }).users.getUser(clerkUserId);
  const primary = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId);
  // Never fall back to emailAddresses[0]: an unverified or secondary address must grant nothing.
  if (primary?.verification?.status === "verified") {
    unverifiedUntil.delete(clerkUserId);
    return { email: primary.emailAddress, name: fullName(user.firstName, user.lastName) };
  }
  if (unverifiedUntil.size >= UNVERIFIED_MAX_ENTRIES) unverifiedUntil.clear();
  unverifiedUntil.set(clerkUserId, Date.now() + UNVERIFIED_RECHECK_MS);
  return null;
}

const fullName = (first: unknown, last: unknown) =>
  [first, last].filter((part) => typeof part === "string" && part).join(" ");

/**
 * The account in a Clerk webhook's user event (`data`, in Clerk's snake_case JSON): its name, and
 * its primary email by the same rule as profile(), so null until that address is verified.
 */
export function webhookAccount(data: Record<string, unknown>): {
  email: string | null;
  name: string;
} {
  const addresses = Array.isArray(data.email_addresses) ? data.email_addresses : [];
  const primary = addresses.find(
    (a): a is { email_address: string; verification?: { status?: unknown } } =>
      a?.id === data.primary_email_address_id && typeof a?.email_address === "string"
  );
  return {
    email: primary?.verification?.status === "verified" ? primary.email_address : null,
    name: fullName(data.first_name, data.last_name),
  };
}
