ALTER TABLE "org_invitations" DROP CONSTRAINT "org_invitations_invited_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "org_invitations" ADD CONSTRAINT "org_invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;