import { randomUUID } from "node:crypto";
import type { Db } from "@repo/db";
import { usersTable } from "@repo/db/schema";

/**
 * A real failed-query error from drizzle (a duplicate insert), which quotes the values it was
 * sent, `secret` among them, in its message and stack. The secret is made at run time: Sentry
 * attaches the source lines around each stack frame, so a literal in a test would show up there.
 */
export async function failedQuery(db: Db): Promise<{ queryError: Error; secret: string }> {
  const secret = `${randomUUID()}@x.test`;
  const row = { clerkUserId: `user_${randomUUID()}`, email: secret };
  await db.insert(usersTable).values(row);
  const queryError = await db
    .insert(usersTable)
    .values(row)
    .then(
      () => null,
      (e: unknown) => e
    );
  if (!(queryError instanceof Error) || !queryError.message.includes(secret)) {
    throw new Error(
      "expected drizzle's error to quote the values: the tests using it prove nothing"
    );
  }
  return { queryError, secret };
}
