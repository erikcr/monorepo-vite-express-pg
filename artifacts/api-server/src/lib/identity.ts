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
  /** The account's primary email, only once Clerk has verified it; null otherwise. */
  primaryVerifiedEmail(): Promise<string | null>;
}

/** Claims we read from a Clerk session token (`fva`: minutes since first/second factor, -1 = never). */
interface SessionClaims {
  sub: string;
  fva?: readonly [number, number];
  sts?: string;
  /** Test tokens only: stands in for the email Clerk's API would return. */
  email?: string;
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
    primaryVerifiedEmail: () =>
      token.startsWith(TEST_PREFIX)
        ? Promise.resolve(claims.email ?? null)
        : fetchPrimaryVerifiedEmail(claims.sub),
  };
}

async function fetchPrimaryVerifiedEmail(clerkUserId: string): Promise<string | null> {
  const secretKey = env.CLERK_SECRET_KEY;
  if (!secretKey) return null;
  const user = await createClerkClient({ secretKey }).users.getUser(clerkUserId);
  const primary = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId);
  // Never fall back to emailAddresses[0]: an unverified or secondary address must grant nothing.
  return primary?.verification?.status === "verified" ? primary.emailAddress : null;
}
