import { useGetHealth, useListAdminOrgsInfinite } from "@repo/api-client-react";
import { getRouteApi } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { StaffRequired } from "./StaffRequired.tsx";

const route = getRouteApi("/");

function StatusBadge({ ok, loading }: { ok: boolean | undefined; loading?: boolean }) {
  if (loading) return <span className="text-xs text-text-muted">checking…</span>;
  if (ok === undefined) return <span className="text-xs text-text-muted">—</span>;
  return ok ? (
    <span className="text-xs font-medium text-success">OK</span>
  ) : (
    <span className="text-xs font-medium text-destructive">Error</span>
  );
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return (
    <div className="bg-surface-raised border border-border rounded-card p-4">
      <p className="text-xs text-text-muted uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
      {sub && <p className="text-xs text-text-muted mt-1">{sub}</p>}
    </div>
  );
}

const swatches: { label: string; bg: string; fg: string }[] = [
  { label: "brand", bg: "bg-brand", fg: "text-brand-fg" },
  { label: "success", bg: "bg-success", fg: "text-success-fg" },
  { label: "destructive", bg: "bg-destructive", fg: "text-destructive-fg" },
  { label: "warning", bg: "bg-warning", fg: "text-warning-fg" },
];

export function DashboardPage() {
  const { data: health, isLoading: healthLoading, isError: healthError } = useGetHealth();
  // The org search lives in the URL (?q=…), validated by the route's search schema.
  const { q = "" } = route.useSearch();
  const navigate = route.useNavigate();
  const [search, setSearch] = useState(q);
  // Write the search to the URL once typing pauses, not on every keystroke.
  useEffect(() => {
    if (search === q) return;
    const timer = setTimeout(
      () => navigate({ search: search ? { q: search } : {}, replace: true }),
      300
    );
    return () => clearTimeout(timer);
  }, [search, q, navigate]);

  const orgs = useListAdminOrgsInfinite(q ? { q } : {}, {
    query: { getNextPageParam: (page) => page.nextCursor ?? undefined },
  });
  const items = orgs.data?.pages.flatMap((page) => page.items);

  const apiOk = !healthLoading && !healthError && health?.status === "ok";
  const dbOk = health?.db === "ok";

  // Signed in but not staff (or no second factor): explain, rather than show an empty table.
  if (orgs.error?.status === 403) return <StaffRequired code={orgs.error.code} />;

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-border bg-surface-raised px-page-x py-4 flex items-center justify-between">
        <div>
          <h1 className="font-semibold">Admin Dashboard</h1>
          <p className="text-xs text-text-muted">Internal use only</p>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1.5">
            <span
              className={`inline-block w-1.5 h-1.5 rounded-full ${apiOk ? "bg-success" : healthLoading ? "bg-border" : "bg-destructive"}`}
            />
            API
            <StatusBadge ok={apiOk} loading={healthLoading} />
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className={`inline-block w-1.5 h-1.5 rounded-full ${!apiOk ? "bg-border" : dbOk ? "bg-success" : "bg-destructive"}`}
            />
            DB
            <StatusBadge ok={apiOk ? dbOk : undefined} loading={healthLoading} />
          </span>
        </div>
      </header>

      <main className="px-page-x py-page-y space-y-8">
        {/* Stats */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-3">
            Overview
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <StatCard
              label="API"
              value={<StatusBadge ok={apiOk} loading={healthLoading} />}
              sub={health?.ts ? `Last ok ${new Date(health.ts).toLocaleTimeString()}` : undefined}
            />
            <StatCard
              label="Database"
              value={<StatusBadge ok={apiOk ? dbOk : undefined} loading={healthLoading} />}
            />
            <StatCard
              label="Organizations"
              value={
                orgs.isLoading ? "…" : items ? `${items.length}${orgs.hasNextPage ? "+" : ""}` : "—"
              }
              sub={q ? `matching "${q}"` : "loaded"}
            />
          </div>
        </section>

        {/* Orgs table */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
              Organizations
            </h2>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name"
              aria-label="Search organizations"
              className="bg-surface border border-border rounded-input px-2 py-1 text-xs text-text"
            />
          </div>
          <div className="bg-surface-raised border border-border rounded-card overflow-hidden">
            {orgs.isLoading && <p className="text-sm text-text-muted p-4">Loading…</p>}
            {orgs.error && (
              <p className="text-sm text-destructive p-4">Failed to load: {orgs.error.message}</p>
            )}
            {!orgs.isLoading && !orgs.error && (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-text-muted text-xs uppercase tracking-wide">
                    <th className="px-4 py-2.5 font-medium">Name</th>
                    <th className="px-4 py-2.5 font-medium">Members</th>
                    <th className="px-4 py-2.5 font-medium">Created</th>
                    <th className="px-4 py-2.5 font-medium">ID</th>
                  </tr>
                </thead>
                <tbody>
                  {items?.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-4 text-text-muted text-center">
                        {q ? "No organizations match." : "No organizations yet."}
                      </td>
                    </tr>
                  )}
                  {items?.map((org) => (
                    <tr key={org.id} className="border-b border-border-subtle last:border-0">
                      <td className="px-4 py-2.5">{org.name}</td>
                      <td className="px-4 py-2.5">{org.memberCount}</td>
                      <td className="px-4 py-2.5 text-text-muted">
                        {new Date(org.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-text-muted truncate max-w-32">
                        {org.id}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {orgs.hasNextPage && (
            <button
              type="button"
              onClick={() => orgs.fetchNextPage()}
              disabled={orgs.isFetchingNextPage}
              className="mt-3 bg-brand text-brand-fg rounded-button px-3 py-1.5 text-xs disabled:opacity-50"
            >
              {orgs.isFetchingNextPage ? "Loading…" : "Load more"}
            </button>
          )}
        </section>

        {/* Theme tokens */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-3">
            Theme tokens
          </h2>
          <div className="flex flex-wrap gap-2">
            {swatches.map(({ label, bg, fg }) => (
              <div
                key={label}
                className={`${bg} ${fg} rounded-button px-3 py-1.5 text-xs font-mono`}
              >
                {label}
              </div>
            ))}
            <div className="bg-surface border border-border text-text rounded-button px-3 py-1.5 text-xs font-mono">
              surface
            </div>
            <div className="bg-surface-raised border border-border text-text rounded-button px-3 py-1.5 text-xs font-mono">
              surface-raised
            </div>
          </div>
          <p className="text-text-muted text-xs mt-3">
            Edit <code className="font-mono">src/index.css</code> to change colors. Run{" "}
            <code className="font-mono">/new-project</code> to set brand color + project scope.
          </p>
        </section>
      </main>
    </div>
  );
}
