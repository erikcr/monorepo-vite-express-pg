import { useGetHealth } from "@repo/api-client-react";

function StatusDot({ ok }: { ok: boolean | undefined }) {
  if (ok === undefined) return <span className="inline-block w-2 h-2 rounded-full bg-border" />;
  return (
    <span className={`inline-block w-2 h-2 rounded-full ${ok ? "bg-success" : "bg-destructive"}`} />
  );
}

const swatches: { label: string; bg: string; text: string }[] = [
  { label: "brand", bg: "bg-brand", text: "text-brand-fg" },
  { label: "brand-subtle", bg: "bg-brand-subtle", text: "text-text" },
  { label: "surface", bg: "bg-surface border border-border", text: "text-text" },
  { label: "surface-raised", bg: "bg-surface-raised border border-border", text: "text-text" },
  { label: "success", bg: "bg-success", text: "text-success-fg" },
  { label: "destructive", bg: "bg-destructive", text: "text-destructive-fg" },
  { label: "warning", bg: "bg-warning", text: "text-warning-fg" },
];

export default function App() {
  const { data, isLoading, isError } = useGetHealth();

  const apiOk = !isLoading && !isError && data?.status === "ok";
  const dbOk = data?.db === "ok";

  return (
    <main className="min-h-screen px-page-x py-page-y max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">Monorepo Template</h1>
      <p className="text-text-muted mb-8 text-sm">React 19 + Vite + Express 5 + PostgreSQL</p>

      {/* Status */}
      <section className="bg-surface-raised border border-border rounded-card p-5 mb-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted mb-4">
          Status
        </h2>
        <ul className="space-y-3">
          <li className="flex items-center gap-3">
            <StatusDot ok={apiOk} />
            <span className="text-sm">
              API server
              {isLoading && <span className="text-text-muted ml-2">checking…</span>}
              {data?.ts && (
                <span className="text-text-muted ml-2">
                  last ok {new Date(data.ts).toLocaleTimeString()}
                </span>
              )}
            </span>
          </li>
          <li className="flex items-center gap-3">
            <StatusDot ok={apiOk ? dbOk : undefined} />
            <span className="text-sm">Database</span>
          </li>
        </ul>
      </section>

      {/* Theme preview */}
      <section className="bg-surface-raised border border-border rounded-card p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted mb-4">
          Theme tokens
        </h2>
        <div className="flex flex-wrap gap-2">
          {swatches.map(({ label, bg, text }) => (
            <div key={label} className={`${bg} ${text} rounded-button px-3 py-1 text-xs font-mono`}>
              {label}
            </div>
          ))}
        </div>
        <p className="text-text-muted text-xs mt-4">
          Edit <code className="font-mono">src/index.css</code> to change the brand color. Run{" "}
          <code className="font-mono">/new-project</code> to set brand + project scope.
        </p>
      </section>
    </main>
  );
}
