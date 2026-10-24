import type { Db } from "@repo/db";
import { orgsTable } from "@repo/db/schema";
import { eq } from "drizzle-orm";

// An org's handle is its address, /o/<handle>: 3–40 lowercase letters, digits and single
// hyphens, chosen at creation and fixed after.

/**
 * Words no org may take: the web app's own paths, and ones a public area might want later, so a
 * handle can become a public address without clashing (docs/ARCHITECTURE.md, "What the template
 * assumes"). Migration 0006 holds a copy for the backfill; add here, not there.
 */
const RESERVED_HANDLES: ReadonlySet<string> = new Set([
  "about",
  "account",
  "admin",
  "api",
  "app",
  "assets",
  "billing",
  "docs",
  "explore",
  "help",
  "home",
  "invite",
  "login",
  "logout",
  "new",
  "orgs",
  "privacy",
  "public",
  "search",
  "settings",
  "sign-in",
  "sign-out",
  "sign-up",
  "static",
  "status",
  "support",
  "terms",
  "www",
]);

export type HandleProblem = "invalid" | "reserved";

/** Why `handle` (already lowercased) can't be chosen, if it can't; whether it's taken aside. */
export function handleProblem(handle: string): HandleProblem | undefined {
  if (handle.length < 3 || handle.length > 40 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(handle)) {
    return "invalid";
  }
  if (RESERVED_HANDLES.has(handle)) return "reserved";
  return undefined;
}

export const HANDLE_PROBLEM_MESSAGES: Record<HandleProblem, string> = {
  invalid: "Use 3–40 lowercase letters, digits and single hyphens, with no hyphen at either end",
  reserved: "That handle is reserved",
};

export const HANDLE_TAKEN = { error: "That handle is taken", code: "handle_taken" } as const;

/** Whether an org already has `handle`. */
export async function handleTaken(db: Pick<Db, "select">, handle: string): Promise<boolean> {
  const [taken] = await db
    .select({ id: orgsTable.id })
    .from(orgsTable)
    .where(eq(orgsTable.handle, handle))
    .limit(1);
  return Boolean(taken);
}

/**
 * A handle suggested by an org's name: "Acme, Inc." becomes "acme-inc". Too short or reserved
 * gains "-org"; a name with no letters or digits gives "org". Migration 0006 does the same in SQL.
 */
export function handleFromName(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36)
    .replace(/-+$/, "");
  if (!base) return "org";
  return base.length < 3 || RESERVED_HANDLES.has(base) ? `${base}-org` : base;
}

/** The name's handle, or with -2, -3… if taken. */
export async function freeHandle(db: Pick<Db, "select">, name: string): Promise<string> {
  const base = handleFromName(name);
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    if (!(await handleTaken(db, candidate))) return candidate;
  }
}
