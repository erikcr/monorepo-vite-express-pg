-- orgs gain a handle, their address (/o/<handle>). Existing orgs get one from their name, as the
-- API's handleFromName() makes it, with -2, -3… for repeats, oldest first. (Hand-edited: the
-- backfill. The reserved words are a copy of RESERVED_HANDLES in the API's src/lib/handles.ts.)
ALTER TABLE "orgs" ADD COLUMN "handle" text;--> statement-breakpoint
ALTER TABLE "orgs" ADD CONSTRAINT "orgs_handle_unique" UNIQUE("handle");--> statement-breakpoint
DO $$
DECLARE
  o record;
  base text;
  candidate text;
  n integer;
BEGIN
  FOR o IN SELECT id, name FROM orgs WHERE handle IS NULL ORDER BY created_at, id LOOP
    base := regexp_replace(lower(o.name), '[^a-z0-9]+', '-', 'g');
    base := regexp_replace(left(trim(both '-' from base), 36), '-+$', '');
    IF base = '' THEN
      base := 'org';
    ELSIF length(base) < 3 OR base IN (
      'about', 'account', 'admin', 'api', 'app', 'assets', 'billing', 'docs', 'explore', 'help',
      'home', 'invite', 'login', 'logout', 'new', 'orgs', 'privacy', 'public', 'search',
      'settings', 'sign-in', 'sign-out', 'sign-up', 'static', 'status', 'support', 'terms', 'www'
    ) THEN
      base := base || '-org';
    END IF;
    candidate := base;
    n := 1;
    WHILE EXISTS (SELECT 1 FROM orgs WHERE handle = candidate) LOOP
      n := n + 1;
      candidate := base || '-' || n;
    END LOOP;
    UPDATE orgs SET handle = candidate WHERE id = o.id;
  END LOOP;
END $$;
