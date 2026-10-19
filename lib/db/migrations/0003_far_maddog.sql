-- example.org_id becomes a real reference to orgs. Rows from before orgs existed carry free-text
-- ids ("org_1") that match no org: they were demo/test data, so they're removed rather than
-- converted. (Hand-edited: drizzle-kit's plain type change would fail on those values.)
DELETE FROM "example";--> statement-breakpoint
ALTER TABLE "example" ALTER COLUMN "org_id" SET DATA TYPE uuid USING "org_id"::uuid;--> statement-breakpoint
ALTER TABLE "example" ADD CONSTRAINT "example_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
