import { env } from "@repo/env";
import * as Sentry from "@sentry/node";

// Error tracking (Sentry), on only when SENTRY_DSN is set; otherwise errors are only logged. The
// browser apps report their crashes to POST /api/client-errors, which forwards them here, so one
// DSN covers the API, its jobs and both sites. Sentry gets the error, its stack and what is passed
// in `context`: never the request's headers, body, query string or IP address.

export interface ErrorContext {
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
}

/** Starts Sentry if SENTRY_DSN is set; `options` are for tests. Returns whether it started. */
export function initErrorTracker(options: Sentry.NodeOptions = {}): boolean {
  const dsn = env.SENTRY_DSN;
  if (!dsn) return false;
  Sentry.init({
    dsn,
    environment: env.DEPLOY_ENVIRONMENT,
    release: env.COMMIT_SHA ?? undefined,
    // Collect nothing about requests or users (Sentry's default collects all of it)...
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
    },
    // ...and an explicit integration list instead of Sentry's defaults, which attach the request
    // and record logs and outgoing URLs as breadcrumbs.
    defaultIntegrations: false,
    integrations: [
      Sentry.eventFiltersIntegration(),
      Sentry.functionToStringIntegration(),
      Sentry.linkedErrorsIntegration(),
      Sentry.dedupeIntegration(),
      Sentry.contextLinesIntegration(),
      Sentry.nodeContextIntegration(),
      Sentry.onUncaughtExceptionIntegration(),
      Sentry.onUnhandledRejectionIntegration(),
    ],
    ...options,
  });
  return true;
}

/**
 * An error as it's safe to keep. Drizzle's failed-query error quotes every bound value in its
 * message and stack and carries them as `params`: emails, names, whatever the row held. This keeps
 * Postgres's reason and the query text, which holds only placeholders; any other error passes
 * through. Takes a live error or one pino has already serialized (pino-http hands its error
 * serializer that), since logs, Sentry and pg-boss's job rows all go through it.
 */
export function withoutQueryValues(err: unknown): unknown {
  if (typeof err !== "object" || err === null || !("params" in err) || !("query" in err)) {
    return err;
  }
  const { message, stack, query, params, cause } = err as {
    message?: unknown;
    stack?: unknown;
    query: unknown;
    params: unknown;
    cause?: { message?: unknown };
  };
  // Postgres's reason is a live error's cause. pino drops the cause when it serializes one and
  // appends its message to drizzle's ("Failed query: <query>\nparams: <values>: <reason>").
  const quoted = `Failed query: ${String(query)}\nparams: ${String(params)}: `;
  const reason =
    typeof cause?.message === "string"
      ? cause.message
      : typeof message === "string" && message.startsWith(quoted)
        ? message.slice(quoted.length)
        : "Query failed";
  const safe = new Error(`${reason}: ${String(query)}`);
  // The old stack's frames say where it failed; its message lines are what quoted the values.
  if (typeof stack === "string") {
    const frames = stack.split("\n").filter((line) => /^\s+at /.test(line));
    safe.stack = [`Error: ${safe.message}`, ...frames].join("\n");
  }
  return safe;
}

/** Reports an error to Sentry, if it's on, without the values a failed query carried. */
export function trackError(err: unknown, context: ErrorContext = {}): void {
  if (!Sentry.isInitialized()) return;
  Sentry.captureException(withoutQueryValues(err), { tags: context.tags, extra: context.extra });
}

/** A browser crash report as POST /api/client-errors receives it. */
export interface ClientErrorReport {
  app: string;
  message: string;
  stack?: string;
  componentStack?: string;
  /** The page's path, without query string or fragment. */
  path?: string;
}

/** Reports a browser crash, rebuilt as an Error so Sentry groups it by its stack. */
export function trackClientError(report: ClientErrorReport): void {
  const err = new Error(report.message);
  // The stack's first line names the error's type ("TypeError: …").
  err.name = /^(\w*Error)\b/.exec(report.stack ?? "")?.[1] ?? "Error";
  if (report.stack) err.stack = report.stack;
  trackError(err, {
    tags: { source: "browser", app: report.app, ...(report.path ? { path: report.path } : {}) },
    extra: report.componentStack ? { componentStack: report.componentStack } : {},
  });
}

/** Sends queued reports; called on shutdown so the last errors aren't lost. */
export async function flushErrorTracker(timeoutMs = 2000): Promise<void> {
  await Sentry.flush(timeoutMs);
}
