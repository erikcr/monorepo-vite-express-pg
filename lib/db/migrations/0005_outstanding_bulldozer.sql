ALTER TABLE "users" ADD COLUMN "invitations_sent" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "invitations_window_start" timestamp (3) with time zone;