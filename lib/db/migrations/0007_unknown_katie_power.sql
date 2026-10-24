-- orgs.handle becomes NOT NULL. First, a handle for any org still without one (created by the API
-- that ran during 0006's deploy, before it set handles), made as 0006 made them. (Hand-edited: the
-- backfill.)
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
END $$;--> statement-breakpoint
ALTER TABLE "orgs" ALTER COLUMN "handle" SET NOT NULL;
