import { useGetHealth } from "@repo/api-client-react";
import { Card, Page, PageTitle } from "../components/ui.tsx";

// Labelled for screen readers (and tests): the color alone doesn't say which state it is.
function StatusDot({ ok, label }: { ok: boolean | undefined; label: string }) {
  const state = ok === undefined ? "unknown" : ok ? "ok" : "error";
  const color = ok === undefined ? "bg-border" : ok ? "bg-success" : "bg-destructive";
  return (
    <span
      role="img"
      aria-label={`${label}: ${state}`}
      className={`inline-block w-2 h-2 rounded-full ${color}`}
    />
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

export function HomePage() {
  const { data, isLoading, isError } = useGetHealth();

  const apiOk = !isLoading && !isError && data?.status === "ok";
  const dbOk = data?.db === "ok";

  return (
    <Page className="space-y-6">
      <PageTitle description="React 19 + Vite + Express 5 + PostgreSQL">
        Monorepo Template
      </PageTitle>

      <Card title="Status">
        <ul className="space-y-3">
          <li className="flex items-center gap-3">
            <StatusDot ok={apiOk} label="API server" />
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
            <StatusDot ok={apiOk ? dbOk : undefined} label="Database" />
            <span className="text-sm">Database</span>
          </li>
        </ul>
      </Card>

      <Card title="Theme tokens">
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
      </Card>
    </Page>
  );
}
