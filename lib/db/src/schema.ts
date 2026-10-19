import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Timestamps use millisecond precision so they round-trip exactly through JS Dates and JSON
// (keyset pagination cursors depend on it).
export const exampleTable = pgTable("example", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: text("org_id").notNull(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
});

export type Example = typeof exampleTable.$inferSelect;
export type NewExample = typeof exampleTable.$inferInsert;
