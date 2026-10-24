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
export const RESERVED_HANDLES: ReadonlySet<string> = new Set([
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
    const [taken] = await db
      .select({ id: orgsTable.id })
      .from(orgsTable)
      .where(eq(orgsTable.handle, candidate))
      .limit(1);
    if (!taken) return candidate;
  }
}
