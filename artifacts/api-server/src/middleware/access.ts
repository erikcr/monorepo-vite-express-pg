import type { Db, Org, User } from "@repo/db";
import { env } from "@repo/env";
import type { Request, RequestHandler, Response } from "express";
import {
  can,
  ensureUser,
  loadOrg,
  loadOrgRoles,
  loadStaff,
  resolveTenant,
} from "../lib/authz/access.js";
import {
  type OrgPermission,
  type OrgRole,
  orgPermissions,
  type StaffPermission,
  type StaffRole,
  staffPermissions,
} from "../lib/authz/policy.js";
import { type Identity, verifySession } from "../lib/identity.js";

// Every route declares exactly one access rule through these middlewares, and
// src/__tests__/route-access.test.ts fails for any route that doesn't.
export type AccessRule = "public" | "signed-in" | OrgPermission | `staff:${StaffPermission}`;
const declared = new WeakMap<RequestHandler, AccessRule>();

export function accessRule(handler: unknown): AccessRule | undefined {
  return typeof handler === "function" ? declared.get(handler as RequestHandler) : undefined;
}

function declare(rule: AccessRule, handler: RequestHandler): RequestHandler {
  declared.set(handler, rule);
  return handler;
}

/** For routes anyone may call (health probes, docs, crash reports). Says so explicitly. */
export const publicRoute: AccessHandler = declare("public", (_req, _res, next) => next());

/** The verified session from `Authorization: Bearer <token>`, or null. */
async function identify(req: Request): Promise<Identity | null> {
  const header = req.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  return token ? verifySession(token) : null;
}

const refuse = (res: Response, status: 401 | 403 | 404 | 400, error: string, code?: string) => {
  res.status(status).json(code ? { error, code } : { error });
};

/** The signed-in person (session verified, `users` row ensured), or null after answering. */
async function signedInUser(
  db: Db,
  req: Request,
  res: Response
): Promise<{ user: User; identity: Identity } | null> {
  const identity = await identify(req);
  if (!identity) {
    refuse(res, 401, "Authentication required");
    return null;
  }
  const user = await ensureUser(db, identity);
  if (!user) {
    refuse(res, 403, "Verify your email address to continue", "email_unverified");
    return null;
  }
  return { user, identity };
}

// A staff session's second factor counts for this long; then they sign in again with it. Clerk
// sessions last days, so a factor from the start of one says little about who holds it now.
const STAFF_SECOND_FACTOR_MAX_AGE_MINUTES = 12 * 60;

// Access checks never read params, query or body, so they're typed to fit any route: express
// infers a route's request types from all its handlers, and a default-typed one would clash
// with what validate() narrows them to.
// biome-ignore lint/suspicious/noExplicitAny: see above
type AccessHandler = RequestHandler<any, any, any, any>;

/** The access middlewares, bound to a database. */
export interface Access {
  signedIn: AccessHandler;
  requireOrg(permission: OrgPermission): AccessHandler;
  requireStaff(permission: StaffPermission): AccessHandler;
}

export function createAccess(db: Db): Access {
  /** For routes about the person rather than an org: /api/me, creating an org. */
  const signedIn = declare("signed-in", async (req, res, next) => {
    const person = await signedInUser(db, req, res);
    if (!person) return;
    req.user = person.user;
    req.identity = person.identity;
    next();
  });

  /**
   * The org request pipeline: authenticate, load the person's grants, resolve the org
   * (`X-Org-Id`, checked against the grants), check `permission` there, then hand the handler
   * `req.ctx`. Handlers read the org from `req.ctx.org`, never from anything the client sent.
   */
  const requireOrg = (permission: OrgPermission) =>
    declare(permission, async (req, res, next) => {
      const person = await signedInUser(db, req, res);
      if (!person) return;
      const { user, identity } = person;
      const roles = await loadOrgRoles(db, user.id);
      const tenant = resolveTenant(roles, req.get("x-org-id"));
      if ("refusal" in tenant) {
        if (tenant.refusal === "no_org")
          refuse(res, 404, "You don't belong to an organization yet", "no_org");
        else if (tenant.refusal === "org_required")
          refuse(res, 400, "Choose an organization with the X-Org-Id header", "org_required");
        else refuse(res, 403, "No access to that organization", "forbidden");
        return;
      }
      const role = roles.get(tenant.orgId) as OrgRole;
      if (!can(role, permission)) {
        refuse(res, 403, "You don't have permission to do that", "forbidden");
        return;
      }
      const org = await loadOrg(db, tenant.orgId);
      if (!org) {
        refuse(res, 404, "Organization not found");
        return;
      }
      req.user = user;
      req.identity = identity;
      req.ctx = { org, role, permissions: orgPermissions(role) };
      next();
    });

  /**
   * Staff routes (/api/admin): an active staff grant with `permission`, plus a second factor
   * completed in this session within STAFF_SECOND_FACTOR_MAX_AGE_MINUTES, unless
   * STAFF_MFA_REQUIRED is off (development and tests).
   */
  const requireStaff = (permission: StaffPermission) =>
    declare(`staff:${permission}`, async (req, res, next) => {
      const identity = await identify(req);
      if (!identity) {
        refuse(res, 401, "Authentication required");
        return;
      }
      const staff = await loadStaff(db, identity);
      if (!staff || !staffPermissions(staff.role).includes(permission)) {
        refuse(res, 403, "Staff access required", "forbidden");
        return;
      }
      const factorAge = identity.secondFactorAgeMinutes;
      if (
        env.STAFF_MFA_REQUIRED &&
        (factorAge === null || factorAge > STAFF_SECOND_FACTOR_MAX_AGE_MINUTES)
      ) {
        refuse(
          res,
          403,
          "Staff must have signed in with a second factor in the last 12 hours",
          "second_factor_required"
        );
        return;
      }
      req.staff = { id: staff.id, role: staff.role, permissions: staffPermissions(staff.role) };
      next();
    });

  return { signedIn, requireOrg, requireStaff };
}

declare global {
  namespace Express {
    interface Request {
      /** The signed-in person (signedIn, requireOrg). */
      user?: User;
      /**
       * Who the session says they are (signedIn, requireOrg). `user` is our copy of their email
       * and name; `identity.profile()` asks the provider for the current ones.
       */
      identity?: Identity;
      /** The org the request acts in and the person's role there (requireOrg). */
      ctx?: { org: Org; role: OrgRole; permissions: readonly OrgPermission[] };
      /** The staff member's grant (requireStaff). */
      staff?: { id: string; role: StaffRole; permissions: readonly StaffPermission[] };
    }
  }
}
