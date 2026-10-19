import { Component, type ErrorInfo, type ReactNode } from "react";
import { reportClientError } from "./index.js";

export type AppName = "web" | "admin";

// Field limits match the API's ClientErrorReport schema, so reports are trimmed, not rejected.
const clip = (text: string | undefined, max: number) => text?.slice(0, max);
const MAX_REPORTS_PER_PAGE = 10; // a render loop must not flood the API
let sent = 0;

/** Sends a crash report to POST /api/client-errors. Never throws; drops reports past the cap. */
export function reportError(app: AppName, error: unknown, componentStack?: string | null): void {
  if (sent >= MAX_REPORTS_PER_PAGE) return;
  sent++;
  const err = error instanceof Error ? error : new Error(String(error));
  reportClientError({
    app,
    message: clip(err.message || "Unknown error", 2000) ?? "Unknown error",
    stack: clip(err.stack, 10_000),
    componentStack: clip(componentStack ?? undefined, 10_000),
    url: clip(globalThis.location?.href, 2000),
  }).catch(() => {}); // reporting must never cause another error
}

/** Reports uncaught errors and unhandled promise rejections. Returns a cleanup function. */
export function installGlobalErrorReporting(app: AppName): () => void {
  const onError = (event: ErrorEvent) => reportError(app, event.error ?? event.message);
  const onRejection = (event: PromiseRejectionEvent) => reportError(app, event.reason);
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}

/** Catches render errors outside the router (routes have the router's error component), reports
 * them, and renders `fallback` instead of a blank page. */
export class ErrorBoundary extends Component<
  { app: AppName; fallback: (error: unknown) => ReactNode; children: ReactNode },
  { error: unknown }
> {
  state = { error: undefined as unknown };

  static getDerivedStateFromError(error: unknown) {
    return { error: error ?? new Error("Unknown error") };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    reportError(this.props.app, error, info.componentStack);
  }

  render() {
    return this.state.error !== undefined
      ? this.props.fallback(this.state.error)
      : this.props.children;
  }
}
