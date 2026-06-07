import { useGetHealth, useListExamples } from "@repo/api-client-react";

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

export default function App() {
  const { data: health, isLoading: healthLoading, isError: healthError } = useGetHealth();
  const { data: examples, isLoading: examplesLoading, error: examplesError } = useListExamples();

  const apiOk = !healthLoading && !healthError && health?.status === "ok";
  const dbOk = health?.db === "ok";

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
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
              label="Records"
              value={examplesLoading ? "…" : (examples?.length ?? "—")}
              sub="example table"
            />
            <StatCard label="Org filter" value="none" sub="set orgId to filter" />
          </div>
        </section>

        {/* Example table */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-3">
            Example records
          </h2>
          <div className="bg-surface-raised border border-border rounded-card overflow-hidden">
            {examplesLoading && <p className="text-sm text-text-muted p-4">Loading…</p>}
            {!!examplesError && (
              <p className="text-sm text-destructive p-4">
                Failed to load: {String(examplesError)}
              </p>
            )}
            {!examplesLoading && !examplesError && (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-text-muted text-xs uppercase tracking-wide">
                    <th className="px-4 py-2.5 font-medium">ID</th>
                    <th className="px-4 py-2.5 font-medium">Org</th>
                    <th className="px-4 py-2.5 font-medium">Name</th>
                    <th className="px-4 py-2.5 font-medium">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {examples?.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-4 text-text-muted text-center">
                        No records. Run <code className="font-mono text-xs">pnpm db:seed</code> to
                        add sample data.
                      </td>
                    </tr>
                  )}
                  {examples?.map((item) => (
                    <tr key={item.id} className="border-b border-border-subtle last:border-0">
                      <td className="px-4 py-2.5 font-mono text-xs text-text-muted truncate max-w-[8rem]">
                        {item.id}
                      </td>
                      <td className="px-4 py-2.5">{item.orgId}</td>
                      <td className="px-4 py-2.5">{item.name}</td>
                      <td className="px-4 py-2.5 text-text-muted">
                        {new Date(item.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
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
