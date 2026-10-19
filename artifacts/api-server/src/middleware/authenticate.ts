import type { RequestHandler } from "express";
import { type Identity, verifySession } from "../lib/identity.js";

/**
 * Requires a signed-in session: reads `Authorization: Bearer <session token>`, verifies it, and
 * sets `req.identity`. Answers 401 otherwise. Says who the person is, not what they may do:
 * that's requireOrg / signedIn / requireStaff (src/middleware/access.ts).
 */
export const authenticate: RequestHandler = async (req, res, next) => {
  const header = req.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  const identity = token ? await verifySession(token) : null;
  if (!identity) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  req.identity = identity;
  next();
};

declare global {
  namespace Express {
    interface Request {
      /** Set by `authenticate`. */
      identity?: Identity;
    }
  }
}
