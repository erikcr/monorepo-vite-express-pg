// Shown instead of a blank page when rendering fails. The error has already been reported.
export function CrashScreen({ onRetry }: { onRetry?: () => void }) {
  return (
    <main className="px-page-x py-page-y max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Something went wrong</h1>
      <p className="text-text-muted text-sm mb-4">
        The error has been reported. Try again, or reload the page.
      </p>
      <button
        type="button"
        onClick={onRetry ?? (() => window.location.reload())}
        className="bg-brand text-brand-fg rounded-button px-4 py-2 text-sm"
      >
        {onRetry ? "Try again" : "Reload"}
      </button>
    </main>
  );
}
