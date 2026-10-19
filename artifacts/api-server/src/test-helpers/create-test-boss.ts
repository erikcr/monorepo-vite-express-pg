import type { PGlite } from "@electric-sql/pglite";
import { PgBoss } from "pg-boss";
import { createQueues } from "../jobs/queue.js";

/** pg-boss running on an in-process PGlite database (share the client with createTestDb). */
export async function createTestBoss(client: PGlite): Promise<PgBoss> {
  const boss = new PgBoss({
    db: {
      // pg-boss needs the rows of every statement when it sends multi-statement SQL.
      executeSql: async (text: string, values?: unknown[]) =>
        values?.length
          ? client.query(text, values)
          : { rows: (await client.exec(text)).flatMap((r) => r.rows) },
    },
  });
  await boss.start();
  await createQueues(boss);
  return boss;
}
